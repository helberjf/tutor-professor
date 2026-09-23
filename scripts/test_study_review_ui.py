from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LAYOUT_PAGE = ROOT / "apps" / "web" / "src" / "app" / "layout.tsx"
GLOBAL_CSS = ROOT / "apps" / "web" / "src" / "app" / "globals.css"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    layout = LAYOUT_PAGE.read_text(encoding="utf-8")
    css = GLOBAL_CSS.read_text(encoding="utf-8")

    # The keyboard-rated review lived in the old "Outras matérias" tab; those
    # subjects now review in the flashcard deck, like programming.
    require("type { Metadata, Viewport }" in layout, "layout defines explicit mobile viewport metadata")
    require("export const viewport: Viewport" in layout, "viewport export is present")
    require("width: 'device-width'" in layout, "viewport uses device width")
    require("initialScale: 1" in layout, "viewport starts at mobile scale")
    require("next/font/google" not in layout, "layout does not require network fonts during build")
    require("min-width: 320px" in css, "global styles keep a mobile baseline width")
    require("overflow-x: hidden" in css, "global styles prevent horizontal overflow on mobile")
    require("font-family: Inter, Roboto, Arial, sans-serif" in css, "global styles use safe sans-serif font fallback")
    require("cursive" not in css, "global styles never fall back to cursive fonts")

    print("Study review UI checks passed.")


if __name__ == "__main__":
    main()
