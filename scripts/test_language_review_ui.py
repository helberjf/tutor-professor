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
        "api.getReviewSession(REVIEW_LIMIT)" in main_source,
        "main review keeps the default mixed session",
    )
    require(
        "api.getReviewSession(REVIEW_LIMIT, { vocabularyOnly: true })" not in main_source,
        "main review must not filter lesson questions out of the mixed session",
    )
    for marker in (
        "const CONFIDENCE_LEVELS",
        "const [flipped, setFlipped]",
        "const [audioSpeed, setAudioSpeed]",
        "Virar carta",
        "Traducao",
        "Como voce se saiu?",
        "0.5, 0.75, 1.0",
        "handleVocabularyConfidence",
        "aria-expanded={generationFormOpen}",
        'aria-controls="review-question-generator-panel"',
        'id="review-question-generator-panel"',
        'aria-live="polite"',
        "beginMixedReviewSubmission",
        "beginMixedReviewAdvancement",
        "revealMixedReviewLessonAnswer",
        "advanceReview(true)",
        "generationRequestRef.current === requestToken",
        "setGenerating(false)",
        "captureReviewAttempt",
        "isReviewAttemptCompletionCurrent",
        "reviewSessionEpochRef.current += 1",
    ):
        require(marker in main_source, f"main mixed review preserves expected UX marker: {marker}")
    require(
        "selectedVocabularyOption" not in main_source,
        "main review must not replace the vocabulary flashcard with multiple choice",
    )
    vocabulary_handler = main_source.split(
        "async function handleVocabularyConfidence", 1
    )[1].split("async function handleLessonQuestionAnswer", 1)[0]
    lesson_handler = main_source.split(
        "async function handleLessonQuestionAnswer", 1
    )[1].split("function handleNext", 1)[0]
    require(
        "beginMixedReviewSubmission" in vocabulary_handler,
        "vocabulary submission uses the tested transition guard",
    )
    require(
        "captureReviewAttempt" in vocabulary_handler
        and "isReviewAttemptCompletionCurrent" in vocabulary_handler,
        "vocabulary completion validates its captured session and card",
    )
    require(
        "beginMixedReviewSubmission" in lesson_handler,
        "lesson-question submission uses the tested transition guard",
    )
    require(
        "captureReviewAttempt" in lesson_handler
        and "isReviewAttemptCompletionCurrent" in lesson_handler,
        "lesson-question completion validates its captured session and card",
    )
    generation = main_source.split(
        "async function handleGenerateLessonQuestions", 1
    )[1].split("async function handleGenerationRecoveryReload", 1)[0]
    require("finally" in generation, "generation always reaches token-safe cleanup")
    require(
        "generationRequestRef.current === requestToken" in generation,
        "stale generation cannot clear a newer request state",
    )

    print("Language review UI checks passed.")


if __name__ == "__main__":
    main()
