from __future__ import annotations

from pathlib import Path
from typing import Sequence
import unicodedata

from sqlmodel import Session, select

from models.database import Lesson, LessonItem, ReviewItem


class TutorService:
    def __init__(self, prompt_path: str | Path):
        self.prompt_path = Path(prompt_path)
        self.system_prompt = self._load_prompt()

    def _load_prompt(self) -> str:
        if not self.prompt_path.exists():
            return ""
        return self.prompt_path.read_text(encoding="utf-8").strip()

    def _normalize(self, text: str) -> str:
        text = unicodedata.normalize("NFKD", text)
        text = "".join(char for char in text if not unicodedata.combining(char))
        return text.lower().strip()

    def _find_known_word(self, session: Session, normalized_message: str) -> LessonItem | None:
        lesson_items = session.exec(select(LessonItem)).all()
        for lesson_item in lesson_items:
            if self._normalize(lesson_item.word_en) in normalized_message:
                return lesson_item
            if self._normalize(lesson_item.word_pt) in normalized_message:
                return lesson_item
        return None

    def _get_focus_word(self, session: Session) -> LessonItem | None:
        lesson = session.exec(
            select(Lesson).where(Lesson.is_completed == False).order_by(Lesson.id)
        ).first()
        if lesson is None:
            lesson = session.exec(select(Lesson).order_by(Lesson.id.desc())).first()
        if lesson is None:
            return None

        lesson_item = session.exec(
            select(LessonItem).where(LessonItem.lesson_id == lesson.id).order_by(LessonItem.id)
        ).first()
        if lesson_item is not None:
            return lesson_item

        hardest_item = session.exec(
            select(ReviewItem).order_by(ReviewItem.difficulty_score.desc(), ReviewItem.error_count.desc())
        ).first()
        if hardest_item is None:
            return None

        return LessonItem(
            word_en=hardest_item.word_en,
            word_pt=hardest_item.word_pt,
            example_sentence_en=f"{hardest_item.word_en} is a fun English phrase.",
            example_sentence_pt=f"{hardest_item.word_pt} e uma palavra divertida.",
        )

    def build_response(
        self,
        message: str,
        session: Session,
        history: Sequence[object] | None = None,
    ) -> str:
        normalized_message = self._normalize(message)
        prompt_rules = self._normalize(self.system_prompt)
        use_bilingual = "portugues" in prompt_rules or "portuguese" in prompt_rules
        _ = history

        if any(term in normalized_message for term in ["violence", "blood", "weapon", "sex", "kill", "matar", "arma"]):
            if use_bilingual:
                return "Vamos falar de ingles com seguranca. Quer praticar uma cor ou um animal?"
            return "Vamos manter o chat focado em aprender ingles. Quer praticar uma cor?"

        if any(term in normalized_message for term in ["hello", "hi", "ola", "oi"]):
            if use_bilingual:
                return "Oi! Vamos aprender uma frase nova? Tente dizer: Hello!"
            return "Oi! Vamos aprender uma frase nova? Tente dizer: Hello!"

        if any(term in normalized_message for term in ["thank you", "thanks", "obrigado", "obrigada"]):
            if use_bilingual:
                return "De nada! Quer aprender mais uma frase em ingles?"
            return "De nada! Quer aprender mais uma frase em ingles?"

        if "your name" in normalized_message or "seu nome" in normalized_message:
            if use_bilingual:
                return "I am Tutor and Professor. Eu adoro aprender com voce!"
            return "I am Tutor and Professor. I love learning with you!"

        known_word = self._find_known_word(session=session, normalized_message=normalized_message)
        if known_word is not None:
            if self._normalize(known_word.word_pt) in normalized_message:
                return (
                    f"{known_word.word_pt} em ingles e {known_word.word_en}. "
                    f"Voce consegue dizer: {known_word.word_en}?"
                )

            return (
                f"{known_word.word_en} significa {known_word.word_pt}. "
                f"Exemplo: {known_word.example_sentence_en}"
            )

        focus_word = self._get_focus_word(session=session)
        if focus_word is None:
            if use_bilingual:
                return "Oi! Vamos aprender ingles juntos. Diga: Hello!"
            return "Oi! Vamos aprender ingles juntos. Diga: Hello!"

        return (
            f"Vamos praticar uma frase. {focus_word.word_en} significa {focus_word.word_pt}. "
            f"Voce pode repetir: {focus_word.word_en}?"
        )
