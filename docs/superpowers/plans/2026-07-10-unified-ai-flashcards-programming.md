# Unified AI Flashcards: Programming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make programming reading and deck modes use the same code-aware, interview-focused cards and let users append five AI cards with optional context from either mode.

**Architecture:** Keep `ProgrammingFlashcard` as the canonical record. Add a small shared AI-card validation service, strengthen the existing one-call topic prompt, and expose one atomic append endpoint that both programming UIs call.

**Tech Stack:** FastAPI, SQLModel, Pydantic, Next.js 14, React, TypeScript, Tailwind CSS, Python source/integration tests.

---

## File Map

- Create `apps/api/services/ai_flashcard_service.py`: normalize, sanitize, validate, and parse fixed five-card AI batches.
- Create `scripts/test_ai_flashcard_service.py`: behavior tests for shared validation.
- Create `scripts/test_programming_ai_flashcards.py`: programming prompt, route, and UI contract checks.
- Modify `apps/api/services/coding_service.py`: interview-focused prompts and additional-card generation.
- Modify `apps/api/schemas/schemas.py`: request and response models for additional generation.
- Modify `apps/api/main.py`: atomic programming append endpoint.
- Modify `apps/web/src/lib/api.ts`: programming generation client.
- Modify `apps/web/src/components/coding/TopicView.tsx`: reading-mode generation form.
- Modify `apps/web/src/components/coding/FlashcardDeck.tsx`: deck generation form, topic selector, and code display.

### Task 1: Shared five-card validation

**Files:**
- Create: `apps/api/services/ai_flashcard_service.py`
- Create: `scripts/test_ai_flashcard_service.py`

- [ ] **Step 1: Write the failing validation tests**

```python
# scripts/test_ai_flashcard_service.py
from pathlib import Path
import sys

API = Path(__file__).resolve().parents[1] / "apps" / "api"
sys.path.insert(0, str(API))

from services.ai_flashcard_service import sanitize_context, validate_card_batch


def main() -> None:
    assert sanitize_context("  foque\n em hooks  ") == "foque em hooks"
    cards = validate_card_batch([
        {"front": f"Pergunta {i}?", "back": f"Resposta {i}", "code_example": "const x = 1;"}
        for i in range(5)
    ], existing_fronts=["Outra pergunta?"])
    assert len(cards) == 5
    assert cards[0].code_example == "const x = 1;"

    for invalid in (
        [{"front": "A?", "back": "B"}] * 4,
        [{"front": "Repetida?", "back": str(i)} for i in range(5)],
        [{"front": "Existente?", "back": str(i)} for i in range(5)],
    ):
        try:
            validate_card_batch(invalid, existing_fronts=["Existente?"])
        except ValueError:
            pass
        else:
            raise AssertionError("invalid batch must be rejected")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_ai_flashcard_service.py`

Expected: FAIL with `ModuleNotFoundError: No module named 'services.ai_flashcard_service'`.

- [ ] **Step 3: Implement the focused validator**

```python
# apps/api/services/ai_flashcard_service.py
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class ValidatedCard:
    front: str
    back: str
    code_example: str | None = None
    question_type: str | None = None


def sanitize_context(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())[:1000]


def normalize_front(value: str) -> str:
    plain = unicodedata.normalize("NFD", value)
    plain = "".join(ch for ch in plain if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", plain.lower()).strip()


def validate_card_batch(raw_cards: list[dict], existing_fronts: list[str]) -> list[ValidatedCard]:
    if len(raw_cards) != 5:
        raise ValueError("A IA deve retornar exatamente 5 questoes validas.")
    seen = {normalize_front(front) for front in existing_fronts if front.strip()}
    result: list[ValidatedCard] = []
    for raw in raw_cards:
        front = str(raw.get("front") or raw.get("question") or "").strip()[:500]
        back = str(raw.get("back") or raw.get("answer") or "").strip()[:2000]
        key = normalize_front(front)
        if not key or not back or key in seen:
            raise ValueError("A IA retornou questoes vazias ou repetidas.")
        seen.add(key)
        code = str(raw.get("code_example") or "").strip()[:3000] or None
        question_type = str(raw.get("question_type") or "").strip()[:40] or None
        result.append(ValidatedCard(front, back, code, question_type))
    return result
```

- [ ] **Step 4: Run the test and confirm GREEN**

Run: `python scripts/test_ai_flashcard_service.py`

Expected: exit code 0 and no traceback.

- [ ] **Step 5: Commit**

```bash
git add apps/api/services/ai_flashcard_service.py scripts/test_ai_flashcard_service.py
git commit -m "test: define fixed AI flashcard validation"
```

### Task 2: Programming prompt and atomic append endpoint

**Files:**
- Modify: `apps/api/services/coding_service.py`
- Modify: `apps/api/schemas/schemas.py`
- Modify: `apps/api/main.py`
- Create: `scripts/test_programming_ai_flashcards.py`

- [ ] **Step 1: Write failing source and behavior assertions**

```python
# scripts/test_programming_ai_flashcards.py
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
service = (ROOT / "apps/api/services/coding_service.py").read_text(encoding="utf-8")
main = (ROOT / "apps/api/main.py").read_text(encoding="utf-8")
schemas = (ROOT / "apps/api/schemas/schemas.py").read_text(encoding="utf-8")

assert "technical interview" in service.lower()
assert "reuse relevant code" in service.lower()
assert "def generate_additional_topic_flashcards" in service
assert "class GenerateAdditionalFlashcardsSchema" in schemas
assert '@app.post("/api/coding/topics/{topic_id}/flashcards/generate"' in main
assert "validate_card_batch" in main
assert "existing_fcs" in main and "session.delete(fc)" not in main.split("def generate_additional_coding_flashcards", 1)[1].split("@app.", 1)[0]
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_programming_ai_flashcards.py`

Expected: FAIL on the missing interview prompt or append function.

- [ ] **Step 3: Strengthen the existing one-call topic prompt**

Add these rules to `_TOPIC_PROMPT_TEMPLATE` in `apps/api/services/coding_service.py` without introducing another AI call:

```python
- Every flashcard front must be phrased as a technical interview question
- Flashcards must test concepts taught in sections from this same JSON response
- Reuse relevant code from the lesson in code_example when code helps answer the question
- Prefer reasoning, trade-offs, debugging, common pitfalls, and practical application over definitions
```

Add a generator that uses the saved lesson and existing fronts:

```python
def generate_additional_topic_flashcards(*, subject_name: str, topic_title: str,
    ai_content: dict, existing_fronts: list[str], user_context: str,
    ai_config: AIProviderConfig) -> list[dict]:
    prompt = build_additional_topic_flashcards_prompt(
        subject_name=subject_name, topic_title=topic_title,
        ai_content=ai_content, existing_fronts=existing_fronts,
        user_context=user_context,
    )
    raw = _phrase_service.generate_json_text(
        system_text=_SYSTEM_TEXT, prompt=prompt, temperature=0.6, ai_config=ai_config,
    )
    data = json.loads(raw)
    return list(data.get("flashcards") or [])
```

- [ ] **Step 4: Add request schema and atomic endpoint**

```python
# apps/api/schemas/schemas.py
class GenerateAdditionalFlashcardsSchema(BaseModel):
    context: Optional[str] = Field(default=None, max_length=1000)
```

Implement `POST /api/coding/topics/{topic_id}/flashcards/generate` in `apps/api/main.py`. Reuse the existing ownership and AI-configuration checks, call `sanitize_context`, pass `topic.ai_content`, validate against all existing fronts, insert five `ProgrammingFlashcard` rows, seed five review items, commit once, and return `list[ProgrammingFlashcardSchema]`. Do not delete or update existing cards.

- [ ] **Step 5: Run focused and regression tests**

Run:

```bash
python scripts/test_programming_ai_flashcards.py
python scripts/test_coding_ai_topic_ui.py
python scripts/test_api_routes.py
```

Expected: all commands exit 0; the API smoke suite reports completion without failed route assertions.

- [ ] **Step 6: Commit**

```bash
git add apps/api/services/coding_service.py apps/api/schemas/schemas.py apps/api/main.py scripts/test_programming_ai_flashcards.py
git commit -m "feat: append interview flashcards to coding topics"
```

### Task 3: Programming API client and reading-mode form

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/coding/TopicView.tsx`
- Modify: `scripts/test_programming_ai_flashcards.py`

- [ ] **Step 1: Add failing UI contract assertions**

Append:

```python
api = (ROOT / "apps/web/src/lib/api.ts").read_text(encoding="utf-8")
topic = (ROOT / "apps/web/src/components/coding/TopicView.tsx").read_text(encoding="utf-8")
assert "generateAdditionalCodingFlashcards" in api
assert "Criar mais quest" in topic
assert "additionalFlashcardContext" in topic
assert "api.generateAdditionalCodingFlashcards(topic.id" in topic
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_programming_ai_flashcards.py`

Expected: FAIL on `generateAdditionalCodingFlashcards`.

- [ ] **Step 3: Add the API client**

```typescript
generateAdditionalCodingFlashcards: (topicId: number, context?: string) =>
  fetchAPI<ProgrammingFlashcard[]>(`/api/coding/topics/${topicId}/flashcards/generate`, {
    method: 'POST',
    body: JSON.stringify({ context: context?.trim() || null }),
  }),
```

- [ ] **Step 4: Add the inline form to `TopicView`**

Keep local `showGenerateMore`, `additionalFlashcardContext`, `generatingMore`, and `generateMoreError` state. On success append the returned five records to `flashcards`; show `Serão criadas 5 questões`; keep the form open on failure; close and clear it on success or cancel.

- [ ] **Step 5: Verify focused test and web type/build checks**

Run:

```bash
python scripts/test_programming_ai_flashcards.py
cd apps/web && pnpm lint && pnpm build
```

Expected: source test passes, lint has zero errors, and Next.js build exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/components/coding/TopicView.tsx scripts/test_programming_ai_flashcards.py
git commit -m "feat: generate coding cards from reading mode"
```

### Task 4: Deck generation and consistent code rendering

**Files:**
- Modify: `apps/web/src/components/coding/FlashcardDeck.tsx`
- Modify: `scripts/test_programming_ai_flashcards.py`

- [ ] **Step 1: Add failing deck assertions**

```python
deck = (ROOT / "apps/web/src/components/coding/FlashcardDeck.tsx").read_text(encoding="utf-8")
assert "Criar com IA" in deck
assert "getCodingTopics(subjectId)" in deck
assert "selectedTopicId" in deck
assert "generateAdditionalCodingFlashcards(selectedTopicId" in deck
assert "card.code_example && <SyntaxCodeBlock" in deck
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_programming_ai_flashcards.py`

Expected: FAIL on the missing deck generation controls.

- [ ] **Step 3: Implement deck controls**

Load topics with `api.getCodingTopics(subjectId)` when the Cards tab opens. Add `Criar com IA` beside search/manual creation. The inline form requires a nonzero `selectedTopicId`, accepts context, calls the append API, then reloads the overview and topic counts.

- [ ] **Step 4: Render code in card browsing**

Expand a card row or include a compact details area that uses:

```tsx
{card.code_example && (
  <SyntaxCodeBlock code={card.code_example} language={subjectName} className="mt-3" />
)}
```

Pass `subjectName` through `CardsTab` and `CardRow`; keep the existing study reveal renderer.

- [ ] **Step 5: Run all programming verification**

Run:

```bash
python scripts/test_ai_flashcard_service.py
python scripts/test_programming_ai_flashcards.py
python scripts/test_coding_ai_topic_ui.py
python scripts/test_api_routes.py
cd apps/web && pnpm lint && pnpm build
```

Expected: every command exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/coding/FlashcardDeck.tsx scripts/test_programming_ai_flashcards.py
git commit -m "feat: generate and display code-aware deck cards"
```

### Task 5: Browser verification checkpoint

**Files:**
- No production file changes expected.

- [ ] **Step 1: Start backend and web app**

Run: `.\start-project.cmd`

Expected: API health succeeds on port 8001 and Next.js serves the configured local port.

- [ ] **Step 2: Verify reading mode**

Create a programming topic with AI. Confirm the network panel shows one topic-generation request, the lesson and five-to-eight interview cards appear, and code shown in the lesson also appears on relevant cards.

- [ ] **Step 3: Verify both append entry points**

Generate five cards with context from `TopicView`, then five from the deck Cards tab. Confirm counts increase by five each time, previous cards remain, and the same fronts/backs/code appear in both modes.

- [ ] **Step 4: Verify mobile layout and failure state**

At a narrow viewport, confirm topic selection and context remain usable. Temporarily use an invalid AI configuration and confirm the form stays open with an actionable error and no cards are appended.
