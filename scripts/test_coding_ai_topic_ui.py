from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CODING_PAGE = ROOT / "apps" / "web" / "src" / "components" / "coding" / "CodingCurriculum.tsx"
API_FILE = ROOT / "apps" / "web" / "src" / "lib" / "api.ts"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    source = CODING_PAGE.read_text(encoding="utf-8")
    api_source = API_FILE.read_text(encoding="utf-8")

    require("Gerar topico por IA" in source, "coding topics view exposes AI topic generation")
    require("function handleGenerateTopicAI" in source, "coding UI has an AI topic generation handler")
    require("generateCodingTopic" in source, "coding UI calls the generated-topic API")
    require("generateCodingTopic" in api_source, "API client exposes generated coding topic endpoint")
    require("/api/coding/subjects/${subjectId}/topics/generate" in api_source, "API client targets the generated-topic route")

    print("Coding AI topic UI checks passed.")


if __name__ == "__main__":
    main()
