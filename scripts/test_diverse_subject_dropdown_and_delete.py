from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STUDY_PAGE = ROOT / "apps" / "web" / "src" / "app" / "study" / "page.tsx"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    source = STUDY_PAGE.read_text(encoding="utf-8")

    require("Selecione a materia" in source, "diverse overview should offer a subject dropdown")
    require("removeDiverseSubjectById" in source, "diverse subjects should be removable by canonical id")
    require("Ja existe uma materia com esse nome" in source, "adding duplicate subject should show explicit feedback")
    require("Materia adicionada. Nao esqueca de salvar" in source, "adding a subject should show save hint")
    require("Apagar materia" in source, "UI should expose an explicit delete subject action")

    print("Diverse dropdown/delete checks passed.")


if __name__ == "__main__":
    main()
