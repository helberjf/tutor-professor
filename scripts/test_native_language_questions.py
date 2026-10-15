"""The question a student reads is written in their own language.

A lesson question asks about the language being learned; the statement that
says *what* is being asked is not part of the exercise. Written in the language
the student is still learning, it costs them the question without telling
anybody anything about the content. So:

  - the offline question bank follows the profile's explanations language;
  - the AI prompt says the statement must be written in that language;
  - a Google account, which never sees the registration form that asks for it,
    is sent through the guided first run where the question is asked, and keeps
    Portuguese if it answers nothing.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
TMP_DIR = Path(tempfile.mkdtemp(prefix="tutor-native-language-"))

os.environ.setdefault("DATABASE_URL", f"sqlite:///{(TMP_DIR / 'native.sqlite').as_posix()}")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-for-native-language")
os.environ.setdefault("TTS_PROVIDER", "none")
os.environ.setdefault("AUDIO_CACHE_DIR", str(TMP_DIR / "audio"))
os.environ.setdefault("GEMINI_API_KEY", "")
os.environ.setdefault("ADMIN_EMAIL", "native-admin@example.com")

sys.path.insert(0, str(API_DIR))

from services.language_question_service import build_language_questions_prompt  # noqa: E402
from services.offline_question_service import build_offline_lesson_questions  # noqa: E402

ITEMS = [
    {
        "word_en": "Bonjour",
        "word_pt": "Bom dia",
        "example_sentence_en": "Bonjour, comment allez-vous?",
        "example_sentence_pt": "Bom dia, como vai?",
    },
    {
        "word_en": "Merci",
        "word_pt": "Obrigado",
        "example_sentence_en": "Merci beaucoup!",
        "example_sentence_pt": "Muito obrigado!",
    },
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def test_offline_questions_follow_the_explanations_language() -> None:
    portuguese = build_offline_lesson_questions(ITEMS, base_language="Portuguese")
    fronts = [question.front for question in portuguese]
    require(
        any(front.startswith("O que significa") for front in fronts),
        f"Portuguese statements expected: {fronts}",
    )
    require(
        not any(front.startswith(("What does", "Complete the sentence", "How do you say")) for front in fronts),
        f"an English statement reached a Portuguese profile: {fronts}",
    )

    english = build_offline_lesson_questions(ITEMS, base_language="English")
    english_fronts = [question.front for question in english]
    require(
        any(front.startswith("What does") for front in english_fronts),
        f"English statements expected: {english_fronts}",
    )
    require(
        not any(front.startswith(("O que significa", "Complete a frase", "Como se diz")) for front in english_fronts),
        f"a Portuguese statement reached an English profile: {english_fronts}",
    )

    # The two banks must stay the same exercises, only worded differently.
    require(
        [question.back for question in portuguese] == [question.back for question in english],
        "the answers must not depend on the language of the statement",
    )

    # Nobody passed a language: the old behaviour, Portuguese, is what happens.
    require(
        [question.front for question in build_offline_lesson_questions(ITEMS)] == fronts,
        "no language given should mean Portuguese, as before",
    )


def test_the_prompt_demands_the_statement_in_the_base_language() -> None:
    prompt = build_language_questions_prompt(
        lesson_title="Au bureau",
        theme="Trabalho",
        objective="Falar de reuniões",
        target_language="French",
        base_language="Portuguese",
        lesson_items=ITEMS,
        phrase_breakdowns=[],
        existing_fronts=[],
        context=None,
    )
    require(
        "escrito inteiramente em Portuguese" in prompt,
        f"the prompt does not pin the statement language: {prompt[:400]}",
    )
    require(
        "Nunca escreva o enunciado em outro idioma que não seja Portuguese" in prompt,
        f"the prompt does not forbid a third language: {prompt[:400]}",
    )
    require("Idioma-alvo: French" in prompt, "the target language must still reach the prompt")


def test_a_new_google_account_is_asked_before_it_lands() -> None:
    import main  # noqa: E402  # imported late: it boots the app's configuration

    class _User:
        def __init__(self, completed):
            self.onboarding_completed_at = completed

    new_account = _User(None)
    returning = _User("2026-10-01")

    require(
        main.oauth_destination("/account", new_account) == "/onboarding",
        "a new Google account must be asked for its language before anything else",
    )
    require(
        main.oauth_destination(None, new_account) == "/onboarding",
        "the default landing must lead a new Google account to the first run",
    )
    require(
        main.oauth_destination("/study-log", new_account) == "/study-log",
        "a link the person asked for wins over the first run",
    )
    require(
        main.oauth_destination("/account", returning) == "/account",
        "an account that already answered must not be asked again",
    )


def test_choice_questions_name_the_studied_language() -> None:
    from services.offline_question_service import build_offline_choice_questions

    french = build_offline_choice_questions(
        ITEMS, base_language="Portuguese", target_language="French"
    )
    statements = [question.question for question in french]
    require(
        any("em francês" in statement for statement in statements),
        f"the studied language must be named: {statements}",
    )
    require(
        not any("em inglês" in statement for statement in statements),
        f"'em inglês' reached a French student: {statements}",
    )
    english = build_offline_choice_questions(
        ITEMS, base_language="English", target_language="French"
    )
    english_statements = [question.question for question in english]
    require(
        any("in French" in statement for statement in english_statements),
        f"English wording expected: {english_statements}",
    )
    require(
        not any("O que significa" in s or "Como se diz" in s for s in english_statements),
        f"Portuguese statement for an English-base profile: {english_statements}",
    )
    # Nothing given: the old behaviour, an English course for a Portuguese reader.
    default = [q.question for q in build_offline_choice_questions(ITEMS)]
    require(any("em inglês" in s for s in default), f"default wording changed: {default}")


def test_saved_english_statements_get_a_native_front() -> None:
    from datetime import datetime

    from schemas.schemas import LessonQuestionSchema

    def schema(front, translation):
        return LessonQuestionSchema(
            id=1, lesson_id=1, target_language="French", question_type="grammar",
            front=front, back="b", front_translation=translation,
            created_at=datetime(2026, 10, 15),
        )

    saved = schema(
        "How do you express that an action is currently in progress in French?",
        "Como você expressa que uma ação está em andamento em francês?",
    )
    require(
        saved.native_front == "Como você expressa que uma ação está em andamento em francês?",
        "an AI statement in the wrong language must expose its translation",
    )
    require(
        schema("Como se diz bom dia?", "Como se diz bom dia?").native_front is None,
        "a statement already in the native language needs no second line",
    )
    offline = schema('O que significa "Bonjour"?', "Bom dia")
    require(
        offline.native_front is None,
        "an offline row keeps the ANSWER in front_translation; it must never be shown",
    )


if __name__ == "__main__":
    test_offline_questions_follow_the_explanations_language()
    test_the_prompt_demands_the_statement_in_the_base_language()
    test_a_new_google_account_is_asked_before_it_lands()
    test_choice_questions_name_the_studied_language()
    test_saved_english_statements_get_a_native_front()
    print("native language questions: all checks passed")
