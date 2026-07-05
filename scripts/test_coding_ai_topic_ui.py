from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CODING_PAGE = ROOT / "apps" / "web" / "src" / "components" / "coding" / "CodingCurriculum.tsx"
TOPIC_VIEW = ROOT / "apps" / "web" / "src" / "components" / "coding" / "TopicView.tsx"
API_FILE = ROOT / "apps" / "web" / "src" / "lib" / "api.ts"
SCHEMAS_FILE = ROOT / "apps" / "api" / "schemas" / "schemas.py"
API_MAIN = ROOT / "apps" / "api" / "main.py"
CODING_SERVICE = ROOT / "apps" / "api" / "services" / "coding_service.py"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    source = CODING_PAGE.read_text(encoding="utf-8")
    topic_view = TOPIC_VIEW.read_text(encoding="utf-8")
    api_source = API_FILE.read_text(encoding="utf-8")
    schemas_source = SCHEMAS_FILE.read_text(encoding="utf-8")
    main_source = API_MAIN.read_text(encoding="utf-8")
    service_source = CODING_SERVICE.read_text(encoding="utf-8")

    require("Gerar topico por IA" in source, "coding topics view exposes AI topic generation")
    require("function handleGenerateTopicAI" in source, "coding UI has an AI topic generation handler")
    require("generateCodingTopic" in source, "coding UI calls the generated-topic API")
    require("generateCodingTopic" in api_source, "API client exposes generated coding topic endpoint")
    require("/api/coding/subjects/${subjectId}/topics/generate" in api_source, "API client targets the generated-topic route")
    require("showRegenerateContext" in topic_view, "regenerate with AI opens a context editor before calling AI")
    require("regenerateContext" in topic_view, "regenerate context text is kept in component state")
    require("Como quer regenerar" in topic_view, "regenerate context editor explains what context to enter")
    require("api.generateCodingTopicContent(topic.id, { context:" in topic_view, "regenerate context is sent to the topic generation API")
    require("generateCodingTopicContent: (id: number, payload?: { context?: string })" in api_source, "API client accepts optional regeneration context")
    require("body: JSON.stringify({ context: contextText })" in api_source, "API client serializes regeneration context")
    require("class GenerateProgrammingTopicContentSchema" in schemas_source, "backend schema accepts topic generation context")
    require("context: Optional[str]" in schemas_source, "backend schema exposes optional context")
    require("payload: GenerateProgrammingTopicContentSchema" in main_source, "topic generation route receives context payload")
    require("user_context=context_text" in main_source, "topic generation route passes context to the AI service")
    require("user_context: str = \"\"" in service_source, "AI service accepts user regeneration context")
    require("Regeneration instructions from user" in service_source, "AI prompt includes user regeneration context")

    print("Coding AI topic UI checks passed.")


if __name__ == "__main__":
    main()
