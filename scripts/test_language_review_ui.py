from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API_CLIENT = ROOT / "apps" / "web" / "src" / "lib" / "api.ts"
QUICK_REVIEW = ROOT / "apps" / "web" / "src" / "app" / "quick-review" / "page.tsx"
MAIN_REVIEW = ROOT / "apps" / "web" / "src" / "app" / "review" / "page.tsx"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    api_source = API_CLIENT.read_text(encoding="utf-8")
    quick_source = QUICK_REVIEW.read_text(encoding="utf-8")
    main_source = MAIN_REVIEW.read_text(encoding="utf-8")

    require("interface ReviewSessionOptions" in api_source, "API documents review session options")
    require("vocabularyOnly?: boolean" in api_source, "API exposes the vocabulary-only option")
    require("vocabulary_only=true" in api_source, "API sends the backend vocabulary_only query")
    require(
        "api.getReviewSession(15, { vocabularyOnly: true })" in quick_source,
        "quick review explicitly requests vocabulary-only cards",
    )
    require(
        "api.getReviewSession(8)" in main_source,
        "main review keeps the default mixed session",
    )

    print("Language review UI checks passed.")


if __name__ == "__main__":
    main()
