"""Questions built from lesson content alone — no AI call, no credit spent.

The app's question banks were all born from a provider call, which put the child
one outage (or one exhausted daily credit) away from an empty screen. Everything
here is derived deterministically from the lesson the child already has, so a
lesson always carries practice with it:

* `build_offline_lesson_questions` feeds the spaced-repetition queue
  (`LessonQuestion`), the same rows the AI path writes.
* `build_offline_choice_questions` feeds "modo questoes" (`StudyQuestion`) with
  four-option multiple choice.
* `build_placement_questions` is the five-question onboarding test, which must
  work before the account has any content at all.

Determinism matters twice: the same lesson must not produce a different question
on every call (it would defeat the unique keys the callers rely on), and the
correct option must not always sit in the same place.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Iterable, Sequence


# Two questions per phrase is what a lesson of 8-10 items needs to fill a
# session without turning into a drill: recognising the phrase, and producing it.
MAX_OFFLINE_LESSON_QUESTIONS = 12
MAX_OFFLINE_CHOICE_QUESTIONS = 12
OPTIONS_PER_QUESTION = 4

# Fallback distractors for a lesson too small to supply three of its own. They
# are ordinary words a beginner meets early, so a wrong option still reads as a
# plausible answer rather than as filler.
_FALLBACK_PT_DISTRACTORS = (
    "a casa",
    "o livro",
    "a agua",
    "o amigo",
    "a escola",
    "o dia",
    "a comida",
    "o jogo",
)
_FALLBACK_EN_DISTRACTORS = (
    "the house",
    "the book",
    "the water",
    "the friend",
    "the school",
    "the day",
    "the food",
    "the game",
)


@dataclass(frozen=True)
class OfflineLessonQuestion:
    """A canonical lesson question, shaped like the AI path's validated output."""

    front: str
    back: str
    question_type: str
    supporting_example: str | None = None
    front_translation: str | None = None
    supporting_example_translation: str | None = None


@dataclass(frozen=True)
class OfflineChoiceQuestion:
    """A four-option question, shaped like a `StudyQuestion` row."""

    question: str
    options: list[str]
    correct_option: str
    explanation: str


@dataclass(frozen=True)
class PlacementQuestion:
    """One step of the onboarding placement test."""

    level: int
    question: str
    options: list[str]
    correct_option: str


@dataclass(frozen=True)
class _Item:
    word_en: str
    word_pt: str
    example_en: str
    example_pt: str


def _clean(value: object) -> str:
    return " ".join(str(value or "").split())


def normalize_items(items: Iterable[object]) -> list[_Item]:
    """Accept LessonItem rows or plain dicts, and drop anything unusable."""

    normalized: list[_Item] = []
    seen: set[str] = set()
    for raw in items:
        if isinstance(raw, dict):
            word_en = _clean(raw.get("word_en"))
            word_pt = _clean(raw.get("word_pt"))
            example_en = _clean(raw.get("example_sentence_en"))
            example_pt = _clean(raw.get("example_sentence_pt"))
        else:
            word_en = _clean(getattr(raw, "word_en", ""))
            word_pt = _clean(getattr(raw, "word_pt", ""))
            example_en = _clean(getattr(raw, "example_sentence_en", ""))
            example_pt = _clean(getattr(raw, "example_sentence_pt", ""))
        if not word_en or not word_pt:
            continue
        key = word_en.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(_Item(word_en, word_pt, example_en, example_pt))
    return normalized


def _stable_index(seed: str, size: int) -> int:
    """A repeatable slot for the correct option, so it is not always first."""

    if size <= 1:
        return 0
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return digest[0] % size


def _build_options(correct: str, pool: Sequence[str], fallback: Sequence[str], seed: str) -> list[str]:
    """Four distinct options with `correct` placed at a repeatable position."""

    distractors: list[str] = []
    seen = {correct.casefold()}
    # The pool is walked from a seed-dependent offset so two questions in the
    # same lesson do not end up with the same three wrong answers.
    start = _stable_index(f"pool:{seed}", max(len(pool), 1))
    ordered = list(pool[start:]) + list(pool[:start])
    for candidate in list(ordered) + list(fallback):
        cleaned = _clean(candidate)
        if not cleaned or cleaned.casefold() in seen:
            continue
        seen.add(cleaned.casefold())
        distractors.append(cleaned)
        if len(distractors) == OPTIONS_PER_QUESTION - 1:
            break

    options = distractors
    position = _stable_index(seed, len(options) + 1)
    options.insert(position, correct)
    return options


def _blank_out(sentence: str, word: str) -> str | None:
    """Replace `word` inside `sentence` with a gap, or None when it is absent."""

    if not sentence or not word:
        return None
    needle = word.rstrip("!?.").strip()
    if not needle:
        return None
    pattern = re.compile(re.escape(needle), re.IGNORECASE)
    blanked, count = pattern.subn("_____", sentence, count=1)
    return blanked if count else None


def build_offline_lesson_questions(
    items: Iterable[object],
    *,
    limit: int = MAX_OFFLINE_LESSON_QUESTIONS,
) -> list[OfflineLessonQuestion]:
    """Canonical review questions for a lesson, in a stable order.

    Two per phrase: recognition (what does it mean) and production (how do you
    say it), which is also the pair the review screen is built to show.
    """

    normalized = normalize_items(items)
    questions: list[OfflineLessonQuestion] = []
    # Two phrases can blank out to the same sentence ("_____ in English?"), which
    # would be both a duplicate row and a question with two right answers. The
    # first spelling of a front wins and the rest fall back to the next form.
    seen_fronts: set[str] = set()

    def add(question: OfflineLessonQuestion) -> bool:
        key = " ".join(question.front.split()).casefold()
        if key in seen_fronts:
            return False
        seen_fronts.add(key)
        questions.append(question)
        return True

    for item in normalized:
        add(
            OfflineLessonQuestion(
                front=f'O que significa "{item.word_en}"?',
                back=item.word_pt,
                question_type="translation",
                supporting_example=item.example_en or None,
                front_translation=item.word_pt,
                supporting_example_translation=item.example_pt or None,
            )
        )
        produced = False
        gap = _blank_out(item.example_en, item.word_en)
        if gap:
            produced = add(
                OfflineLessonQuestion(
                    front=f"Complete a frase: {gap}",
                    back=item.word_en,
                    question_type="sentence_completion",
                    supporting_example=item.example_en or None,
                    front_translation=item.example_pt or None,
                    supporting_example_translation=item.example_pt or None,
                )
            )
        if not produced:
            add(
                OfflineLessonQuestion(
                    front=f'Como se diz "{item.word_pt}"?',
                    back=item.word_en,
                    question_type="vocabulary",
                    supporting_example=item.example_en or None,
                    front_translation=item.word_pt,
                    supporting_example_translation=item.example_pt or None,
                )
            )
        if len(questions) >= limit:
            break
    return questions[:limit]


def build_offline_choice_questions(
    items: Iterable[object],
    *,
    distractor_items: Iterable[object] = (),
    limit: int = MAX_OFFLINE_CHOICE_QUESTIONS,
) -> list[OfflineChoiceQuestion]:
    """Four-option questions for "modo questoes", built from the lesson itself.

    `distractor_items` widens the pool of wrong answers with phrases from other
    lessons, which is what keeps a three-phrase lesson from asking questions
    whose wrong options are obviously filler.
    """

    normalized = normalize_items(items)
    if not normalized:
        return []

    known = {item.word_en.casefold() for item in normalized}
    extra = [item for item in normalize_items(distractor_items) if item.word_en.casefold() not in known]
    pt_pool = [item.word_pt for item in normalized + extra]
    en_pool = [item.word_en for item in normalized + extra]

    questions: list[OfflineChoiceQuestion] = []
    seen_questions: set[str] = set()

    def add(question: OfflineChoiceQuestion) -> None:
        key = " ".join(question.question.split()).casefold()
        if key in seen_questions:
            return
        seen_questions.add(key)
        questions.append(question)

    for item in normalized:
        example = f' Exemplo: "{item.example_en}"' if item.example_en else ""
        add(
            OfflineChoiceQuestion(
                question=f'O que significa "{item.word_en}"?',
                options=_build_options(
                    item.word_pt,
                    [value for value in pt_pool if value != item.word_pt],
                    _FALLBACK_PT_DISTRACTORS,
                    seed=f"pt:{item.word_en}",
                ),
                correct_option=item.word_pt,
                explanation=f'"{item.word_en}" quer dizer "{item.word_pt}".{example}',
            )
        )
        add(
            OfflineChoiceQuestion(
                question=f'Como se diz "{item.word_pt}" em ingles?',
                options=_build_options(
                    item.word_en,
                    [value for value in en_pool if value != item.word_en],
                    _FALLBACK_EN_DISTRACTORS,
                    seed=f"en:{item.word_pt}",
                ),
                correct_option=item.word_en,
                explanation=(
                    f'"{item.word_pt}" se diz "{item.word_en}".'
                    + (f' Exemplo: "{item.example_pt}"' if item.example_pt else "")
                ),
            )
        )
        if len(questions) >= limit:
            break
    return questions[:limit]


# ── Placement test ────────────────────────────────────────────────────────────
# Five questions that climb from "hello" to a past tense, answered before the
# account has any content of its own. Hard-coded on purpose: a test that depended
# on seeded lessons would fail exactly when it is needed, on the first run.
_PLACEMENT_BANK: tuple[PlacementQuestion, ...] = (
    PlacementQuestion(
        level=1,
        question='O que significa "Hello"?',
        options=["Oi", "Tchau", "Obrigado", "Desculpa"],
        correct_option="Oi",
    ),
    PlacementQuestion(
        level=2,
        question='Como se diz "Eu tenho um cachorro" em ingles?',
        options=["I have a dog", "I am a dog", "I like a dog", "I has a dog"],
        correct_option="I have a dog",
    ),
    PlacementQuestion(
        level=3,
        question="Complete: She _____ to school every day.",
        options=["goes", "go", "going", "gone"],
        correct_option="goes",
    ),
    PlacementQuestion(
        level=4,
        question='O que significa "I am reading a book right now"?',
        options=[
            "Estou lendo um livro agora",
            "Eu li um livro ontem",
            "Eu vou ler um livro",
            "Eu gosto de livros",
        ],
        correct_option="Estou lendo um livro agora",
    ),
    PlacementQuestion(
        level=5,
        question="Complete: Yesterday we _____ a great film.",
        options=["watched", "watch", "watching", "will watch"],
        correct_option="watched",
    ),
)

MIN_PLACEMENT_LEVEL = 1


def build_placement_questions(target_language: str = "English") -> list[PlacementQuestion]:
    """The placement test, or an empty list for a language it does not cover.

    An empty list is not a failure: the caller starts that child at level 1,
    which is where the automatic ladder would have put them anyway.
    """

    if _clean(target_language).casefold() not in {"english", "ingles", "inglês"}:
        return []
    return list(_PLACEMENT_BANK)


def level_from_placement(correct_levels: Iterable[int]) -> int:
    """The level to start at: one above the hardest question answered right.

    Getting the level-3 question right says level 3 is already known, so the
    child starts at 4. Nothing right means level 1. The result is clamped to the
    band the placement bank can actually speak to, because five questions are
    not evidence for level 9.
    """

    highest = 0
    for level in correct_levels:
        try:
            value = int(level)
        except (TypeError, ValueError):
            continue
        highest = max(highest, value)
    if highest <= 0:
        return MIN_PLACEMENT_LEVEL
    return max(MIN_PLACEMENT_LEVEL, min(highest + 1, len(_PLACEMENT_BANK) + 1))
