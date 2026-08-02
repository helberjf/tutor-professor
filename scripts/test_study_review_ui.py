from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STUDY_PAGE = ROOT / "apps" / "web" / "src" / "app" / "study" / "page.tsx"

def read_study_source() -> str:
    """The study page plus the modules it was split into.

    Lives across page.tsx, _components/*.tsx and _lib/*.ts, so these checks read
    the whole feature instead of a single file and survive further extraction.
    """
    study_dir = ROOT / "apps" / "web" / "src" / "app" / "study"
    parts = [study_dir / "page.tsx"]
    parts += sorted(study_dir.glob("_components/*.tsx"))
    parts += sorted(study_dir.glob("_lib/*.ts"))
    return "\n".join(path.read_text(encoding="utf-8") for path in parts)

LAYOUT_PAGE = ROOT / "apps" / "web" / "src" / "app" / "layout.tsx"
GLOBAL_CSS = ROOT / "apps" / "web" / "src" / "app" / "globals.css"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    source = read_study_source()
    layout = LAYOUT_PAGE.read_text(encoding="utf-8")
    css = GLOBAL_CSS.read_text(encoding="utf-8")

    require("function handleStudyKeyDown" in source, "study review handles numeric keyboard shortcuts")
    require("event.key === '1'" in source, "key 1 is mapped in the study review")
    require("event.key === '2'" in source, "key 2 is mapped in the study review")
    require("event.key === '3'" in source, "key 3 is mapped in the study review")
    require("aria-keyshortcuts=\"1\"" in source, "partial button exposes key 1")
    require("aria-keyshortcuts=\"2\"" in source, "sabia button exposes key 2")
    require("aria-keyshortcuts=\"3\"" in source, "nao sabia button exposes key 3")
    require("grid-cols-1 gap-2 sm:grid-cols-3" in source, "rating controls are mobile-first")
    require("order-2 sm:order-2" in source, "sabia button is centered in the rating controls")
    require("const studyCardRef = useRef<HTMLDivElement>(null)" in source, "study card can own keyboard focus")
    require("studyCardRef.current?.focus()" in source, "revealing an explanation focuses the active study card")
    require("!studyCardRef.current?.contains(document.activeElement)" in source, "keyboard shortcut ignores inactive cards")
    require("tabIndex={-1}" in source, "study card can receive programmatic focus")
    require("type { Metadata, Viewport }" in layout, "layout defines explicit mobile viewport metadata")
    require("export const viewport: Viewport" in layout, "viewport export is present")
    require("width: 'device-width'" in layout, "viewport uses device width")
    require("initialScale: 1" in layout, "viewport starts at mobile scale")
    require("next/font/google" not in layout, "layout does not require network fonts during build")
    require("min-width: 320px" in css, "global styles keep a mobile baseline width")
    require("overflow-x: hidden" in css, "global styles prevent horizontal overflow on mobile")
    require("font-family: 'Trebuchet MS', cursive, sans-serif" in css, "global styles use local mobile-safe font fallback")

    print("Study review UI checks passed.")


if __name__ == "__main__":
    main()
