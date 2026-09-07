from pathlib import Path
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
STUDY_PAGE = ROOT / "apps" / "web" / "src" / "app" / "study" / "page.tsx"
DIVERSE_TAB = ROOT / "apps" / "web" / "src" / "app" / "study" / "_components" / "DiverseTab.tsx"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def without_accents(value: str) -> str:
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", value)
        if not unicodedata.combining(character)
    )


def main() -> None:
    page_source = without_accents(STUDY_PAGE.read_text(encoding="utf-8"))
    tab_source = without_accents(DIVERSE_TAB.read_text(encoding="utf-8"))

    # The dropdown must stay reachable by name. It used to carry an invisible
    # aria-label; it now has a real <label htmlFor> tied to the select's id,
    # which names it with visible text instead. Assert the association rather
    # than either wording, so improving the label does not fail the test.
    require("Abrir materia" in tab_source, "diverse overview should offer a subject dropdown")
    require(
        'htmlFor="diverse-subject-picker"' in tab_source
        and 'id="diverse-subject-picker"' in tab_source,
        "the subject dropdown must be labelled by an associated <label>",
    )
    require("removeDiverseSubjectById" in page_source, "diverse subjects should be removable by canonical id")
    require("Essa materia ja existe para esta data" in page_source, "adding duplicate subject should show explicit feedback")
    require("Materia criada com 3 topicos iniciais da IA" in page_source, "adding a subject should confirm its automatic save")
    require("Apagar materia" in tab_source, "UI should expose an explicit delete subject action")

    print("Diverse dropdown/delete checks passed.")


if __name__ == "__main__":
    main()
