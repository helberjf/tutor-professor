"""Real tutor routing with synthetic lessons in an in-memory database."""
import sys
import inspect
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))
from sqlmodel import Session, SQLModel, create_engine, select
from models.database import Lesson, LessonItem
from services.tutor_service import TutorService


class ChatContextTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.tutor = TutorService(Path(__file__).resolve().parents[1] / "apps/api/prompts/tutor_system_prompt.txt")
        for owner, language, word, translation in [
            (2, "English", "private-secret", "segredo"),
            (1, "French", "bleu", "azul"),
            (None, "English", "blue", "azul"),
            (None, "English", "cat", "gato"),
            (None, "English", "a", "um"),
            (1, "English", "good morning", "bom dia"),
        ]:
            lesson = Lesson(title="Synthetic", theme="test", objective="test", child_id=owner, target_language=language)
            self.session.add(lesson)
            self.session.flush()
            self.session.add(LessonItem(lesson_id=lesson.id, word_en=word, word_pt=translation,
                                        example_sentence_en=f"Say {word}.", example_sentence_pt=f"Diga {translation}."))
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def reply(self, message, history=None, language="English"):
        options = {"child_id": 1, "target_language": language}
        supported = inspect.signature(self.tutor.build_response).parameters
        return self.tutor.build_response(message, self.session, history,
                                         **{key: value for key, value in options.items() if key in supported})

    def test_hi_inside_word_is_not_a_greeting(self):
        response = self.tutor.build_response("What does this word mean?", self.session)
        self.assertNotIn("Tente dizer: Hello", response)

    def test_accented_greeting(self):
        self.assertIn("Oi!", self.reply("Olá!"))

    def test_safety_matches_words_not_grammar(self):
        response = self.reply("Explique a gramática de good morning")
        self.assertIn("bom dia", response)
        self.assertNotIn("segurança", response)

    def test_substring_is_not_a_translation(self):
        self.assertNotIn("cat significa", self.reply("Explique vacation"))

    def test_longest_matching_phrase_beats_short_word(self):
        self.assertIn("bom dia", self.reply("O que significa good morning?"))

    def test_only_current_language(self):
        response = self.reply("Como se diz azul?")
        self.assertIn("blue", response)
        self.assertNotIn("bleu", response)

    def test_french_response_is_not_hardcoded_english(self):
        response = self.reply("Como se diz azul?", language="French")
        self.assertIn("bleu", response)
        self.assertIn("francês", response)
        self.assertNotIn("inglês", response)

    def test_other_profile_content_is_not_used(self):
        self.assertNotIn("private-secret", self.reply("O que significa segredo?"))

    def test_unknown_question_requests_clarification(self):
        response = self.reply("Explique fotossíntese")
        self.assertIn("qual palavra ou frase", response.lower())
        self.assertNotIn("private-secret", response)

    def test_explicit_practice_uses_accessible_content(self):
        response = self.reply("Quero praticar")
        self.assertIn("significa", response)
        self.assertNotIn("private-secret", response)
        self.assertNotIn("bleu", response)

    def test_followup_uses_recent_topic(self):
        history = [{"role": "user", "content": "Como se diz azul?"},
                   {"role": "assistant", "content": "azul em inglês é blue."}]
        self.assertIn("Say blue.", self.reply("Pode dar um exemplo?", history))

    def test_unrelated_new_question_does_not_reuse_topic(self):
        history = [{"role": "user", "content": "Como se diz azul?"}]
        self.assertNotIn("blue", self.reply("Explique fotossíntese", history))

    def test_example_of_a_new_subject_does_not_reuse_old_topic(self):
        history = [{"role": "user", "content": "Como se diz azul?"}]
        self.assertNotIn("blue", self.reply("Dê um exemplo de fotossíntese", history))

    def test_example_words_do_not_replace_the_conversation_topic(self):
        cat = self.session.exec(select(LessonItem).where(LessonItem.word_en == "cat")).first()
        cat.example_sentence_en = "The cat is beautiful."
        self.session.add(cat)
        self.session.add(LessonItem(lesson_id=cat.lesson_id, word_en="beautiful", word_pt="bonito",
            example_sentence_en="A beautiful day.", example_sentence_pt="Um dia bonito."))
        self.session.commit()
        answer = self.reply("O que significa cat?")
        history = [{"role": "user", "content": "O que significa cat?"}, {"role": "assistant", "content": answer}]
        self.assertTrue(self.reply("Pode dar um exemplo?", history).startswith("cat significa gato."))


if __name__ == "__main__":
    unittest.main()
