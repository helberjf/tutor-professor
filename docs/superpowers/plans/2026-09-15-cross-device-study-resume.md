# Cross-Device Study Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make “Continuar de onde parou” reopen the authenticated child's most recent subject, lesson, topic, and study mode on every device.

**Architecture:** Store one validated `StudyResume` row per child. The API accepts typed identifiers, resolves ownership and current names, and returns a canonical internal URL; the web app records only successfully loaded study screens and consumes the canonical destination on the home page. Existing guided-session state remains a fallback for accounts that do not yet have a resume row.

**Tech Stack:** FastAPI, SQLModel, Alembic, PostgreSQL/SQLite, Next.js 15, React 19, TypeScript, Node source-contract tests, HTTPX integration tests.

---

## File map

- Create `apps/api/alembic/versions/0030_study_resume.py`: add the cross-device bookmark table.
- Modify `apps/api/models/database.py`: define the one-row-per-child `StudyResume` model.
- Modify `apps/api/schemas/schemas.py`: define the strict update payload and resolved response.
- Modify `apps/api/main.py`: validate resume targets, build canonical URLs, and expose GET/PUT endpoints.
- Create `scripts/test_study_resume.py`: exercise ownership, precedence, canonical links, and deletion fallback over HTTP.
- Modify `apps/web/src/lib/api.ts`: add resume types and client methods.
- Create `apps/web/src/lib/study-resume.ts`: centralize non-blocking resume writes and typed payloads.
- Modify `apps/web/src/app/page.tsx`: point the main button at the resolved resume destination.
- Modify `apps/web/src/app/session/page.tsx`, `apps/web/src/app/lesson/page.tsx`, and `apps/web/src/app/review/page.tsx`: record valid guided-language destinations.
- Modify `apps/web/src/app/study/page.tsx`: parse deep-link parameters and restore the diverse-study date/subject/lesson.
- Modify `apps/web/src/app/study/_components/CodingTab.tsx`: forward the requested programming destination.
- Modify `apps/web/src/components/coding/CodingCurriculum.tsx`: restore a programming subject/topic/mode and record loaded destinations.
- Modify `apps/web/src/app/study/_components/DiverseTab.tsx`: report the selected diverse subject/lesson after it exists on screen.
- Create `apps/web/scripts/test-cross-device-study-resume.mjs`: pin the navigation and tracking contracts.
- Modify `apps/web/package.json`: add the new web contract test to the test command used by the repository.

### Task 1: Pin the API behavior with a failing integration test

**Files:**
- Create: `scripts/test_study_resume.py`

- [ ] **Step 1: Write the HTTP integration test**

Create an isolated SQLite app test following `scripts/test_study_session_flow.py`. Register and approve one account, seed a `ProgrammingSubject` and `ProgrammingTopic`, then assert:

```python
empty = await client.get('/api/study/resume', headers=headers)
require(empty.status_code == 200, empty.text)
require(empty.json()['has_resume'] is False, 'fresh child must have no bookmark')

saved = await client.put(
    '/api/study/resume',
    headers=headers,
    json={
        'kind': 'coding_topic',
        'subject_id': subject_id,
        'topic_id': topic_id,
        'mode': 'reading',
    },
)
require(saved.status_code == 200, saved.text)
require(saved.json()['label'] == 'Python — Listas', saved.text)
require(
    saved.json()['href'] == (
        f'/study?tab=coding&mode=reading&subject_id={subject_id}&topic_id={topic_id}'
    ),
    saved.text,
)
```

The same test must also create an open guided session before saving the coding target and confirm coding remains the returned destination. Add a second account and confirm it cannot save the first child's identifiers. Delete the topic and confirm GET falls back to the owning programming subject; delete the subject and confirm GET falls back to `/study?tab=coding`.

- [ ] **Step 2: Run the test and verify RED**

Run: `python scripts/test_study_resume.py`

Expected: FAIL because `/api/study/resume` does not exist.

- [ ] **Step 3: Commit the failing test**

```text
git add scripts/test_study_resume.py
git commit -m "test: define cross-device study resume"
```

### Task 2: Add persistent storage and strict API schemas

**Files:**
- Create: `apps/api/alembic/versions/0030_study_resume.py`
- Modify: `apps/api/models/database.py`
- Modify: `apps/api/schemas/schemas.py`

- [ ] **Step 1: Add the SQLModel record**

Add beside `StudySession`:

```python
class StudyResume(SQLModel, table=True):
    __table_args__ = (UniqueConstraint('child_id'),)

    id: Optional[int] = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key='childprofile.id', index=True)
    kind: str = Field(max_length=32, index=True)
    context: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

- [ ] **Step 2: Add migration `0030`**

Create `studyresume` with `id`, `child_id`, `kind`, JSON `context`, and `updated_at`; add a unique constraint on `child_id`, a child index, and a kind index. Make `upgrade()` idempotent by checking `sa.inspect(op.get_bind()).has_table('studyresume')`; make `downgrade()` drop only that table.

- [ ] **Step 3: Add strict request and response schemas**

```python
StudyResumeKind = Literal[
    'guided_session', 'language_lesson', 'language_review',
    'coding_subject', 'coding_topic', 'coding_flashcards',
    'coding_questions', 'diverse_subject', 'diverse_lesson',
]

class StudyResumeUpdateSchema(BaseModel):
    kind: StudyResumeKind
    subject_id: Optional[Union[int, str]] = None
    topic_id: Optional[Union[int, str]] = None
    lesson_id: Optional[Union[int, str]] = None
    study_date: Optional[date] = None
    mode: Optional[Literal['reading', 'flashcards', 'questions']] = None

class StudyResumeSchema(BaseModel):
    has_resume: bool = False
    kind: Optional[StudyResumeKind] = None
    href: str = ''
    label: str = ''
    updated_at: Optional[datetime] = None
```

- [ ] **Step 4: Verify the migration and schema bootstrap**

Run: `python scripts/test_database_bootstrap.py`

Expected: all database bootstrap tests pass and Alembic head is `0030`.

- [ ] **Step 5: Commit persistence**

```text
git add apps/api/alembic/versions/0030_study_resume.py apps/api/models/database.py apps/api/schemas/schemas.py
git commit -m "feat: store each child's last study location"
```

### Task 3: Implement canonical resume resolution in the API

**Files:**
- Modify: `apps/api/main.py`
- Test: `scripts/test_study_resume.py`

- [ ] **Step 1: Import the model and schemas**

Add `StudyResume` to the database import and `StudyResumeSchema` / `StudyResumeUpdateSchema` to the schema import.

- [ ] **Step 2: Implement target resolution**

Add focused helpers near the study-session endpoints:

```python
def get_study_resume(session: Session, child_id: int) -> StudyResume | None: ...
def resolve_study_resume(session: Session, child: ChildProfile, record: StudyResume) -> StudyResumeSchema: ...
def fallback_study_resume(session: Session, child_id: int) -> StudyResumeSchema: ...
def normalize_resume_context(payload: StudyResumeUpdateSchema) -> dict: ...
```

For relational programming targets, load `ProgrammingSubject` and `ProgrammingTopic` and require that the subject belongs to the child and the topic belongs to that subject. Build URLs with `urlencode`, never with client-supplied text. For a deleted topic, keep only the valid subject destination; for a deleted subject, return the programming area. For diverse targets, load the requested `DiverseDay`, normalize its subjects with `normalize_subjects`, match opaque subject/lesson IDs, and fall back to the diverse tab if a nested item disappeared.

- [ ] **Step 3: Add the endpoints**

```python
@app.get('/api/study/resume', response_model=StudyResumeSchema)
def read_study_resume(request: Request, session: Session = Depends(get_session)) -> StudyResumeSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    record = get_study_resume(session, child.id or 0)
    if record is None:
        return fallback_study_resume(session, child.id or 0)
    return resolve_study_resume(session, child, record)

@app.put('/api/study/resume', response_model=StudyResumeSchema)
def write_study_resume(payload: StudyResumeUpdateSchema, request: Request,
                       session: Session = Depends(get_session)) -> StudyResumeSchema:
    require_parent_session(request, session)
    child = get_requested_child(request=request, session=session)
    # Validate by resolving before commit, then upsert one row for this child.
```

Use `HTTPException(404)` for identifiers that never belonged to the child. A GET of an older now-invalid bookmark must degrade safely and persist the normalized fallback.

- [ ] **Step 4: Run the API test and verify GREEN**

Run: `python scripts/test_study_resume.py`

Expected: PASS, including cross-account rejection and deletion fallbacks.

- [ ] **Step 5: Run existing session regression tests**

Run: `python scripts/test_study_session_flow.py`

Expected: PASS; guided queue resume still works.

- [ ] **Step 6: Commit the API**

```text
git add apps/api/main.py scripts/test_study_resume.py
git commit -m "feat: resolve canonical study resume targets"
```

### Task 4: Pin and implement the web resume client and home button

**Files:**
- Create: `apps/web/scripts/test-cross-device-study-resume.mjs`
- Create: `apps/web/src/lib/study-resume.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Write the failing web contract test**

Assert that `api.ts` exposes `getStudyResume` and `saveStudyResume`, the home page loads `api.getStudyResume()`, and the continue link uses `resume.href` rather than the fixed `/session` route. Assert that `study-resume.ts` catches failed bookmark writes so study screens never become unusable.

- [ ] **Step 2: Run the test and verify RED**

Run: `node apps/web/scripts/test-cross-device-study-resume.mjs`

Expected: FAIL because the resume API client does not exist.

- [ ] **Step 3: Add typed client support**

```typescript
export type StudyResumeKind =
  | 'guided_session' | 'language_lesson' | 'language_review'
  | 'coding_subject' | 'coding_topic' | 'coding_flashcards'
  | 'coding_questions' | 'diverse_subject' | 'diverse_lesson';

export interface StudyResume {
  has_resume: boolean;
  kind: StudyResumeKind | null;
  href: string;
  label: string;
  updated_at: string | null;
}
```

Add `getStudyResume` and `saveStudyResume` methods. Implement `rememberStudyLocation(payload)` as `void api.saveStudyResume(payload).catch(() => undefined)`.

- [ ] **Step 4: Update the home page**

Fetch resume data beside progress and level. Render “Continuar de onde parou” whenever `resume.has_resume`, set `href={resume.href}`, and show `resume.label`. Preserve “Iniciar estudos” as `/session?restart=1` only when an unfinished guided session exists; otherwise it remains `/session`.

- [ ] **Step 5: Run the web contract test and verify GREEN**

Run: `node apps/web/scripts/test-cross-device-study-resume.mjs`

Expected: PASS.

- [ ] **Step 6: Commit client and home navigation**

```text
git add apps/web/scripts/test-cross-device-study-resume.mjs apps/web/src/lib/study-resume.ts apps/web/src/lib/api.ts apps/web/src/app/page.tsx apps/web/package.json
git commit -m "feat: drive continue button from saved study location"
```

### Task 5: Restore and record programming destinations

**Files:**
- Modify: `apps/web/src/app/study/page.tsx`
- Modify: `apps/web/src/app/study/_components/CodingTab.tsx`
- Modify: `apps/web/src/components/coding/CodingCurriculum.tsx`
- Test: `apps/web/scripts/test-cross-device-study-resume.mjs`

- [ ] **Step 1: Extend the failing contract test**

Require the study page to parse `mode`, `subject_id`, and `topic_id`; require `CodingCurriculum` to receive these initial identifiers, load the owned subject and topic, and call `rememberStudyLocation` only after the requested content exists.

- [ ] **Step 2: Run the test and verify RED**

Run: `node apps/web/scripts/test-cross-device-study-resume.mjs`

Expected: FAIL on missing programming deep-link support.

- [ ] **Step 3: Parse and forward the deep link**

On first mount, accept `mode=reading|flashcards|questions`, positive integer `subject_id`, and positive integer `topic_id`. Store them as initial navigation state and pass them from `StudyPage` through `CodingTab` into `CodingCurriculum`.

- [ ] **Step 4: Restore the programming view**

After subjects load, find the requested subject. For flashcards, open its deck. Otherwise load the subject's topics, find the requested topic, and open reading or questions according to `mode`. If the topic is absent, remain on the valid subject; if the subject is absent, remain on the programming list.

- [ ] **Step 5: Record loaded programming content**

Call `rememberStudyLocation` when a subject, topic, questions view, or deck is on screen. Use IDs and mode only; labels remain server-owned.

- [ ] **Step 6: Run the contract test and verify GREEN**

Run: `node apps/web/scripts/test-cross-device-study-resume.mjs`

Expected: PASS.

- [ ] **Step 7: Commit programming resume**

```text
git add apps/web/src/app/study/page.tsx apps/web/src/app/study/_components/CodingTab.tsx apps/web/src/components/coding/CodingCurriculum.tsx apps/web/scripts/test-cross-device-study-resume.mjs
git commit -m "feat: reopen the last programming topic"
```

### Task 6: Record language and diverse-study destinations

**Files:**
- Modify: `apps/web/src/app/session/page.tsx`
- Modify: `apps/web/src/app/lesson/page.tsx`
- Modify: `apps/web/src/app/review/page.tsx`
- Modify: `apps/web/src/app/study/page.tsx`
- Modify: `apps/web/src/app/study/_components/DiverseTab.tsx`
- Test: `apps/web/scripts/test-cross-device-study-resume.mjs`

- [ ] **Step 1: Extend the failing contract test**

Require each valid language screen to call `rememberStudyLocation`, and require diverse deep links to preserve `date`, `subject_id`, and optional `lesson_id`.

- [ ] **Step 2: Run the test and verify RED**

Run: `node apps/web/scripts/test-cross-device-study-resume.mjs`

Expected: FAIL on missing language/diverse tracking.

- [ ] **Step 3: Record language screens**

Record `guided_session` after a non-empty session loads and after progress advances; record `language_lesson` after a lesson loads; record `language_review` after the review queue loads. Never record loading, error, or empty states.

- [ ] **Step 4: Restore and record diverse study**

Parse the canonical date and opaque IDs, load that date, select the matching normalized subject and lesson, and record only the target confirmed on screen. If an ID is absent, keep the safe diverse overview selected.

- [ ] **Step 5: Run the contract test and verify GREEN**

Run: `node apps/web/scripts/test-cross-device-study-resume.mjs`

Expected: PASS.

- [ ] **Step 6: Commit remaining destinations**

```text
git add apps/web/src/app/session/page.tsx apps/web/src/app/lesson/page.tsx apps/web/src/app/review/page.tsx apps/web/src/app/study/page.tsx apps/web/src/app/study/_components/DiverseTab.tsx apps/web/scripts/test-cross-device-study-resume.mjs
git commit -m "feat: remember language and subject study destinations"
```

### Task 7: Full verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused tests**

```text
python scripts/test_study_resume.py
python scripts/test_study_session_flow.py
node apps/web/scripts/test-cross-device-study-resume.mjs
```

Expected: all pass.

- [ ] **Step 2: Run database and API regression suites**

```text
python scripts/test_database_bootstrap.py
python scripts/test_api_routes.py
python scripts/test_serverless_readiness.py
python scripts/test_database_security.py
```

Expected: all pass with zero failures.

- [ ] **Step 3: Run frontend quality gates**

From `apps/web`:

```text
pnpm typecheck
pnpm lint
pnpm build
```

Expected: each exits with code 0.

- [ ] **Step 4: Inspect the final diff and worktree**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intentional changes are present.

- [ ] **Step 5: Manually verify the user journey**

Open a programming topic, return home, press “Continuar de onde parou”, and confirm the same subject/topic opens. Repeat after a fresh browser session to prove the server bookmark is used. Confirm an old guided session does not override a newer programming target.

- [ ] **Step 6: Commit any verification-only corrections**

If verification required corrections, commit only those corrections with `fix: complete cross-device study resume`; otherwise do not create an empty commit.
