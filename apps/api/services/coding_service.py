from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from sqlmodel import Session, select

from models.database import CodingDeckConfig, CodingReviewItem, ProgrammingFlashcard, ProgrammingTopic
from schemas.schemas import CodingReviewCardSchema, TopicAIContentSchema
from services import fsrs_service
from services.fsrs_service import CardState, DeckOptions, parse_steps
from services.phrase_generator_service import AIProviderConfig, PhraseGenerationService

_phrase_service = PhraseGenerationService()

VALID_TOPIC_STATUSES = {"not_started", "studied", "mastered"}


# ── SM-2 helpers ──────────────────────────────────────────────────────────────

def compute_coding_review_priority(item: CodingReviewItem, now: datetime | None = None) -> float:
    now = now or datetime.utcnow()
    overdue_hours = 0.0
    if item.next_review <= now:
        overdue_hours = (now - item.next_review).total_seconds() / 3600
    return (
        item.difficulty_score * 5
        + item.error_count * 1.8
        + max(item.attempt_count - item.correct_count, 0) * 0.5
        + min(overdue_hours, 12)
        - item.streak * 0.35
    )


_REVIEW_SCHEDULE_HOURS = [4, 12, 24, 72, 168]


def register_coding_review_attempt(
    session: Session,
    child_id: int,
    review_item_id: int,
    correct: bool = True,
    rating: str | None = None,
) -> CodingReviewItem:
    item = session.get(CodingReviewItem, review_item_id)
    if item is None or item.child_id != child_id:
        raise ValueError(f"CodingReviewItem {review_item_id} not found for child {child_id}")
    now = datetime.utcnow()
    item.last_reviewed = now
    item.attempt_count += 1
    effective = rating or ("knew" if correct else "unknown")
    if effective == "knew":
        item.correct_count += 1
        item.streak += 1
        item.difficulty_score = max(
            0.1,
            item.difficulty_score - 0.12 - min(item.streak, 3) * 0.03,
        )
        base_hours = _REVIEW_SCHEDULE_HOURS[min(item.streak - 1, len(_REVIEW_SCHEDULE_HOURS) - 1)]
        spacing_multiplier = max(0.5, 1.15 - item.difficulty_score)
        item.next_review = now + timedelta(hours=base_hours * spacing_multiplier)
    elif effective == "partial":
        # Parcial/duvida: nao zera o streak nem conta acerto; fica um pouco
        # mais dificil e volta cedo (~1/3 do intervalo de quem sabia).
        item.difficulty_score = min(1.0, item.difficulty_score + 0.08)
        base_hours = _REVIEW_SCHEDULE_HOURS[min(max(item.streak, 1) - 1, len(_REVIEW_SCHEDULE_HOURS) - 1)]
        item.next_review = now + timedelta(hours=max(2.0, base_hours * 0.35))
    else:
        item.error_count += 1
        item.streak = 0
        item.difficulty_score = min(1.0, item.difficulty_score + 0.25)
        retry_minutes = 5 if item.error_count >= 3 else 15
        item.next_review = now + timedelta(minutes=retry_minutes)
    session.add(item)
    return item


def build_coding_review_cards(
    session: Session,
    child_id: int,
    subject_id: int | None = None,
    limit: int = 20,
) -> list[CodingReviewCardSchema]:
    now = datetime.utcnow()
    items = session.exec(
        select(CodingReviewItem).where(
            CodingReviewItem.child_id == child_id,
            CodingReviewItem.next_review <= now,
        )
    ).all()
    if subject_id is not None:
        filtered = []
        for item in items:
            fc = session.get(ProgrammingFlashcard, item.flashcard_id)
            if fc and fc.subject_id == subject_id:
                filtered.append(item)
        items = filtered
    items_sorted = sorted(items, key=lambda i: compute_coding_review_priority(i, now), reverse=True)
    cards: list[CodingReviewCardSchema] = []
    for item in items_sorted[:limit]:
        fc = session.get(ProgrammingFlashcard, item.flashcard_id)
        if fc is None:
            continue
        cards.append(
            CodingReviewCardSchema(
                review_item_id=item.id or 0,
                flashcard_id=fc.id or 0,
                subject_id=fc.subject_id,
                front=fc.front,
                back=fc.back,
                code_example=fc.code_example,
                difficulty_score=item.difficulty_score,
                error_count=item.error_count,
            )
        )
    return cards


def count_due_coding_items(session: Session, child_id: int, subject_id: int | None = None) -> int:
    return len(build_coding_review_cards(session, child_id, subject_id=subject_id, limit=10_000))


def seed_coding_review_item(session: Session, child_id: int, flashcard_id: int) -> CodingReviewItem:
    existing = session.exec(
        select(CodingReviewItem).where(
            CodingReviewItem.child_id == child_id,
            CodingReviewItem.flashcard_id == flashcard_id,
        )
    ).first()
    if existing:
        return existing
    item = CodingReviewItem(
        flashcard_id=flashcard_id,
        child_id=child_id,
        next_review=datetime.utcnow(),
    )
    session.add(item)
    return item


# ── Flashcard deck (Anki-style FSRS scheduling) ────────────────────────────────

RATING_TO_GRADE = {"again": 1, "hard": 2, "good": 3, "easy": 4}


def get_or_create_deck_config(session: Session, child_id: int, subject_id: int) -> CodingDeckConfig:
    config = session.exec(
        select(CodingDeckConfig).where(
            CodingDeckConfig.child_id == child_id,
            CodingDeckConfig.subject_id == subject_id,
        )
    ).first()
    if config is None:
        config = CodingDeckConfig(child_id=child_id, subject_id=subject_id)
        session.add(config)
        session.flush()
    return config


def reset_daily_counters(config: CodingDeckConfig, today: date | None = None) -> CodingDeckConfig:
    today = today or date.today()
    if config.counter_date != today:
        config.counter_date = today
        config.new_done_today = 0
        config.reviews_done_today = 0
    return config


def deck_options(config: CodingDeckConfig) -> DeckOptions:
    return DeckOptions(
        learning_steps=parse_steps(config.learning_steps, (1.0, 10.0)),
        relearning_steps=parse_steps(config.relearning_steps, (10.0,)),
        graduating_interval=config.graduating_interval,
        easy_interval=config.easy_interval,
        desired_retention=config.desired_retention,
        maximum_interval=config.maximum_interval,
    )


def deck_weights(config: CodingDeckConfig) -> list[float] | None:
    return fsrs_service.parse_weights(getattr(config, "fsrs_parameters", "") or "")


def _card_state(item: CodingReviewItem) -> CardState:
    return CardState(
        state=item.fsrs_state or "new",
        stability=item.stability or 0.0,
        difficulty=item.fsrs_difficulty or 0.0,
        reps=item.reps or 0,
        lapses=item.lapses or 0,
        learning_step=item.learning_step or 0,
        scheduled_days=item.scheduled_days or 0,
        last_reviewed=item.last_reviewed,
    )


def _apply_state(item: CodingReviewItem, result: fsrs_service.ScheduleResult) -> None:
    state = result.state
    item.fsrs_state = state.state
    item.stability = state.stability
    item.fsrs_difficulty = state.difficulty
    item.reps = state.reps
    item.lapses = state.lapses
    item.learning_step = state.learning_step
    item.scheduled_days = state.scheduled_days
    item.next_review = result.due
    item.last_reviewed = result.state.last_reviewed or datetime.utcnow()


def _interval_label(item: CodingReviewItem, now: datetime) -> str:
    minutes = max((item.next_review - now).total_seconds() / 60.0, 0.0)
    return fsrs_service.format_interval(minutes)


def _subject_review_items(session: Session, child_id: int, subject_id: int):
    """Return (flashcard, topic, review_item) tuples for every card in a subject."""
    flashcards = session.exec(
        select(ProgrammingFlashcard).where(
            ProgrammingFlashcard.child_id == child_id,
            ProgrammingFlashcard.subject_id == subject_id,
        )
    ).all()
    rows = []
    topic_cache: dict[int, ProgrammingTopic | None] = {}
    for fc in flashcards:
        item = seed_coding_review_item(session, child_id, fc.id or 0)
        if fc.topic_id not in topic_cache:
            topic_cache[fc.topic_id] = session.get(ProgrammingTopic, fc.topic_id)
        rows.append((fc, topic_cache[fc.topic_id], item))
    return rows


def compute_deck_stats(rows, config: CodingDeckConfig, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    total = len(rows)
    new = learning = review_due = 0
    for _fc, _topic, item in rows:
        if getattr(item, "suspended", False):
            continue
        state = item.fsrs_state or "new"
        if state == "new" or (item.reps or 0) == 0:
            new += 1
        elif state in ("learning", "relearning"):
            learning += 1
        elif item.next_review <= now:
            review_due += 1
    new_left = max(0, config.new_per_day - config.new_done_today)
    reviews_left = max(0, config.max_reviews_per_day - config.reviews_done_today)
    return {
        "total": total,
        "new": new,
        "learning": learning,
        "review_due": review_due,
        "new_left_today": new_left,
        "reviews_left_today": reviews_left,
    }


def build_deck_queue(session: Session, child_id: int, subject_id: int, config: CodingDeckConfig, limit: int = 50):
    """Build a study queue respecting daily caps and learning steps (Anki-style)."""
    now = datetime.utcnow()
    rows = _subject_review_items(session, child_id, subject_id)
    new_left = max(0, config.new_per_day - config.new_done_today)
    reviews_left = max(0, config.max_reviews_per_day - config.reviews_done_today)

    learning_due, reviews, news = [], [], []
    for fc, topic, item in rows:
        if getattr(item, "suspended", False):
            continue
        state = item.fsrs_state or "new"
        if state == "new" or (item.reps or 0) == 0:
            news.append((fc, topic, item))
        elif state in ("learning", "relearning"):
            if item.next_review <= now:
                learning_due.append((fc, topic, item))
        elif item.next_review <= now:
            reviews.append((fc, topic, item))

    learning_due.sort(key=lambda r: r[2].next_review)
    reviews.sort(key=lambda r: compute_coding_review_priority(r[2], now), reverse=True)
    if getattr(config, "insertion_order", "sequential") == "random":
        import random
        random.shuffle(news)
    else:
        news.sort(key=lambda r: r[0].id or 0)

    # When new cards must respect the review limit, stop introducing them once
    # the daily review budget is exhausted (Anki "new cards ignore review limit").
    if not getattr(config, "new_cards_ignore_review_limit", False) and reviews_left <= 0:
        new_left = 0

    queue = learning_due + reviews[:reviews_left] + news[:new_left]
    return queue[:limit], rows


def preview_for_item(item: CodingReviewItem, config: CodingDeckConfig, now: datetime | None = None) -> dict:
    return fsrs_service.preview_intervals(_card_state(item), deck_options(config), now=now, w=deck_weights(config))


def apply_deck_attempt(
    session: Session, child_id: int, review_item_id: int, rating: str, config: CodingDeckConfig
) -> CodingReviewItem:
    item = session.get(CodingReviewItem, review_item_id)
    if item is None or item.child_id != child_id:
        raise ValueError(f"CodingReviewItem {review_item_id} not found for child {child_id}")
    grade = RATING_TO_GRADE.get(rating)
    if grade is None:
        raise ValueError(f"Invalid rating: {rating}")
    now = datetime.utcnow()
    pre_state = item.fsrs_state or "new"
    was_new = pre_state == "new" or (item.reps or 0) == 0

    result = fsrs_service.schedule(_card_state(item), grade, deck_options(config), now=now, w=deck_weights(config))
    _apply_state(item, result)
    # keep legacy fields roughly in sync for the old "Revisar" view
    item.attempt_count += 1
    item.last_rating = rating
    if rating == "again":
        item.error_count += 1
        item.streak = 0
    else:
        item.correct_count += 1
        item.streak += 1

    # Leech detection: a card lapsing too often gets tagged or suspended (Anki-style).
    threshold = getattr(config, "leech_threshold", 0) or 0
    if threshold > 0 and item.lapses >= threshold and not item.is_leech:
        item.is_leech = True
        if getattr(config, "leech_action", "tag") == "suspend":
            item.suspended = True

    reset_daily_counters(config, now.date())
    if was_new:
        config.new_done_today += 1
    elif pre_state == "review":
        config.reviews_done_today += 1
    config.updated_at = now
    session.add(item)
    session.add(config)
    return item


# ── AI generation ─────────────────────────────────────────────────────────────

_SYSTEM_TEXT = (
    "You are an expert programming educator. "
    "Return ONLY valid JSON with no markdown fences, no commentary, and no extra keys. "
    "The JSON must match the schema exactly."
)

_TOPIC_PROMPT_TEMPLATE = """\
Create educational content for a programming topic.

Subject: {subject_name}
Topic: {topic_title}

Return a JSON object with exactly this schema:
{{
  "sections": [
    {{ "title": "string", "body": "string (markdown-style text OK)", "code_example": "string or null" }}
  ],
  "quiz": [
    {{
      "id": 1,
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correct_option": "exact text of the correct option",
      "explanation": "string"
    }}
  ],
  "flashcards": [
    {{ "front": "string (concept or question, max 120 chars)", "back": "string (explanation, max 400 chars)", "code_example": "string or null" }}
  ]
}}

Rules:
- sections: 3 to 5 items (introduction, key concepts, code examples, when to use, common pitfalls)
- quiz: exactly 5 questions with 4 options each
- flashcards: 5 to 8 items covering key concepts
- All explanatory text in Portuguese (Brazil); code and technical identifiers stay in English
- code_example uses the programming language of the subject
{previous_context}"""


def generate_topic_ai_content(
    *,
    subject_name: str,
    topic_title: str,
    ai_config: AIProviderConfig,
    previous_context: str = "",
) -> TopicAIContentSchema:
    context_block = ""
    if previous_context.strip():
        context_block = (
            "\nStudy continuity (IMPORTANT):\n"
            f"{previous_context.strip()}\n"
            "- Build on what was already studied; briefly connect new concepts to previous topics\n"
            "- Do NOT re-teach content already covered; assume the student knows it\n"
        )
    prompt = _TOPIC_PROMPT_TEMPLATE.format(
        subject_name=subject_name,
        topic_title=topic_title,
        previous_context=context_block,
    )
    raw = _phrase_service.generate_json_text(
        system_text=_SYSTEM_TEXT,
        prompt=prompt,
        temperature=0.7,
        ai_config=ai_config,
    )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("IA retornou JSON inválido para o conteúdo do tópico.") from exc
    return TopicAIContentSchema.model_validate(data)


def build_topic_history_context(topics: list, exclude_topic_id: int | None = None) -> str:
    """Resumo dos topicos anteriores de uma materia, para a IA continuar a progressao."""
    history = [t for t in topics if t.id != exclude_topic_id]
    if not history:
        return ""
    lines: list[str] = []
    titles = ", ".join(t.title for t in history)
    lines.append(f"- Topics already created (in study order): {titles}")
    studied = [t.title for t in history if t.status in ("studied", "mastered")]
    if studied:
        lines.append(f"- Topics the student already finished studying: {', '.join(studied)}")
    last = history[-1]
    section_titles: list[str] = []
    if isinstance(last.ai_content, dict):
        section_titles = [
            str(s.get("title", "")).strip()
            for s in last.ai_content.get("sections", [])
            if isinstance(s, dict) and str(s.get("title", "")).strip()
        ][:6]
    if section_titles:
        lines.append(f'- The previous topic "{last.title}" covered: {"; ".join(section_titles)}')
    else:
        lines.append(f'- The previous topic was "{last.title}"')
    return "\n".join(lines)


# ── LeetCode trainer ──────────────────────────────────────────────────────────

_LEETCODE_PROMPT_TEMPLATE = """\
Create a study card about ONE method/technique for solving LeetCode problems.

Programming language: {language}
Methods the student ALREADY has (do NOT repeat any of these): {existing_names}
{hint_line}
Return a JSON object with exactly this schema:
{{
  "name": "string (technique name, e.g. 'Two Pointers', 'Sliding Window', 'Binary Search')",
  "category": "string (e.g. 'Array / String', 'Tree', 'Graph', 'Dynamic Programming')",
  "explanation": "string — o que e a tecnica, quando usar, como reconhecer que um problema pede ela (3-6 paragrafos curtos, em portugues do Brasil)",
  "code_example": "string — exemplo completo e comentado resolvendo um problema classico com essa tecnica",
  "example_output": "string — a saida exata do exemplo + um passo a passo curto de como o algoritmo chegou nela",
  "complexity_time": "string (e.g. 'O(n)')",
  "complexity_space": "string (e.g. 'O(1)')"
}}

Rules:
- Pick the most useful NEXT technique given what the student already has (progressive difficulty)
- explanation in Portuguese (Brazil); code, identifiers and technique names stay in English
- code_example must be runnable {language} code with brief comments in Portuguese
- example_output must show the real output of the code_example
"""


def generate_leetcode_method(
    *,
    existing_names: list[str],
    hint: str,
    language: str,
    ai_config: AIProviderConfig,
) -> dict:
    hint_line = f"Student request for this card: {hint.strip()}\n" if hint.strip() else ""
    prompt = _LEETCODE_PROMPT_TEMPLATE.format(
        language=language,
        existing_names=", ".join(existing_names) if existing_names else "none yet",
        hint_line=hint_line,
    )
    raw = _phrase_service.generate_json_text(
        system_text=_SYSTEM_TEXT,
        prompt=prompt,
        temperature=0.7,
        ai_config=ai_config,
    )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("IA retornou JSON inválido para o método LeetCode.") from exc
    name = str(data.get("name", "")).strip()[:200]
    if not name:
        raise RuntimeError("IA não retornou o nome do método.")
    return {
        "name": name,
        "category": str(data.get("category", "")).strip()[:80] or None,
        "explanation": str(data.get("explanation", "")).strip(),
        "code_example": str(data.get("code_example", "")).strip(),
        "example_output": str(data.get("example_output", "")).strip(),
        "complexity_time": str(data.get("complexity_time", "")).strip()[:60] or None,
        "complexity_space": str(data.get("complexity_space", "")).strip()[:60] or None,
    }
