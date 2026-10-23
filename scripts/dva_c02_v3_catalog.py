"""Parse and validate the DVA-C02 v3 lessons kept as plain-text files.

Each lesson lives in scripts/content/dva_c02_v3/NN-slug.md so it can be read
and reviewed like a document. The reading pane renders bodies as plain text
(whitespace-pre-wrap) and shuffles quiz options without letters, so the
validator rejects Markdown leftovers and "A./B." references in comments.

Format:
    # 01. Lesson title
    ## Section title
    body lines...
    ```python            (optional, at most one per section, always last)
    code
    ```
    ## Questões
    Q: question text
    - wrong option
    + correct option
    E: comment shown after answering
    ## Flashcards
    F: front
    V: back
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parent / "content" / "dva_c02_v3"
QUIZ_PER_LESSON = 10
CARDS_PER_LESSON = 10
MIN_SECTIONS = 8
MAX_SECTION_CHARS = 2600

_TITLE_RE = re.compile(r"^\d{2}\. \S")
# A comment that names options by letter is meaningless once options are shuffled.
_LETTER_REF_RE = re.compile(r"(^|[\s(])[A-D][\.\)](\s|$)|\b(alternativa|opção|letra) [A-D]\b")
_MARKDOWN_RE = re.compile(r"\*\*|`|^#{1,6} ", re.M)


class CatalogError(ValueError):
    pass


@dataclass
class Lesson:
    order: int
    title: str
    path: Path
    sections: list[dict] = field(default_factory=list)
    quiz: list[dict] = field(default_factory=list)
    flashcards: list[dict] = field(default_factory=list)

    def ai_content(self) -> dict:
        quiz = [{"id": i, **q} for i, q in enumerate(self.quiz, start=1)]
        return {"title": self.title, "sections": self.sections, "quiz": quiz, "flashcards": self.flashcards}


def _strip_block(lines: list[str]) -> str:
    return "\n".join(lines).strip("\n").rstrip()


def _split_code(lines: list[str], where: str) -> tuple[str, str | None]:
    fences = [i for i, line in enumerate(lines) if line.startswith("```")]
    if not fences:
        return _strip_block(lines), None
    if len(fences) != 2:
        raise CatalogError(f"{where}: use at most one code block per section")
    start, end = fences
    if _strip_block(lines[end + 1:]):
        raise CatalogError(f"{where}: the code block must be the last thing in a section")
    return _strip_block(lines[:start]), _strip_block(lines[start + 1:end])


def _parse_quiz(lines: list[str], where: str, normalize) -> list[dict]:
    items: list[dict] = []
    current: dict | None = None
    mode = None
    for raw in lines:
        line = raw.rstrip()
        if line.startswith("Q: "):
            current = {"question": [line[3:]], "options": [], "correct": [], "explanation": []}
            items.append(current)
            mode = "question"
        elif current is None:
            if line.strip():
                raise CatalogError(f"{where}: text before the first question")
        elif line.startswith(("- ", "+ ")) and mode in {"question", "options"}:
            current["options"].append(line[2:].strip())
            if line.startswith("+ "):
                current["correct"].append(line[2:].strip())
            mode = "options"
        elif line.startswith("E: "):
            current["explanation"].append(line[3:])
            mode = "explanation"
        elif mode == "question":
            current["question"].append(line)
        elif mode == "explanation":
            current["explanation"].append(line)
        elif line.strip():
            raise CatalogError(f"{where}: unexpected line among options: {line[:60]}")
    result = []
    for n, item in enumerate(items, start=1):
        ctx = f"{where} question {n}"
        if len(item["correct"]) != 1:
            raise CatalogError(f"{ctx}: mark exactly one correct option with '+'")
        q = {
            "question": " ".join(_strip_block(item["question"]).split()),
            "options": item["options"],
            "correct_option": item["correct"][0],
            "explanation": _strip_block(item["explanation"]),
        }
        if len(q["options"]) != 4 or len({normalize(o) for o in q["options"]}) != 4:
            raise CatalogError(f"{ctx}: needs four distinct options")
        if not q["question"] or len(q["question"]) > 1000:
            raise CatalogError(f"{ctx}: question must have 1-1000 characters")
        if any(not o or len(o) > 500 for o in q["options"]):
            raise CatalogError(f"{ctx}: options must have 1-500 characters")
        if not q["explanation"] or len(q["explanation"]) > 2000:
            raise CatalogError(f"{ctx}: explanation must have 1-2000 characters")
        if _LETTER_REF_RE.search(q["explanation"]):
            raise CatalogError(f"{ctx}: explanation refers to options by letter")
        result.append(q)
    return result


def _parse_cards(lines: list[str], where: str) -> list[dict]:
    cards: list[dict] = []
    current: dict | None = None
    mode = None
    in_code = False
    for raw in lines:
        line = raw.rstrip()
        if in_code:
            if line.startswith("```"):
                in_code = False
            else:
                current["code"].append(raw.rstrip())
            continue
        if line.startswith("F: "):
            current = {"front": [line[3:]], "back": [], "code": None}
            cards.append(current)
            mode = "front"
        elif line.startswith("V: ") and current is not None:
            current["back"].append(line[3:])
            mode = "back"
        elif line.startswith("```") and current is not None:
            if current["code"] is not None:
                raise CatalogError(f"{where}: one code block per card")
            current["code"] = []
            in_code = True
        elif current is not None and mode:
            current[mode].append(line)
        elif line.strip():
            raise CatalogError(f"{where}: text before the first card")
    result = []
    for n, c in enumerate(cards, start=1):
        card = {
            "front": _strip_block(c["front"]),
            "back": _strip_block(c["back"]),
            "code_example": _strip_block(c["code"]) if c["code"] is not None else None,
        }
        ctx = f"{where} card {n}"
        if not card["front"] or len(card["front"]) > 500 or not card["back"] or len(card["back"]) > 2000:
            raise CatalogError(f"{ctx}: front 1-500 and back 1-2000 characters")
        if len(card["code_example"] or "") > 3000:
            raise CatalogError(f"{ctx}: code longer than 3000 characters")
        result.append(card)
    return result


def parse_lesson(path: Path, normalize=None) -> Lesson:
    normalize = normalize or default_normalize
    lines = path.read_text(encoding="utf-8").replace("\r\n", "\n").split("\n")
    if not lines[0].startswith("# "):
        raise CatalogError(f"{path.name}: first line must be '# NN. Title'")
    title = lines[0][2:].strip()
    if not _TITLE_RE.match(title):
        raise CatalogError(f"{path.name}: title must start with two digits, e.g. '01. '")
    lesson = Lesson(order=int(title[:2]), title=title, path=path)
    blocks: list[tuple[str, list[str]]] = []
    in_code = False
    for line in lines[1:]:
        if line.startswith("```"):
            in_code = not in_code
        if not in_code and line.startswith("## "):
            blocks.append((line[3:].strip(), []))
        elif blocks:
            blocks[-1][1].append(line)
        elif line.strip():
            raise CatalogError(f"{path.name}: text before the first section")
    for heading, body in blocks:
        where = f"{path.name} [{heading}]"
        if heading == "Questões":
            lesson.quiz = _parse_quiz(body, where, normalize)
        elif heading == "Flashcards":
            lesson.flashcards = _parse_cards(body, where)
        else:
            text_body, code = _split_code(body, where)
            if not text_body:
                raise CatalogError(f"{where}: empty section")
            if _MARKDOWN_RE.search(text_body):
                raise CatalogError(f"{where}: body is plain text; remove Markdown (** ` #)")
            if len(text_body) > MAX_SECTION_CHARS:
                raise CatalogError(f"{where}: section too long ({len(text_body)} chars); split it")
            lesson.sections.append({"title": heading, "body": text_body, "code_example": code})
    if len(lesson.sections) < MIN_SECTIONS:
        raise CatalogError(f"{path.name}: needs at least {MIN_SECTIONS} sections")
    if len(lesson.quiz) != QUIZ_PER_LESSON:
        raise CatalogError(f"{path.name}: needs {QUIZ_PER_LESSON} questions, found {len(lesson.quiz)}")
    if len(lesson.flashcards) != CARDS_PER_LESSON:
        raise CatalogError(f"{path.name}: needs {CARDS_PER_LESSON} cards, found {len(lesson.flashcards)}")
    keys = [normalize(q["question"]) for q in lesson.quiz]
    if len(set(keys)) != len(keys):
        raise CatalogError(f"{path.name}: repeated question text")
    return lesson


def default_normalize(value: object) -> str:
    # Copy of services.ai_flashcard_service.normalize_front, so the catalog can be
    # validated without the API package; the apply script passes the original.
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(character for character in text if not unicodedata.combining(character))
    return " ".join(re.sub(r"[\W_]+", " ", text).split())


def load_catalog(content_dir: Path = CONTENT_DIR, normalize=None) -> list[Lesson]:
    lessons = [parse_lesson(p, normalize) for p in sorted(content_dir.glob("[0-9][0-9]-*.md"))]
    orders = [lesson.order for lesson in lessons]
    if orders != list(range(1, len(lessons) + 1)):
        raise CatalogError(f"Lessons must be numbered 01..N without gaps: {orders}")
    for lesson in lessons:
        if not lesson.path.name.startswith(f"{lesson.order:02d}-"):
            raise CatalogError(f"{lesson.path.name}: file prefix differs from the title number")
    return lessons


def catalog_hash(lessons: list[Lesson]) -> str:
    payload = json.dumps([lesson.ai_content() for lesson in lessons], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


if __name__ == "__main__":
    import sys

    catalog = load_catalog(Path(sys.argv[1]) if len(sys.argv) > 1 else CONTENT_DIR)
    for lesson in catalog:
        chars = sum(len(s["body"]) for s in lesson.sections)
        codes = sum(1 for s in lesson.sections if s["code_example"])
        print(f"{lesson.title} | sections={len(lesson.sections)} code={codes} chars={chars}")
    print(f"OK: {len(catalog)} lessons, sha256={catalog_hash(catalog)[:12]}")
