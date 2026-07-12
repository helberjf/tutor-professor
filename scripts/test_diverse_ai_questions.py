"""Contract checks for appending AI questions to a canonical Diverse lesson."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / "apps/api/main.py").read_text(encoding="utf-8")
schemas = (ROOT / "apps/api/schemas/schemas.py").read_text(encoding="utf-8")
page = (ROOT / "apps/web/src/app/study/page.tsx").read_text(encoding="utf-8")
api = (ROOT / "apps/web/src/lib/api.ts").read_text(encoding="utf-8")

assert "class GenerateDiverseQuestionsSchema" in schemas
assert "study_date: date" in schemas.split("class GenerateDiverseQuestionsSchema", 1)[1]
assert "subject_index: int = Field(ge=0)" in schemas
assert "lesson_id: str = Field(min_length=1, max_length=80)" in schemas
assert "context: Optional[str] = Field(default=None, max_length=1000)" in schemas

assert '@app.post("/api/study/diverse/questions/generate"' in main
endpoint = main.split("def generate_diverse_questions", 1)[1]
endpoint = endpoint.split("\n@app.", 1)[0]
assert "exam-style" in endpoint.lower()
assert "validate_card_batch" in endpoint
assert "topic_ids" in endpoint
assert "phrase_generation_service.generate_json_text" in endpoint
assert endpoint.count("session.commit()") == 2  # optional legacy migration + append
assert "session.delete(" not in endpoint
assert endpoint.count("phrase_generation_service.generate_json_text") == 1
assert "_TECHNICAL_SUBJECT_TERMS" not in main
assert "_is_technical_diverse_subject" not in main
assert "Determine from the subject whether it is technical" in endpoint
assert "PRIORITIZE technical-interview questions" in endpoint
assert "otherwise create exam-style" in endpoint
assert "_diverse_question_lock" in endpoint
assert endpoint.index("phrase_generation_service.generate_json_text") < endpoint.index(
    "with _diverse_question_lock"
)
assert "@contextmanager" in main
assert "entry.users += 1" in main
assert "entry.users -= 1" in main
assert "_diverse_question_locks.pop(key" in main
assert "def _cas_update_diverse_day" in main
assert "update(DiverseDay)" in main
assert "DiverseDay.updated_at == expected_updated_at" in main
assert "result.rowcount" in main
put_endpoint = main.split("def upsert_diverse_day", 1)[1].split("\n\ndef ", 1)[0]
assert "_cas_update_diverse_day" in put_endpoint
assert "_cas_update_diverse_day" in endpoint
assert "expected_subject_identity" in endpoint
assert "expected_lesson_identity" in endpoint
assert endpoint.count("_ensure_diverse_question_capacity") == 2
assert "selected_subject_id" in endpoint
assert 'subject.get("id") == selected_subject_id' in endpoint
assert 'lesson.get("id") == selected_lesson_id' in endpoint
post_ai = endpoint.split("with _diverse_question_lock", 1)[1]
assert "current_subjects[payload.subject_index]" not in post_ai
assert "has_canonical_subject_identities" in endpoint
assert endpoint.index("_cas_update_diverse_day") < endpoint.index(
    "phrase_generation_service.generate_json_text"
)
assert "payload.original_identity_metadata" in put_endpoint
assert "stored_identities_are_canonical" in put_endpoint
assert 'len(subject.get("topics") or []) > 1545' in main
assert 'len(lesson.get("topic_ids") or []) > 45' in main
requested_child = main.split("def get_requested_child", 1)[1].split("\n\ndef ", 1)[0]
assert 'request.headers.get("x-child-id")' in requested_child
assert "selected_child.id != requested_child_id" in requested_child
assert 'status_code=400, detail="X-Child-ID invalido."' in requested_child

# Web client and both non-flashcard entry points use the canonical endpoint.
assert "generateDiverseQuestions" in api
client = api.split("generateDiverseQuestions:", 1)[1].split("getTodayQuiz:", 1)[0]
assert "'/api/study/diverse/questions/generate'" in client
assert "method: 'POST'" in client
assert "study_date: string" in client
assert "subject_index: number" in client
assert "lesson_id: string" in client
assert "context?: string" in client

assert "async function generateMoreDiverseQuestions(subjectId: string, lessonId: string, context?: string)" in page
generation = page.split("async function generateMoreDiverseQuestions", 1)[1].split("\n  function ", 1)[0]
assert generation.index("api.saveDiverseDay") < generation.index("api.generateDiverseQuestions")
assert generation.index("resolveDiverseGenerationTarget(saved, subjectId, lessonId)") < generation.index(
    "api.generateDiverseQuestions"
)
assert "study_date: generationDate" in generation
assert "subject_index: target.subjectIndex" in generation
assert "lesson_id: lessonId" in generation
assert "generateAndSynchronizeDiverseQuestions" in generation
assert "const outcome = await generateAndSynchronizeDiverseQuestions" in generation
assert "generate: () => api.generateDiverseQuestions" in generation
assert "installConfirmed:" in generation
assert "refresh: () => api.getDiverseDay(generationDate)" in generation
assert "diverseDayRef.current = outcome.day" in generation
assert "setDiverseDay(outcome.day)" in generation
assert "outcome.synchronized" in generation
assert "recarregue a página se necessário" in generation
assert "err instanceof ApiError && err.status === 409" in generation
assert generation.index("} catch (err) {") > generation.index(
    "const outcome = await generateAndSynchronizeDiverseQuestions"
), "save and generation conflicts must share the same refetch recovery"
assert "diverseQuestionGenerationLockRef" in page
assert "diverseMutationLockRef" in page
for mutation_name in (
    "addDiverseSubject",
    "addDiverseTopicsBulk",
    "rateDiverseTopic",
    "rateDiverseLessonTopic",
    "updateDiverseTopicAnswer",
    "removeDiverseSubject",
    "toggleDiverseTopic",
    "updateDiverseTopicText",
    "updateDiverseLessonBlock",
    "updateDiverseLessonQuestion",
    "removeDiverseLessonBlock",
    "updateDiverseSubjectName",
):
    mutation = page.split(f"function {mutation_name}", 1)[1].split("\n  function ", 1)[0]
    assert "diverseMutationLockRef.current" in mutation, f"{mutation_name} must be blocked during generation"

# One selector-based form serves Lista/Revisar and one implicit form serves a lesson's Visualizar view.
assert page.count("Criar mais questões") >= 2
assert "fixedQuestionGenerationLesson" in page
assert "questionGenerationLessons" in page
assert "activeTab !== 'view'" in page
assert "activeTab === 'view'" in page
assert 'value={lesson.id}' in page
assert "diverseQuestionContext" in page
assert "maxLength={1000}" in page
assert "Serão criadas 5 questões" in page
assert 'role="alert"' in page
assert "savingDiverse || loadingDiverse || generatingDiverseQuestions" in page
assert "savingDiverse || loadingDiverse || questionGenerationBusy" in page

# Mounted review sessions reconcile only when canonical topic IDs change.
assert "reconcileStudyQueueByTopicIds" in page
assert "const topicIdSignature = JSON.stringify(subject.topics.map((topic) => topic.id))" in page
assert "previousStudyTopicIdsRef" in page
reconcile_effect = page.split("// Reconcile the mounted review queue by canonical IDs.", 1)[1].split(
    "  const doneCount", 1
)[0]
assert "JSON.parse(topicIdSignature)" in reconcile_effect
assert "reconcileStudyQueueByTopicIds(current, previousTopicIds, nextTopicIds)" in reconcile_effect
assert "previousStudyTopicIdsRef.current = nextTopicIds" in reconcile_effect
assert "}, [topicIdSignature]);" in reconcile_effect
assert "subject.topics" not in reconcile_effect
