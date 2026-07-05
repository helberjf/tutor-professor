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
    require("const diverseSubjectTabs" in source, "created diverse subjects are added to the top study tab switcher")
    require("diverseSubjectTabs.map" in source, "top study tabs render every created subject")
    require("selectedDiverseSubjectSlug === item.slug" in source, "created subject top tabs use the selected subject slug")
    require("function DiverseSubjectDashboard" in source, "each diverse subject has its own dashboard view")
    require("data-subject-tab" in source, "subject tabs are rendered for created subjects")
    require("Abrir dashboard" in source, "overview links each subject to its dashboard")
    require("Voltar para matérias" in source, "subject dashboard can return to the overview")
    require("Sugerir materia com IA" not in source, "AI subject suggestion button was removed from the overview")
    require("Sugerir topico com IA" in source, "subject dashboard can ask AI to choose a topic")
    require("Criar preview da lição" in source, "subject dashboard can create AI lesson blocks")
    require("function generateDiverseLesson" in source, "AI lessons are created inside selected subjects")
    require("lessons.map" in source, "created diverse lessons render as separate blocks")
    require("suggest_subject" in source, "AI subject suggestion is sent to the backend")
    require("avoid_topics" in source, "AI lesson generation sends existing topics to avoid repeats")
    require("function filterFreshDiverseTopics" in source, "repeated AI lesson topics are filtered before saving")
    require("const nextTopics = filterFreshDiverseTopics(lesson.topics, getDiverseAvoidTopics(subject))" in source, "saving an AI lesson block also prepares fresh topics for the subject")
    require("topics: [...s.topics, ...nextTopics]" in source, "AI lesson blocks add their generated topics to the subject study list")
    require("const topicOpen = expandedAnswer === ti" in source, "topic list rows are collapsed until opened")
    require("setExpandedAnswer(topicOpen ? null : ti)" in source, "topics can be expanded and minimized")

    print("Diverse subject tab checks passed.")


if __name__ == "__main__":
    main()
