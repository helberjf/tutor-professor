from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TOPIC_VIEW = ROOT / "apps" / "web" / "src" / "components" / "coding" / "TopicView.tsx"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    source = TOPIC_VIEW.read_text(encoding="utf-8")

    require("function parseFlashcardImport" in source, "flashcards can be parsed from pasted content")
    require("JSON.parse(text)" in source, "flashcard import accepts pasted JSON")
    require("parseTextFlashcards" in source, "flashcard import accepts a plain text format")
    require("navigator.clipboard.writeText" in source, "flashcards can be copied as JSON")
    require("handleImportFlashcards" in source, "imported flashcards are saved through the API")
    require("Copiar JSON" in source, "copy JSON control is visible")
    require("Importar" in source, "import control is visible")
    require("Frente | Verso" in source, "plain text import format is shown to the user")

    print("Flashcard import/export checks passed.")


if __name__ == "__main__":
    main()
