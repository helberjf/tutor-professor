from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
MODE_HELPERS = ROOT / "apps" / "web" / "src" / "app" / "study" / "_lib" / "study-helpers.ts"
CODING_TAB = ROOT / "apps" / "web" / "src" / "app" / "study" / "_components" / "CodingTab.tsx"
CODING_CURRICULUM = ROOT / "apps" / "web" / "src" / "components" / "coding" / "CodingCurriculum.tsx"
TOPIC_VIEW = ROOT / "apps" / "web" / "src" / "components" / "coding" / "TopicView.tsx"
PRACTICE_MODAL = ROOT / "apps" / "web" / "src" / "components" / "questions" / "PracticeQuestionsModal.tsx"
DASHBOARD_OVERVIEW = ROOT / "apps" / "web" / "src" / "components" / "dashboard-overview.tsx"
WEB_API = ROOT / "apps" / "web" / "src" / "lib" / "api.ts"
MODELS = API / "models" / "database.py"
SCHEMAS = API / "schemas" / "schemas.py"
SERVICE = API / "services" / "coding_service.py"
MAIN = API / "main.py"
BOOTSTRAP = API / "database_bootstrap.py"


os.environ.setdefault("APP_ENV", "test")
sys.path.insert(0, str(API))


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def require_in(needle: str, haystack: str, message: str) -> None:
    require(needle in haystack, message)


def test_backend_contract() -> None:
    models_source = read(MODELS)
    schemas_source = read(SCHEMAS)
    service_source = read(SERVICE)
    main_source = read(MAIN)
    bootstrap_source = read(BOOTSTRAP)

    for expected in (
        "class ProgrammingQuestion(SQLModel, table=True)",
        "question_key: str",
        "attempt_count: int",
        "correct_count: int",
        "error_count: int",
        'UniqueConstraint("topic_id", "question_key")',
    ):
        require_in(expected, models_source, f"missing ProgrammingQuestion model contract: {expected}")

    for expected in (
        "class GeneratedProgrammingQuestionSchema",
        "class ProgrammingQuestionSchema",
        "class GenerateProgrammingQuestionsSchema",
        "class ProgrammingQuestionAttemptSchema",
        "class ProgrammingQuestionAttemptResultSchema",
        "class QuestionSubjectMetricsSchema",
        "question_metrics",
    ):
        require_in(expected, schemas_source, f"missing programming question schema: {expected}")

    for expected in (
        "def programming_question_key",
        "def validate_programming_question_batch",
        "def generate_additional_topic_questions",
        "Existing question prompts",
    ):
        require_in(expected, service_source, f"missing coding question service contract: {expected}")

    for expected in (
        "ProgrammingQuestion",
        "_persist_programming_questions",
        '@app.get("/api/coding/topics/{topic_id}/questions"',
        '@app.post("/api/coding/topics/{topic_id}/questions/generate"',
        '@app.post("/api/coding/questions/{question_id}/attempt"',
        "build_question_subject_metrics",
        "validate_programming_question_batch(",
        "generate_additional_topic_questions(",
    ):
        require_in(expected, main_source, f"missing coding question route/persistence contract: {expected}")

    require_in('"programmingquestion"', bootstrap_source, "database bootstrap must know ProgrammingQuestion")


def test_validator_rejects_repeated_or_invalid_questions() -> None:
    coding_service = importlib.import_module("services.coding_service")
    key = coding_service.programming_question_key
    validate = coding_service.validate_programming_question_batch
    validate_initial = coding_service.validate_initial_topic_content

    require(key("O que e IAM?") == key("o que é iam"), "question key must ignore case and accents")

    questions = [
        {
            "question": "Quando usar IAM roles?",
            "options": [
                "Para credenciais temporarias",
                "Para CSS",
                "Para DNS publico",
                "Para cache local",
            ],
            "correct_option": "Para credenciais temporarias",
            "explanation": "Roles reduzem o uso de credenciais long-lived.",
        }
    ]
    validated = validate(questions, expected_count=1, existing_questions=[])
    require(validated[0].question == "Quando usar IAM roles?", "validator should keep valid question text")
    require(validated[0].options == questions[0]["options"], "validator should keep valid options")

    try:
        validate(questions, expected_count=1, existing_questions=["Quando usar IAM roles?"])
    except ValueError:
        pass
    else:
        raise AssertionError("duplicate topic questions must be rejected")

    invalid_options = [{**questions[0], "options": ["A", "B", "C"], "correct_option": "A"}]
    try:
        validate(invalid_options, expected_count=1, existing_questions=[])
    except ValueError:
        pass
    else:
        raise AssertionError("multiple-choice questions must have four options")

    label_only_options = [{**questions[0], "options": ["A", "B", "C", "D"], "correct_option": "A"}]
    try:
        validate(label_only_options, expected_count=1, existing_questions=[])
    except ValueError:
        pass
    else:
        raise AssertionError("multiple-choice options must contain answer text, not only labels")

    invalid_answer = [{**questions[0], "correct_option": "Resposta ausente"}]
    try:
        validate(invalid_answer, expected_count=1, existing_questions=[])
    except ValueError:
        pass
    else:
        raise AssertionError("correct option must match one of the options")

    initial_content = {
        "title": "IAM",
        "sections": [
            {"title": f"Parte {index}", "body": "Conteudo", "code_example": "const ok = true;"}
            for index in range(1, 4)
        ],
        "quiz": [
            {
                "id": index,
                "question": f"Pergunta {index}?",
                "options": ["A", "B", "C", "D"],
                "correct_option": "A",
                "explanation": "Explicacao.",
            }
            for index in range(1, 6)
        ],
        "flashcards": [
            {
                "front": f"Como explicar conceito {index} em entrevista tecnica?",
                "back": "Resposta.",
                "code_example": "const ok = true;",
            }
            for index in range(1, 6)
        ],
    }
    try:
        validate_initial(initial_content, require_title=True)
    except ValueError:
        pass
    else:
        raise AssertionError("initial AI topic content must reject label-only quiz options")


def test_frontend_contract() -> None:
    mode_source = read(MODE_HELPERS)
    coding_tab_source = read(CODING_TAB)
    curriculum_source = read(CODING_CURRICULUM)
    topic_view_source = read(TOPIC_VIEW)
    dashboard_source = read(DASHBOARD_OVERVIEW)
    api_source = read(WEB_API)

    require_in("'questions'", mode_source, "CodingMode must include questions")
    for expected in (
        "Modo questões",
        "Treinar simulados por tópico",
        "setCodingMode('questions')",
        "ClipboardList",
    ):
        require_in(expected, coding_tab_source, f"missing questions mode selector: {expected}")

    for expected in (
        "focusMode === 'questions'",
        "openQuestionTopic",
        "questionsTopic",
        "returnToQuestions",
    ):
        require_in(expected, curriculum_source, f"missing questions navigation behavior: {expected}")

    for expected in (
        "export interface ProgrammingQuestion",
        "export interface ProgrammingQuestionAttemptResult",
        "export interface QuestionSubjectMetrics",
        "question_metrics",
        "getTopicQuestions",
        "generateCodingTopicQuestions",
        "submitCodingTopicQuestionAttempt",
        "/api/coding/topics/${topicId}/questions",
        "/api/coding/topics/${topicId}/questions/generate",
        "/api/coding/questions/${questionId}/attempt",
    ):
        require_in(expected, api_source, f"missing API client question contract: {expected}")

    for expected in (
        "Fazer simulado",
        "Gerar mais questões",
        "PracticeQuestionsModal",
        "questionPracticeOpen",
        "handleGenerateMoreQuestions",
        "api.getTopicQuestions(topicId)",
        "api.generateCodingTopicQuestions(topic.id",
        "submitCodingTopicQuestionAttempt",
        "Questões criadas não se repetem neste tópico.",
    ):
        require_in(expected, topic_view_source, f"missing TopicView question UI: {expected}")

    # The practice modal is shared with the diverse and English question modes, so
    # its markup lives in components/questions instead of inside TopicView.
    practice_modal_source = read(PRACTICE_MODAL)
    for expected in (
        "max-w-5xl",
        "selectedOption === question.correct_option",
        "onAnswer(question.id, option)",
    ):
        require_in(expected, practice_modal_source, f"missing practice modal question UI: {expected}")

    for expected in (
        "Questões por matéria",
        "Acertos e erros do Modo questões",
        "questionMetrics.map",
        "metric.correct_count",
        "metric.error_count",
        "metric.accuracy_percent",
    ):
        require_in(expected, dashboard_source, f"missing dashboard question metrics UI: {expected}")


def test_subject_wide_exam_contract() -> None:
    """A subject-level simulado draws from every topic, not one at a time."""
    main_source = read(MAIN)
    for expected in (
        '@app.get("/api/coding/subjects/{subject_id}/questions"',
        "def list_subject_questions",
        "ProgrammingQuestion.subject_id == subject_id",
        "_programming_question_has_usable_options(question)",
        "random.shuffle(usable)",
    ):
        require_in(expected, main_source, f"missing subject exam endpoint: {expected}")
    require_in(
        "subject is None or subject.child_id != child.id",
        main_source,
        "the subject exam must be scoped to the signed-in child",
    )
    # The limit is applied after the shuffle so a shorter exam still spans topics.
    shuffle_at = main_source.index("random.shuffle(usable)")
    limit_at = main_source.index("usable = usable[:limit]")
    require(shuffle_at < limit_at, "the question pool must be shuffled before the limit is applied")

    api_source = read(WEB_API)
    require_in("getSubjectQuestions:", api_source, "the API client must expose the subject exam")

    curriculum_source = read(CODING_CURRICULUM)
    for expected in (
        "Simulado da matéria",
        "api.getSubjectQuestions",
        "PracticeQuestionsModal",
        "65 questões (formato da prova)",
    ):
        require_in(expected, curriculum_source, f"missing subject exam UI: {expected}")


def main() -> None:
    test_backend_contract()
    test_validator_rejects_repeated_or_invalid_questions()
    test_frontend_contract()
    test_subject_wide_exam_contract()
    print("Topic questions mode checks passed.")


if __name__ == "__main__":
    main()
