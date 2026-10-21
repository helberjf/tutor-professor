from __future__ import annotations

from pathlib import Path
import re
from typing import Sequence
import unicodedata

from sqlalchemy import or_
from sqlmodel import Session, select

from models.database import Lesson, LessonItem


LANGUAGES = {
    "English": ("inglês", "Hello"), "French": ("francês", "Bonjour"),
    "Spanish": ("espanhol", "Hola"), "German": ("alemão", "Hallo"),
    "Italian": ("italiano", "Ciao"), "Russian": ("russo", "Привет"),
}


class TutorService:
    """Local vocabulary tutor. Unknown questions must not invent a new topic."""

    def __init__(self, prompt_path: str | Path):
        self.prompt_path = Path(prompt_path)
        self.system_prompt = self.prompt_path.read_text(encoding="utf-8").strip() if self.prompt_path.exists() else ""

    @staticmethod
    def _normalize(text: str) -> str:
        text = unicodedata.normalize("NFKD", text)
        return " ".join("".join(char for char in text if not unicodedata.combining(char)).lower().split())

    def _contains(self, text: str, phrase: str) -> bool:
        phrase = self._normalize(phrase)
        # A one-letter vocabulary item must not swallow an entire question.
        if len(phrase) == 1 or phrase in {"um", "uma", "as", "os", "de", "do", "da", "the", "an"}:
            return text.strip(" .!?'\"") == phrase
        return bool(phrase and re.search(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", text))

    def _known_word(self, items: Sequence[LessonItem], text: str) -> LessonItem | None:
        matches = [(len(self._normalize(word)), item) for item in items
                   for word in (item.word_en, item.word_pt) if self._contains(text, word)]
        return max(matches, key=lambda pair: pair[0])[1] if matches else None

    def build_response(
        self, message: str, session: Session, history: Sequence[object] | None = None,
        *, child_id: int | None = None, target_language: str = "English", child_level: int | None = None,
    ) -> str:
        text = self._normalize(message)
        language, hello = LANGUAGES.get(target_language, (target_language, ""))

        if any(self._contains(text, term) for term in
               ("violence", "blood", "weapon", "sex", "kill", "matar", "arma")):
            return f"Vamos manter o chat focado em aprender {language} com segurança. Quer praticar uma palavra?"
        if re.fullmatch(r"(?:hello|hi|ola|oi|bonjour|hola|hallo|ciao)[\s!.?]*", text):
            return f"Oi! Vamos aprender {language} juntos." + (f" Tente dizer: {hello}!" if hello else "")
        if re.fullmatch(r"(?:thank you|thanks|obrigado|obrigada)[\s!.?]*", text):
            return f"De nada! Quer aprender mais uma frase em {language}?"
        if self._contains(text, "your name") or self._contains(text, "seu nome"):
            return "Meu nome é Tutor and Professor. Vamos praticar juntos!"

        ownership = Lesson.child_id.is_(None) if child_id is None else or_(
            Lesson.child_id.is_(None), Lesson.child_id == child_id)
        query = select(LessonItem).join(Lesson).where(ownership, Lesson.target_language == target_language)
        if child_level is not None:
            query = query.where(or_(Lesson.child_id == child_id, Lesson.level.is_(None), Lesson.level == child_level))
        items = session.exec(query.order_by(Lesson.id, LessonItem.id)).all()
        known = self._known_word(items, text)
        followup = any(self._contains(text, term) for term in (
            "exemplo", "example", "repita", "repete", "repeat", "essa palavra", "esta palavra", "that word"))
        inherit_topic = bool(re.fullmatch(
            r"(?:(?:pode|poderia|voce pode) )?(?:(?:dar|me dar|mostrar|me mostrar) )?"
            r"(?:(?:um|outro|mais um) )?exemplo(?: disso| dessa palavra| dessa frase)?[\s!.?]*"
            r"|(?:repita|repete|repeat|essa palavra|esta palavra|that word|an example|another example)[\s!.?]*",
            text,
        ))
        if known is None and inherit_topic:
            # Only explicit follow-ups inherit a topic, never a new unrelated question.
            for previous in reversed(list(history or [])[-6:]):
                content = previous.get("content", "") if isinstance(previous, dict) else getattr(previous, "content", "")
                role = previous.get("role") if isinstance(previous, dict) else getattr(previous, "role", None)
                if role == "assistant":
                    # Examples may contain other vocabulary. Recover the subject
                    # of our answer instead of choosing a word from its example.
                    if " significa " in content:
                        content = content.partition(" significa ")[0].removeprefix("Vamos praticar: ")
                    elif f" em {language} é " in content:
                        content = content.partition(f" em {language} é ")[0]
                    else:
                        continue
                known = self._known_word(items, self._normalize(str(content)))
                if known is not None:
                    break
        if known is not None:
            if followup or self._contains(text, known.word_en):
                return f"{known.word_en} significa {known.word_pt}. Exemplo: {known.example_sentence_en}"
            return f"{known.word_pt} em {language} é {known.word_en}. Você consegue dizer: {known.word_en}?"

        if re.fullmatch(r"(?:quero praticar|vamos praticar|podemos praticar|praticar|practice|vamos aprender)[\s!.?]*", text) and items:
            focus = items[0]
            return f"Vamos praticar: {focus.word_en} significa {focus.word_pt}. Exemplo: {focus.example_sentence_en}"
        return f"Você pode dizer qual palavra ou frase quer praticar em {language}? Assim consigo ajudar sem mudar de assunto."
