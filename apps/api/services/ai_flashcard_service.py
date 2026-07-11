from dataclasses import dataclass
import re
import unicodedata
from typing import Any, Iterable, Mapping


@dataclass(frozen=True)
class ValidatedCard:
    front: str
    back: str
    code_example: str | None = None
    question_type: str | None = None


def sanitize_context(value: Any) -> str:
    return " ".join(str(value or "").split())[:1000].rstrip()


def normalize_front(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(character for character in text if not unicodedata.combining(character))
    return " ".join(re.sub(r"[\W_]+", " ", text).split())


def _limited_text(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit].rstrip()


def _optional_text(value: Any, limit: int, *, preserve_lines: bool = False) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if not preserve_lines:
        text = " ".join(text.split())
    return text[:limit].rstrip()


def validate_card_batch(
    raw_cards: Iterable[object], existing_fronts: Iterable[str]
) -> list[ValidatedCard]:
    cards = list(raw_cards)
    if len(cards) != 5:
        raise ValueError("Exactly five cards are required")

    known_fronts = {normalize_front(front) for front in existing_fronts}
    batch_fronts: set[str] = set()
    validated: list[ValidatedCard] = []

    for raw_card in cards:
        if not isinstance(raw_card, Mapping):
            raise ValueError("Each card must be a JSON object")
        front = _limited_text(raw_card.get("front") or raw_card.get("question"), 500)
        back = _limited_text(raw_card.get("back") or raw_card.get("answer"), 2000)
        if not front or not back:
            raise ValueError("Card front and back must not be empty")

        normalized_front = normalize_front(front)
        if not normalized_front:
            raise ValueError("Card front must contain letters or numbers")
        if normalized_front in batch_fronts or normalized_front in known_fronts:
            raise ValueError("Card fronts must be unique")

        batch_fronts.add(normalized_front)
        validated.append(
            ValidatedCard(
                front=front,
                back=back,
                code_example=_optional_text(
                    raw_card.get("code_example"), 3000, preserve_lines=True
                ),
                question_type=_optional_text(raw_card.get("question_type"), 40),
            )
        )

    return validated
