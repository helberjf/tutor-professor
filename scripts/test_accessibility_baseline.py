"""Guard the keyboard and motion accessibility baseline of the web app."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LAYOUT = ROOT / "apps" / "web" / "src" / "app" / "layout.tsx"
GLOBALS_CSS = ROOT / "apps" / "web" / "src" / "app" / "globals.css"
SKIP_LINK = ROOT / "apps" / "web" / "src" / "components" / "skip-link.tsx"


def main() -> None:
    layout = LAYOUT.read_text(encoding="utf-8")
    css = GLOBALS_CSS.read_text(encoding="utf-8")
    # O skip link mora num componente de cliente proprio: ele tem de falar o
    # idioma do leitor, e o layout a volta dele e um componente de servidor.
    skip_link = SKIP_LINK.read_text(encoding="utf-8")

    checks = {
        "skip link": re.search(r'href="#main-content"', skip_link),
        "skip link mounted": re.search(r"<SkipLink />", layout),
        "main content target": re.search(r'id="main-content"', layout),
        "visible keyboard focus": re.search(r":focus-visible\s*\{", css),
        "reduced motion": re.search(r"@media\s*\(prefers-reduced-motion:\s*reduce\)", css),
    }
    missing = [name for name, match in checks.items() if not match]
    if missing:
        raise AssertionError("Accessibility baseline is missing: " + ", ".join(missing))

    print("Accessibility baseline checks passed.")


if __name__ == "__main__":
    main()
