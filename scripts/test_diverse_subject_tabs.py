from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STUDY_PAGE = ROOT / "apps" / "web" / "src" / "app" / "study" / "page.tsx"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    source = STUDY_PAGE.read_text(encoding="utf-8")

    require("function slugifySubjectName" in source, "diverse subjects have stable URL slugs")
    require("selectedDiverseSubjectSlug" in source, "selected diverse subject is tracked separately")
    require("function selectDiverseSubjectTab" in source, "subject tabs update the selected subject")
    require("url.searchParams.set('tab', slug)" in source, "subject tabs write tab=<subject> to the URL")
    require("function DiverseSubjectDashboard" in source, "each diverse subject has its own dashboard view")
    require("data-subject-tab" in source, "subject tabs are rendered for created subjects")
    require("Abrir dashboard" in source, "overview links each subject to its dashboard")
    require("Voltar para materias" in source, "subject dashboard can return to the overview")
    require("Sugerir materia com IA" in source, "overview can ask AI to suggest a subject")
    require("IA escolher topico" in source, "subject dashboard can ask AI to choose a topic")
    require("Criar nova licao com IA" in source, "subject dashboard can create AI lesson blocks")
    require("function generateDiverseLesson" in source, "AI lessons are created inside selected subjects")
    require("lessons.map" in source, "created diverse lessons render as separate blocks")
    require("suggest_subject" in source, "AI subject suggestion is sent to the backend")

    print("Diverse subject tab checks passed.")


if __name__ == "__main__":
    main()
