# Topic Context and Reading AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add topic-generation context, subject-preserving flashcard navigation, header-level lesson recreation, and ephemeral reading deepening with text-to-speech.

**Architecture:** Extend the existing programming topic creation contract, add one stateless deepening endpoint/service helper, and keep navigation/read-aloud/deepening state local to React components. All behavior is covered by source-level UI tests plus focused backend route/service tests.

**Tech Stack:** FastAPI, SQLModel, Pydantic, Next.js, React, TypeScript, Tailwind, Python unittest/source tests, existing browser speech helper.

---

## File Map

- Modify `apps/api/schemas/schemas.py`: topic creation context, reading deepening request/response schemas.
- Modify `apps/api/services/coding_service.py`: bounded deepening prompt builder and AI call.
- Modify `apps/api/main.py`: pass create-topic context and add stateless deepening route.
- Modify `apps/web/src/lib/api.ts`: context type for topic creation and deepening client method.
- Modify `apps/web/src/components/coding/CreateTopicModal.tsx`: AI context textarea.
- Modify `apps/web/src/components/coding/CodingCurriculum.tsx`: preserve subject/topic while switching modes and return from deck to topics.
- Modify `apps/web/src/components/coding/TopicView.tsx`: move/rename recreate action, add reading speech and deepening UI.
- Modify `apps/web/src/lib/browser-speech.ts`: allow language override/cancel state if needed.
- Create `scripts/test_topic_context_reading_ai.py`: backend and source-level UI contract tests.

### Task 1: Topic Creation Context

- [ ] **Step 1: Write RED tests**

Add `scripts/test_topic_context_reading_ai.py` with tests that assert:

```python
from pydantic import ValidationError
from schemas.schemas import CreateProgrammingTopicSchema

assert CreateProgrammingTopicSchema(title="Hooks", generate_ai=True, context="focus").context == "focus"
try:
    CreateProgrammingTopicSchema(title="Hooks", context="x" * 1001)
except ValidationError:
    pass
else:
    raise AssertionError("topic context must be limited to 1000 chars")
```

Also assert the frontend source contains `topicContext`, a textarea placeholder mentioning context, and `context: topicContext.trim()`.

- [ ] **Step 2: Run RED**

Run: `python scripts/test_topic_context_reading_ai.py`

Expected: failure because `CreateProgrammingTopicSchema` and `CreateTopicModal` do not support `context`.

- [ ] **Step 3: Implement schema/backend/client/UI**

Add `context: Optional[str] = Field(default=None, max_length=1000)` to `CreateProgrammingTopicSchema`.

In `create_coding_topic`, compute:

```python
topic_context = sanitize_context(payload.context)
context_text = "\n".join(part for part in ((subject.context or "").strip(), topic_context) if part)
```

Pass `user_context=context_text` when `payload.generate_ai` is true.

Update the API client payload type to `{ title: string; order_index?: number; generate_ai?: boolean; context?: string }`.

Add `topicContext` state and a conditional textarea under `Gerar aula com IA` in `CreateTopicModal`; clear it after creation/close.

- [ ] **Step 4: Run GREEN**

Run: `python scripts/test_topic_context_reading_ai.py`

Expected: topic context assertions pass.

### Task 2: Stateless Reading Deepening API

- [ ] **Step 1: Write RED tests**

Extend `scripts/test_topic_context_reading_ai.py` to assert:

```python
assert "class DeepenCodingReadingRequestSchema" in schemas_source
assert "class DeepenCodingReadingResponseSchema" in schemas_source
assert "def deepen_coding_reading_step" in service_source
assert "Notion" in service_source
assert "conceitos" in service_source.lower()
assert "exemplos" in service_source.lower()
assert '@app.post("/api/coding/topics/{topic_id}/reading/deepen"' in main_source
assert "session.commit()" not in main_source.split("def deepen_coding_topic_reading", 1)[1].split("@app.", 1)[0]
```

Add an async route test that patches `main.deepen_coding_reading_step`, posts a section step plus a question, expects 200 with `content`, and verifies topic/card counts do not change.

- [ ] **Step 2: Run RED**

Run: `python scripts/test_topic_context_reading_ai.py`

Expected: failure because schemas, service helper, and route do not exist.

- [ ] **Step 3: Implement schemas/service/route**

Add request fields: `step_type`, `title`, `body`, `code_example`, `question`, `options`, `correct_option`, `explanation`, `user_question`.

Implement `deepen_coding_reading_step(...) -> str` in `coding_service.py`, using `_phrase_service.generate_text` if present or `generate_json_text` with `{"content": "..."}` if the existing service only exposes JSON text. The prompt must include subject, topic, current step, optional doubt, Notion Markdown, concise concepts, and examples.

Add route `POST /api/coding/topics/{topic_id}/reading/deepen` that checks auth/child/topic ownership, gets AI config, rolls back before the AI call, returns `DeepenCodingReadingResponseSchema(content=content)`, and does not add or commit database records.

- [ ] **Step 4: Run GREEN**

Run: `python scripts/test_topic_context_reading_ai.py`

Expected: deepening backend tests pass.

### Task 3: Subject-Preserving Flashcard Navigation

- [ ] **Step 1: Write RED tests**

Extend source tests to assert `CodingCurriculum.tsx` no longer resets to subjects on every `focusMode`, contains a helper such as `openCurrentSubjectDeck`, and deck back uses a subject return path.

Use assertions:

```python
assert "setView({ type: 'subjects' });\n  }, [focusMode]);" not in curriculum_source
assert "view.type === 'topics'" in curriculum_source and "setView({ type: 'deck'" in curriculum_source
assert "returnToTopics" in curriculum_source
```

- [ ] **Step 2: Run RED**

Run: `python scripts/test_topic_context_reading_ai.py`

Expected: failure on existing reset behavior.

- [ ] **Step 3: Implement navigation**

Change `View` deck variant to `{ type: 'deck'; subject: ProgrammingSubject; returnToTopics?: boolean }`.

Replace focus-mode reset with an effect that:

```typescript
if (focusMode === 'flashcards') {
  if (view.type === 'topics') setView({ type: 'deck', subject: view.subject, returnToTopics: true });
  if (view.type === 'topic') setView({ type: 'deck', subject: view.subject, returnToTopics: true });
}
if (focusMode === 'reading' && view.type === 'deck' && view.returnToTopics) {
  void loadTopics(view.subject);
}
```

Make deck `onBack` return to `topics` when `returnToTopics` is true.

- [ ] **Step 4: Run GREEN**

Run: `python scripts/test_topic_context_reading_ai.py`

Expected: navigation contract passes.

### Task 4: Topic Header Recreate Action

- [ ] **Step 1: Write RED tests**

Assert `TopicView.tsx` contains `Recriar aula com IA` near `Iniciar estudo`, contains `showRegenerateContext`, and does not expose the old standalone bottom trigger text `Regenerar com IA`.

- [ ] **Step 2: Run RED**

Run: `python scripts/test_topic_context_reading_ai.py`

Expected: failure because the old label remains.

- [ ] **Step 3: Implement UI move/rename**

Add a secondary header button under/near `Iniciar estudo`:

```tsx
<button type="button" onClick={() => setShowRegenerateContext(true)}>
  <Sparkles size={16} />
  Recriar aula com IA
</button>
```

Move the regenerate form just below the header card. Keep existing `handleGenerate(regenerateContext)` behavior and remove the bottom button block.

- [ ] **Step 4: Run GREEN**

Run: `python scripts/test_topic_context_reading_ai.py`

Expected: header action contract passes.

### Task 5: Reading Speech and Ephemeral AI UI

- [ ] **Step 1: Write RED tests**

Assert `TopicView.tsx` imports `speakWithBrowserVoice`, contains `Ouvir texto`, `Aprofundar com IA`, `deepeningQuestion`, `api.deepenCodingReadingStep`, `Copiar para Notion`, `navigator.clipboard.writeText(deepeningAnswer)`, and state reset on step change.

Assert `api.ts` contains `deepenCodingReadingStep`.

- [ ] **Step 2: Run RED**

Run: `python scripts/test_topic_context_reading_ai.py`

Expected: failure because reading controls do not exist.

- [ ] **Step 3: Implement reading controls**

In `ReadingStudyModal`, add local state:

```typescript
const [speaking, setSpeaking] = useState(false);
const [speechError, setSpeechError] = useState('');
const [showDeepening, setShowDeepening] = useState(false);
const [deepeningQuestion, setDeepeningQuestion] = useState('');
const [deepeningAnswer, setDeepeningAnswer] = useState('');
const [deepeningError, setDeepeningError] = useState('');
const [deepeningLoading, setDeepeningLoading] = useState(false);
```

Build a `currentStepPayload` and call `api.deepenCodingReadingStep(topicId, payload)`. Display the answer in a copy-friendly panel and never call a save endpoint.

Use `speakWithBrowserVoice(buildSpeakableReadingText(step), 0.95, 'pt-BR')`. Cancel speech when closing or changing steps.

- [ ] **Step 4: Run GREEN**

Run: `python scripts/test_topic_context_reading_ai.py`

Expected: reading UI contract passes.

### Task 6: Full Verification and Commit

- [ ] **Step 1: Run focused tests**

Run:

```powershell
python scripts/test_topic_context_reading_ai.py
python scripts/test_programming_ai_flashcards.py
python scripts/test_coding_ai_topic_ui.py
python scripts/test_reading_study_modal.py
```

Expected: all exit 0.

- [ ] **Step 2: Run broader API/UI checks**

Run:

```powershell
python scripts/test_api_routes.py
cd apps/web
pnpm lint
pnpm build
```

Expected: all exit 0.

- [ ] **Step 3: Browser verification**

Start the app if needed, open the local study page, and verify:

- new topic modal context field appears under AI generation;
- `Recriar aula com IA` sits under/near `Iniciar estudo`;
- switching to `Modo flashcards` from a subject opens that subject deck;
- reading modal speaks text and deepening displays a temporary answer with copy-to-Notion.

- [ ] **Step 4: Commit**

Run:

```powershell
git add apps/api/schemas/schemas.py apps/api/services/coding_service.py apps/api/main.py apps/web/src/lib/api.ts apps/web/src/lib/browser-speech.ts apps/web/src/components/coding/CreateTopicModal.tsx apps/web/src/components/coding/CodingCurriculum.tsx apps/web/src/components/coding/TopicView.tsx scripts/test_topic_context_reading_ai.py docs/superpowers/plans/2026-08-11-topic-context-reading-ai.md
git commit -m "feat: improve topic context and reading ai tools"
```
