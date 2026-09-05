"""Fail when the app uses a light-theme utility class that dark mode does not remap.

Dark mode is implemented in globals.css by overriding a fixed list of Tailwind
classes. That list is easy to fall behind: using a shade nobody listed yet leaves
near-black text on the dark card, and nothing warns you — it just looks broken.
That is how `text-slate-950` shipped unreadable.

This test enumerates the classes the app actually uses and asserts each one is
covered by a `html[data-theme='dark']` rule.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "apps" / "web" / "src"
GLOBALS_CSS = SRC / "app" / "globals.css"

# Every coloured Tailwind text utility used by the app needs an explicit dark
# counterpart. Several of these are fine on a light card but become too dark
# when the card is remapped to the dark surface. 100/200 are intentionally
# excluded because they are already light enough for dark surfaces.
DARK_TEXT_SHADES = {"300", "400", "500", "600", "700", "800", "900", "950"}
TAILWIND_COLOR_FAMILIES = {
    "amber",
    "blue",
    "cyan",
    "emerald",
    "green",
    "indigo",
    "orange",
    "red",
    "rose",
    "sky",
    "slate",
    "teal",
    "violet",
}
CUSTOM_TEXT_CLASSES = {
    "text-primary",
    "text-primary-dark",
    "text-secondary-dark",
    "text-accent-dark",
    "text-kid-pink",
    "text-kid-orange",
}

# Light surfaces that need a dark counterpart.
LIGHT_SURFACE_CLASSES = {"bg-white", "bg-slate-50", "bg-slate-100"}


def used_classes() -> set[str]:
    found: set[str] = set()
    for path in SRC.rglob("*.tsx"):
        text = path.read_text(encoding="utf-8")
        for family in TAILWIND_COLOR_FAMILIES:
            for shade in re.findall(rf"(?<![\w-])text-{family}-(\d{{2,3}}(?:/\d+)?)(?![\w-])", text):
                if shade.split("/", 1)[0] in DARK_TEXT_SHADES:
                    found.add(f"text-{family}-{shade}")
        for cls in CUSTOM_TEXT_CLASSES:
            if re.search(rf"(?<![\w-]){re.escape(cls)}(?![\w-])", text):
                found.add(cls)
        for cls in re.findall(r"(?<![\w-])(bg-white|bg-slate-50|bg-slate-100)(?![\w/-])", text):
            found.add(cls)
    return found


def covered_classes() -> set[str]:
    css = GLOBALS_CSS.read_text(encoding="utf-8")
    covered: set[str] = set()
    for block in re.findall(r"html\[data-theme='dark'\][^{]*\{", css):
        for cls in re.findall(r"\.((?:text|bg)-[a-z0-9/-]+)", block):
            covered.add(cls)
        for cls in re.findall(r"\[class~='((?:text|bg)-[a-z0-9/-]+)'\]", block):
            covered.add(cls)
    return covered


def main() -> None:
    used = used_classes()
    covered = covered_classes()
    missing = sorted(used - covered)

    if missing:
        raise AssertionError(
            "These classes are used in the app but dark mode never remaps them, so "
            "they keep their light-theme colour on a dark background:\n  "
            + "\n  ".join(missing)
            + f"\n\nAdd them to a html[data-theme='dark'] rule in {GLOBALS_CSS.relative_to(ROOT)}."
        )

    print(f"Dark mode coverage OK ({len(used)} light-theme classes, all remapped).")


if __name__ == "__main__":
    main()
