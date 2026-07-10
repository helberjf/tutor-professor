# Unified AI Flashcards: Other Subjects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Other Subjects one canonical question per concept and let users append five exam-style AI questions from Visualize or Review/List.

**Architecture:** Normalize the JSON-backed `DiverseDay` model so subject questions own stable IDs and lesson blocks store only `topic_ids`. Save current edits before server-side generation, then atomically append five canonical questions and link them to the selected lesson.

**Tech Stack:** FastAPI, Pydantic, SQLModel JSON columns, Next.js 14, React, TypeScript, Python source/behavior tests.

---

## File Map

- Create `apps/api/services/diverse_question_service.py`: legacy normalization, lookup, linking, and payload helpers.
- Create `scripts/test_diverse_question_normalization.py`: real normalization behavior tests.
- Create `scripts/test_diverse_ai_questions.py`: endpoint and UI contract checks.
- Modify `apps/api/schemas/schemas.py`: stable question IDs, lesson references, generation request.
- Modify `apps/api/main.py`: normalize reads/writes and persist five generated questions.
- Modify `apps/web/src/lib/api.ts`: normalized types and generation client.
- Modify `apps/web/src/app/study/page.tsx`: resolve lesson references and add both generation forms.
- Modify `scripts/test_diverse_subject_tabs.py`: replace copy-based expectations with canonical-reference expectations.

### Task 1: Normalize legacy Diverse questions into one source

**Files:**
- Create: `apps/api/services/diverse_question_service.py`
- Create: `scripts/test_diverse_question_normalization.py`

- [ ] **Step 1: Write the failing normalization test**

```python
# scripts/test_diverse_question_normalization.py
from pathlib import Path
import sys

API = Path(__file__).resolve().parents[1] / "apps" / "api"
sys.path.insert(0, str(API))

from services.diverse_question_service import normalize_subject


legacy = {
    "name": "Biologia",
    "topics": [{"topic": "O que e mitose?", "answer": "Divisao celular", "review_count": 2}],
    "lessons": [{
        "id": "lesson-1", "title": "Mitose",
        "topics": [{"topic": "O que e mitose?", "answer": "Divisao celular", "code_example": None}],
    }],
}

subject = normalize_subject(legacy)
assert len(subject["topics"]) == 1
question = subject["topics"][0]
assert question["id"].startswith("question-")
assert question["review_count"] == 2
assert subject["lessons"][0]["topic_ids"] == [question["id"]]
assert "topics" not in subject["lessons"][0]

again = normalize_subject(subject)
assert again == subject
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_diverse_question_normalization.py`

Expected: FAIL with missing `diverse_question_service`.

- [ ] **Step 3: Implement deterministic, idempotent normalization**

```python
# apps/api/services/diverse_question_service.py
from __future__ import annotations

import hashlib
import re
import unicodedata
from copy import deepcopy


def normalize_text(value: str) -> str:
    plain = unicodedata.normalize("NFD", value)
    plain = "".join(ch for ch in plain if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", plain.lower()).strip()


def stable_question_id(subject_name: str, front: str) -> str:
    key = f"{normalize_text(subject_name)}|{normalize_text(front)}"
    return f"question-{hashlib.sha1(key.encode()).hexdigest()[:16]}"


def normalize_subject(raw: dict) -> dict:
    source = deepcopy(raw)
    name = str(source.get("name") or "Materia")[:60]
    by_key: dict[str, dict] = {}
    for item in source.get("topics") or []:
        key = normalize_text(str(item.get("topic") or ""))
        if key:
            by_key[key] = normalize_question(item, name)
    lessons = []
    for lesson in source.get("lessons") or []:
        ids = list(lesson.get("topic_ids") or [])
        for item in lesson.get("topics") or []:
            key = normalize_text(str(item.get("topic") or ""))
            if not key:
                continue
            canonical = by_key.setdefault(key, normalize_question(item, name))
            if not canonical.get("answer") and item.get("answer"):
                canonical["answer"] = str(item["answer"])[:2000]
            if not canonical.get("code_example") and item.get("code_example"):
                canonical["code_example"] = str(item["code_example"])[:3000]
            ids.append(canonical["id"])
        lessons.append({
            "id": str(lesson.get("id") or "")[:80],
            "title": str(lesson.get("title") or "Licao")[:80],
            "created_at": lesson.get("created_at"),
            "topic_ids": list(dict.fromkeys(ids)),
        })
    return {"name": name, "topics": list(by_key.values()), "lessons": lessons}
```

Implement `normalize_question` in the same file to preserve `done`, `last_rating`, `review_count`, `last_reviewed`, answer, and optional code while assigning an existing or deterministic ID.

- [ ] **Step 4: Run the test and confirm GREEN**

Run: `python scripts/test_diverse_question_normalization.py`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/services/diverse_question_service.py scripts/test_diverse_question_normalization.py
git commit -m "refactor: normalize diverse lesson questions"
```

### Task 2: Persist the normalized JSON contract

**Files:**
- Modify: `apps/api/schemas/schemas.py`
- Modify: `apps/api/main.py`
- Modify: `scripts/test_diverse_question_normalization.py`

- [ ] **Step 1: Add failing schema/source assertions**

```python
schemas = (API / "schemas/schemas.py").read_text(encoding="utf-8")
main = (API / "main.py").read_text(encoding="utf-8")
assert "id: str" in schemas.split("class CodingTopicSchema", 1)[1]
assert "topic_ids: List[str]" in schemas
assert "normalize_subject" in main
assert '"topics": [_topic_payload' not in main.split("def _lesson_payload", 1)[1].split("def ", 1)[0]
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_diverse_question_normalization.py`

Expected: FAIL on the missing ID/topic reference schema.

- [ ] **Step 3: Update Pydantic schemas**

Add `id: str` and optional `code_example` to `CodingTopicSchema`. Change `DiverseLessonBlockSchema` to `topic_ids: List[str]`; retain a pre-validation compatibility path that accepts legacy `topics` long enough for `normalize_subject` to convert them.

- [ ] **Step 4: Normalize every read and write**

In `get_diverse_day`, normalize every stored subject before validation. In `upsert_diverse_day`, serialize canonical subject topics once and lesson `topic_ids` only. Do not silently create a second embedded question list.

- [ ] **Step 5: Run focused and API tests**

Run:

```bash
python scripts/test_diverse_question_normalization.py
python scripts/test_api_routes.py
```

Expected: both exit 0; legacy Diverse payloads still round-trip.

- [ ] **Step 6: Commit**

```bash
git add apps/api/schemas/schemas.py apps/api/main.py scripts/test_diverse_question_normalization.py
git commit -m "refactor: persist canonical diverse questions"
```

### Task 3: Generate five exam questions atomically

**Files:**
- Modify: `apps/api/schemas/schemas.py`
- Modify: `apps/api/main.py`
- Create: `scripts/test_diverse_ai_questions.py`

- [ ] **Step 1: Write failing endpoint contract checks**

```python
# scripts/test_diverse_ai_questions.py
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / "apps/api/main.py").read_text(encoding="utf-8")
schemas = (ROOT / "apps/api/schemas/schemas.py").read_text(encoding="utf-8")

assert "class GenerateDiverseQuestionsSchema" in schemas
assert '@app.post("/api/study/diverse/questions/generate"' in main
assert "exam-style" in main.lower()
assert "technical subject" in main.lower()
assert "validate_card_batch" in main
assert "topic_ids" in main.split("def generate_diverse_questions", 1)[1]
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_diverse_ai_questions.py`

Expected: FAIL on the missing generation schema.

- [ ] **Step 3: Add explicit request/response schemas**

```python
class GenerateDiverseQuestionsSchema(BaseModel):
    study_date: date
    subject_index: int = Field(ge=0)
    lesson_id: str = Field(min_length=1, max_length=80)
    context: Optional[str] = Field(default=None, max_length=1000)
```

The response uses the existing canonical `CodingTopicSchema` list.

- [ ] **Step 4: Implement server-side generation**

Load the authenticated child's `DiverseDay`, normalize the selected subject, find `lesson_id`, and build a prompt from the subject name, lesson title, currently linked questions, existing subject fronts, and sanitized context. Require exam-style questions; if the subject is technical, permit short practical code and return it as `code_example`. Call the AI once, validate exactly five cards, append canonical questions with unique IDs, extend the lesson's `topic_ids`, assign `record.custom_subjects`, and commit once.

- [ ] **Step 5: Extend API smoke coverage with a mocked AI response**

In `scripts/test_api_routes.py`, save a Diverse day, monkeypatch `phrase_generation_service.generate_json_text` to count calls and return five unique questions, call the endpoint, assert exactly one AI call, status 200, and five results, then GET the day and assert the lesson references the same five IDs found in the subject topics. Also exercise the existing initial Diverse lesson generation and assert it still uses one request/response rather than a second flashcard-only call.

- [ ] **Step 6: Run backend tests**

Run:

```bash
python scripts/test_ai_flashcard_service.py
python scripts/test_diverse_question_normalization.py
python scripts/test_diverse_ai_questions.py
python scripts/test_api_routes.py
```

Expected: every command exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/schemas/schemas.py apps/api/main.py scripts/test_diverse_ai_questions.py scripts/test_api_routes.py
git commit -m "feat: append AI exam questions to diverse lessons"
```

### Task 4: Resolve canonical references in the web app

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/study/page.tsx`
- Modify: `scripts/test_diverse_subject_tabs.py`

- [ ] **Step 1: Replace copy-based test expectations**

Remove assertions requiring `topics: [...s.topics, ...nextTopics]`. Add:

```python
require("topic_ids" in source, "diverse lessons reference canonical question IDs")
require("function resolveDiverseLessonTopics" in source, "lesson reading resolves canonical subject questions")
require("lesson.topic_ids" in source, "lesson views use stable references")
require("lesson.topics" not in source, "lesson blocks do not keep mutable question copies")
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_diverse_subject_tabs.py`

Expected: FAIL until the page uses `topic_ids`.

- [ ] **Step 3: Update TypeScript types and helpers**

```typescript
export interface CodingTopic {
  id: string;
  topic: string;
  answer?: string;
  code_example?: string | null;
  done: boolean;
  last_rating?: DiverseRating | null;
  review_count?: number;
  last_reviewed?: string | null;
}

export interface DiverseLessonBlock {
  id: string;
  title: string;
  topic_ids: string[];
  created_at?: string | null;
}
```

Implement `resolveDiverseLessonTopics(subject, lesson)` as an ID-map lookup. All lesson rendering and editing must resolve/update `subject.topics`, never a lesson copy.

Render optional technical examples with the existing `SyntaxCodeBlock` component:

```tsx
{topic.code_example && (
  <SyntaxCodeBlock code={topic.code_example} language={subject.name} className="mt-3" />
)}
```

- [ ] **Step 4: Update creation/import paths**

Assign a stable local `id` when manually importing or previewing new questions. Saving a preview appends each canonical question once and stores only their IDs on the lesson.

- [ ] **Step 5: Verify frontend contract and build**

Run:

```bash
python scripts/test_diverse_subject_tabs.py
python scripts/test_diverse_question_normalization.py
cd apps/web && pnpm lint && pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app/study/page.tsx scripts/test_diverse_subject_tabs.py
git commit -m "refactor: share diverse questions across study modes"
```

### Task 5: Add both Other Subjects generation entry points

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/study/page.tsx`
- Modify: `scripts/test_diverse_ai_questions.py`

- [ ] **Step 1: Add failing UI assertions**

```python
page = (ROOT / "apps/web/src/app/study/page.tsx").read_text(encoding="utf-8")
api = (ROOT / "apps/web/src/lib/api.ts").read_text(encoding="utf-8")
assert "generateDiverseQuestions" in api
assert page.count("Criar mais quest") >= 2
assert "diverseQuestionContext" in page
assert "Serão criadas 5 questões" in page
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `python scripts/test_diverse_ai_questions.py`

Expected: FAIL on the missing API client.

- [ ] **Step 3: Add API client**

```typescript
generateDiverseQuestions: (payload: {
  study_date: string; subject_index: number; lesson_id: string; context?: string;
}) => fetchAPI<CodingTopic[]>('/api/study/diverse/questions/generate', {
  method: 'POST', body: JSON.stringify(payload),
}),
```

- [ ] **Step 4: Add Visualize and Review/List forms**

In Visualize, the lesson is implicit. In Review/List, require a lesson selector. Before generation, persist current Diverse edits with `saveDiverseDay`; only then call the generation endpoint. On success replace the selected subject with the freshly fetched normalized day so Visualize and Review immediately resolve the same five questions.

- [ ] **Step 5: Run complete Diverse verification**

Run:

```bash
python scripts/test_diverse_question_normalization.py
python scripts/test_diverse_ai_questions.py
python scripts/test_diverse_subject_tabs.py
python scripts/test_api_routes.py
cd apps/web && pnpm lint && pnpm build
```

Expected: every command exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app/study/page.tsx scripts/test_diverse_ai_questions.py
git commit -m "feat: generate more questions in diverse study modes"
```

### Task 6: Browser verification checkpoint

**Files:**
- No production file changes expected.

- [ ] **Step 1: Verify legacy migration behavior**

Open an existing saved Diverse day. Confirm its lesson content, answers, completion state, and review counts remain visible after save/reload.

- [ ] **Step 2: Verify both generation entries**

From Visualize, append five Biology questions with an exam context. From Review/List, choose the same lesson and append five more. Confirm both modes show identical content and counts and old questions remain.

- [ ] **Step 3: Verify technical and nontechnical subjects**

Generate questions for a technical subject and confirm optional code renders when returned. Generate questions for a nontechnical subject and confirm no empty code area appears.

- [ ] **Step 4: Verify failure and mobile states**

Confirm an AI failure leaves saved questions unchanged and the inline form open. At a narrow viewport, confirm lesson selection, context, and status messages remain usable.
