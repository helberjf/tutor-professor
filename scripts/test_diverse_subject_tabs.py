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
    require("Abrir matéria" in source, "subject picker label is rendered")
    require("Todas as matérias" in source, "subject picker keeps an overview option")
    require("onChange={(event) =>" in source, "subject picker reacts to selection changes")
    require("function DiverseSubjectDashboard" in source, "each diverse subject has its own dashboard view")
    require("Abrir dashboard" in source, "overview links each subject to its dashboard")
    require("title=\"Apagar matéria\"" in source, "overview cards expose subject deletion")
    require("Voltar para matérias" in source, "subject dashboard can return to the overview")
    require("await api.saveDiverseDay(selectedDate, { custom_subjects: nextSubjects })" in source, "creating a subject persists it immediately")
    require("Matéria criada e salva." in source, "creating a subject confirms the save result")
    require("Sugerir materia com IA" not in source, "AI subject suggestion button was removed from the overview")
    require("Sugerir topico com IA" in source, "subject dashboard can ask AI to choose a topic")
    require("Criar preview da lição" in source, "subject dashboard can create AI lesson blocks")
    require("function generateDiverseLesson" in source, "AI lessons are created inside selected subjects")
    require("lessons.map" in source, "created diverse lessons render as separate blocks")
    require("suggest_subject" in source, "AI subject suggestion is sent to the backend")
    require("avoid_topics" in source, "AI lesson generation sends existing topics to avoid repeats")
    require("function filterFreshDiverseTopics" in source, "repeated AI lesson topics are filtered before saving")
    require("function resolveDiverseLessonTopics" in source, "lesson reading resolves canonical subject questions")
    require("lesson.topic_ids" in source, "diverse lessons reference canonical question IDs")
    require("lesson.topics" not in source, "lesson blocks do not keep mutable question copies")
    require("function updateDiverseQuestionById" in source, "lesson edits update canonical subject questions")
    require("function createLocalQuestionId" in source, "new local questions receive stable IDs")
    require("topic_ids: nextTopics.map((topic) => topic.id)" in source, "saving an AI lesson stores only canonical question IDs")
    require("id: subject.id" in source, "subject state updates preserve the canonical subject ID")
    require("<SyntaxCodeBlock" in source, "technical examples use the shared syntax renderer")
    require("topic.code_example &&" in source, "empty technical examples do not render a code area")
    require("syntaxLanguage={subject.name}" in source, "lesson code uses the parent subject language")
    require("type PendingLessonDraft = { subjectId: string" in source, "lesson previews track their subject by canonical ID")
    require("pendingLessonDraft?.subjectId === selectedSubject.subject.id" in source, "preview matching never depends on a mutable subject index")
    require("async function generateDiverseLesson(subjectId: string" in source, "async lesson previews start from canonical subject identity")
    require("async function generateDiverseTopic(subjectId: string" in source, "async topic suggestions start from canonical subject identity")
    require("appendTopicToSubjectById" in source, "topic suggestions append only to the captured canonical subject")
    require("si === subjectIndex ? { ...s, topics: [...s.topics, newTopic] }" not in source, "topic suggestions never write through a stale array index")
    require("resolvedTopics[ti]?.id" in source, "lesson actions translate visible rows to canonical question IDs")
    require("lesson?.topic_ids[topicIndex]" not in source, "lesson actions never index the raw reference list")
    require("const topicOpen = expandedAnswer === ti" in source, "topic list rows are collapsed until opened")
    require("setExpandedAnswer(topicOpen ? null : ti)" in source, "topics can be expanded and minimized")

    print("Diverse subject tab checks passed.")


if __name__ == "__main__":
    main()
