"""Modo questões (simulado) for study areas outside the programming curriculum."""
from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
MODELS = API / "models" / "database.py"
SCHEMAS = API / "schemas" / "schemas.py"
MAIN = API / "main.py"
MIGRATION = API / "alembic" / "versions" / "0009_study_questions.py"
WEB = ROOT / "apps" / "web" / "src"
WEB_API = WEB / "lib" / "api.ts"
PRACTICE_MODAL = WEB / "components" / "questions" / "PracticeQuestionsModal.tsx"
QUESTIONS_PANEL = WEB / "components" / "questions" / "StudyQuestionsPanel.tsx"
TOPIC_VIEW = WEB / "components" / "coding" / "TopicView.tsx"
DIVERSE_TAB = WEB / "app" / "study" / "_components" / "DiverseTab.tsx"
ENGLISH_TAB = WEB / "app" / "study" / "_components" / "EnglishTab.tsx"
ENGLISH_QUESTIONS = WEB / "app" / "study" / "_components" / "EnglishQuestionsSection.tsx"

os.environ.setdefault("APP_ENV", "test")
sys.path.insert(0, str(API))

from services.study_question_service import (  # noqa: E402
    QUESTIONS_PER_BATCH,
    MAX_SOURCE_CONTENT_CHARS,
    build_questions_prompt,
    build_source_content,
    validate_study_question_batch,
)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def valid_question(prompt: str) -> dict:
    return {
        "question": prompt,
        "options": [
            "A fotossintese converte luz em energia quimica",
            "A fotossintese converte energia quimica em luz",
            "A fotossintese ocorre apenas no escuro",
            "A fotossintese acontece so em animais",
        ],
        "correct_option": "A fotossintese converte luz em energia quimica",
        "explanation": "As plantas usam a luz para produzir glicose.",
    }


def test_source_content_is_cleaned_and_bounded() -> None:
    require(
        build_source_content(["  primeiro  bloco ", "", "   ", "segundo"]) == "primeiro bloco\nsegundo",
        "source content must collapse whitespace and drop empty blocks",
    )
    placeholder = build_source_content([])
    require(placeholder.startswith("(sem material salvo"), "empty material must fall back to a placeholder")
    bounded = build_source_content(["palavra " * 5000])
    require(
        len(bounded) <= MAX_SOURCE_CONTENT_CHARS,
        "source content must stay within the prompt budget",
    )


def test_prompt_carries_area_language_rule() -> None:
    english = build_questions_prompt(
        area="english",
        subject_name="Ingles",
        topic_title="Greetings",
        source_content="hello, good morning",
        existing_questions=[],
        user_context="",
        expected_count=QUESTIONS_PER_BATCH,
    )
    require("aula de ingl" in english, "english prompt must name the area")
    require(
        "keep the English being taught in English" in english,
        "english prompt must keep the target language in English",
    )
    require("(nenhuma)" in english, "empty existing questions must render a placeholder")

    diverse = build_questions_prompt(
        area="diverse",
        subject_name="Biologia",
        topic_title="Fotossintese",
        source_content="clorofila",
        existing_questions=["Ja perguntei isso?"],
        user_context="foco em pegadinhas",
        expected_count=QUESTIONS_PER_BATCH,
    )
    require("All text must be in Portuguese" in diverse, "diverse prompt must ask for Portuguese")
    require("Ja perguntei isso?" in diverse, "existing prompts must be sent so they are not repeated")
    require("foco em pegadinhas" in diverse, "user context must reach the prompt")
    require(
        "The explanation must say why the correct option is correct" in diverse,
        "the prompt must demand a real explanation, not a restatement",
    )


def test_validation_matches_the_programming_contract() -> None:
    validated = validate_study_question_batch(
        [valid_question(f"Questao {index}") for index in range(QUESTIONS_PER_BATCH)],
        expected_count=QUESTIONS_PER_BATCH,
        existing_questions=[],
    )
    require(len(validated) == QUESTIONS_PER_BATCH, "a full batch must validate")
    require(all(item.explanation for item in validated), "every question must carry an explanation")
    require(all(len(item.options) == 4 for item in validated), "every question must carry four options")

    for label, batch, existing in (
        ("short batch", [valid_question("Unica")], []),
        (
            "repeated prompt",
            [valid_question("Repetida") for _ in range(QUESTIONS_PER_BATCH)],
            [],
        ),
        (
            "prompt already saved",
            [valid_question(f"Questao {index}") for index in range(QUESTIONS_PER_BATCH)],
            ["Questao 0"],
        ),
    ):
        try:
            validate_study_question_batch(
                batch, expected_count=QUESTIONS_PER_BATCH, existing_questions=existing
            )
        except ValueError:
            continue
        raise AssertionError(f"{label} must be rejected")

    missing_explanation = valid_question("Sem explicacao")
    missing_explanation["explanation"] = "   "
    try:
        validate_study_question_batch(
            [missing_explanation] + [valid_question(f"Q{index}") for index in range(4)],
            expected_count=QUESTIONS_PER_BATCH,
            existing_questions=[],
        )
    except ValueError:
        pass
    else:
        raise AssertionError("a question without an explanation must be rejected")


def test_backend_contract() -> None:
    models = read(MODELS)
    require("class StudyQuestion(SQLModel, table=True)" in models, "StudyQuestion model is missing")
    for expected in (
        'name="uq_studyquestion_identity"',
        "explanation: str = Field(min_length=1, max_length=2000)",
        "attempt_count: int",
        "correct_count: int",
        "error_count: int",
    ):
        require(expected in models, f"StudyQuestion model contract missing: {expected}")

    schemas = read(SCHEMAS)
    for expected in (
        "class StudyQuestionSchema",
        "class GenerateStudyQuestionsSchema",
        "class StudyQuestionAttemptSchema",
        "class StudyQuestionAttemptResultSchema",
        'StudyQuestionArea = Literal["diverse", "english"]',
    ):
        require(expected in schemas, f"study question schema missing: {expected}")

    main = read(MAIN)
    for expected in (
        '@app.get("/api/study/questions"',
        '@app.post("/api/study/questions/generate"',
        '@app.post("/api/study/questions/{question_id}/attempt"',
        "def _diverse_lesson_source_content",
        "def _english_lesson_source_content",
        "_study_question_has_usable_options",
    ):
        require(expected in main, f"study question endpoint missing: {expected}")
    require(
        "question.child_id != child.id" in main,
        "study question attempts must be scoped to the signed-in child",
    )

    migration = read(MIGRATION)
    require('revision: str = "0009"' in migration, "migration 0009 must declare its revision")
    require('down_revision: Union[str, None] = "0008"' in migration, "migration 0009 must follow 0008")
    require('op.create_table(\n        "studyquestion"' in migration, "migration must create studyquestion")


def test_frontend_contract() -> None:
    web_api = read(WEB_API)
    for expected in (
        "export interface StudyQuestion {",
        "export interface StudyQuestionTarget {",
        "getStudyQuestions:",
        "generateStudyQuestions:",
        "submitStudyQuestionAttempt:",
    ):
        require(expected in web_api, f"web api client missing: {expected}")

    modal = read(PRACTICE_MODAL)
    require("export interface PracticeQuestion {" in modal, "shared modal must expose its question shape")
    require("export function PracticeQuestionsModal" in modal, "shared modal must be exported")
    require(
        "{question.explanation}" in modal,
        "the simulado must show the explanation for the correct answer",
    )
    require("Fazer novamente" in modal, "the simulado must allow retrying the session")

    topic_view = read(TOPIC_VIEW)
    require(
        "from '@/components/questions/PracticeQuestionsModal'" in topic_view,
        "programming must reuse the shared simulado modal instead of a private copy",
    )
    require(
        "function PracticeQuestionsModal(" not in topic_view,
        "the private copy of the simulado modal must be gone",
    )

    panel = read(QUESTIONS_PANEL)
    for expected in ("Fazer simulado", "Modo questões", "api.generateStudyQuestions", "api.getStudyQuestions"):
        require(expected in panel, f"study questions panel missing: {expected}")

    diverse = read(DIVERSE_TAB)
    require("StudyQuestionsPanel" in diverse, "diverse subjects must offer the simulado")
    require("area: 'diverse'" in diverse, "diverse panel must target the diverse area")

    english_tab = read(ENGLISH_TAB)
    require("EnglishQuestionsSection" in english_tab, "the English tab must offer the simulado")
    english = read(ENGLISH_QUESTIONS)
    require("area: 'english'" in english, "English panel must target the english area")
    require("api.getAllLessons" in english, "English simulado must pick from the saved lessons")
    require('id="english-questions"' in english, "English questions must have a deep-link anchor")
    require('id="english-grammar"' in english, "English grammar must have a deep-link anchor")
    require("Modo gramática" in english, "English must offer a separate grammar practice mode")
    require("`grammar:${selected.id}`" in english, "grammar questions must be stored separately from general lesson questions")
    panel = read(QUESTIONS_PANEL)
    require("generationContext" in panel, "question panel must support mode-specific generation guidance")
    require("contextMaxLength" in panel, "question panel must reserve space for mode-specific generation guidance")
    require("maxLength={contextMaxLength}" in panel, "textarea must not allow more context than the API accepts")

    main = read(MAIN)
    require("resolve_english_lesson_topic_key" in main, "backend must resolve prefixed English question topic keys")
    require('"grammar:"' in main, "backend must accept grammar-prefixed English lesson keys")


def main() -> None:
    for name, test in sorted(globals().items()):
        if name.startswith("test_") and callable(test):
            test()
    print("Study questions mode checks passed.")


if __name__ == "__main__":
    main()
