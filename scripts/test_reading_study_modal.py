from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TOPIC_VIEW = ROOT / "apps" / "web" / "src" / "components" / "coding" / "TopicView.tsx"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    source = TOPIC_VIEW.read_text(encoding="utf-8")

    require("showReadingStudy" in source, "topic view keeps reading study modal state")
    require("ReadingStudyModal" in source, "topic view has a dedicated reading study modal")
    require("Iniciar estudo" in source, "topic header exposes the Iniciar estudo button")
    require("role=\"dialog\"" in source, "reading study opens as an accessible dialog")
    require("aria-modal=\"true\"" in source, "reading study dialog is modal")
    require("readingStudySteps" in source, "reading study combines reading sections and quiz questions into steps")
    require("setReadingStepIndex" in source, "reading study supports step navigation")
    require("aria-label=\"Proxima etapa do estudo\"" in source, "reading study has an accessible next button")
    require("aria-label=\"Etapa anterior do estudo\"" in source, "reading study has an accessible previous button")
    require("min-h-[100dvh]" in source, "reading study modal is mobile-first full height")

    print("Reading study modal checks passed.")


if __name__ == "__main__":
    main()

