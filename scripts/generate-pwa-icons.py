"""Generate the PWA icon set from the app's own brand mark.

The navbar badge is a graduation cap on a sky -> indigo -> emerald gradient
(see apps/web/src/components/navbar.tsx), so the installed icon is drawn the
same way instead of shipping an unrelated picture.

Run from the repository root after changing the palette or the glyph:

    python scripts/generate-pwa-icons.py

Everything is drawn at 4x and downscaled, which is what keeps the diagonal
edges of the cap from looking ragged at 192px.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = REPO_ROOT / "apps" / "web"
PUBLIC_ICONS = WEB_DIR / "public" / "icons"
APP_DIR = WEB_DIR / "src" / "app"

SUPERSAMPLE = 4

# tailwind sky-400 -> indigo-500 -> emerald-400, the navbar badge gradient.
GRADIENT_STOPS = ((56, 189, 248), (99, 102, 241), (52, 211, 153))
# The maskable icon is cropped to a circle by the launcher, so its glyph has to
# stay inside the inner 80% "safe zone" the spec defines.
MASKABLE_SAFE_SCALE = 0.72


def _lerp(start: int, end: int, t: float) -> int:
    return round(start + (end - start) * t)


def _gradient(size: int) -> Image.Image:
    """Diagonal three-stop gradient, painted per row of a 45-degree sweep."""

    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            # 0 at the top-left corner, 1 at the bottom-right one.
            t = (x + y) / (2 * (size - 1))
            if t <= 0.5:
                local = t / 0.5
                start, end = GRADIENT_STOPS[0], GRADIENT_STOPS[1]
            else:
                local = (t - 0.5) / 0.5
                start, end = GRADIENT_STOPS[1], GRADIENT_STOPS[2]
            pixels[x, y] = tuple(_lerp(start[i], end[i], local) for i in range(3))
    return image


def _cap_layer(size: int, glyph_scale: float) -> Image.Image:
    """The white graduation cap, centred, as an alpha mask layer."""

    layer = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(layer)

    def point(x: float, y: float) -> tuple[float, float]:
        # Map the 0..1 design space through the glyph scale, keeping it centred.
        return (
            size / 2 + (x - 0.5) * size * glyph_scale,
            size / 2 + (y - 0.5) * size * glyph_scale,
        )

    white = (255, 255, 255, 255)

    # Cap body first, so the board sits on top of it.
    draw.polygon(
        [point(0.30, 0.52), point(0.70, 0.52), point(0.66, 0.74), point(0.34, 0.74)],
        fill=white,
    )
    # Mortarboard.
    draw.polygon(
        [point(0.50, 0.24), point(0.90, 0.44), point(0.50, 0.64), point(0.10, 0.44)],
        fill=white,
    )
    # Tassel: a cord down the right edge with a bead at the end.
    cord_width = max(1, round(size * glyph_scale * 0.028))
    draw.line([point(0.855, 0.455), point(0.855, 0.68)], fill=white, width=cord_width)
    bead_radius = size * glyph_scale * 0.045
    bead_x, bead_y = point(0.855, 0.70)
    draw.ellipse(
        [bead_x - bead_radius, bead_y - bead_radius, bead_x + bead_radius, bead_y + bead_radius],
        fill=white,
    )
    return layer


def _rounded_mask(size: int, radius_ratio: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=size * radius_ratio, fill=255)
    return mask


def build_icon(size: int, *, radius_ratio: float, glyph_scale: float) -> Image.Image:
    work = size * SUPERSAMPLE
    icon = _gradient(work).convert("RGBA")
    icon.alpha_composite(_cap_layer(work, glyph_scale))
    if radius_ratio > 0:
        icon.putalpha(_rounded_mask(work, radius_ratio))
    return icon.resize((size, size), Image.LANCZOS)


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(REPO_ROOT)} ({image.width}x{image.height})")


def main() -> None:
    # Manifest icons: rounded, glyph at full size.
    for size in (192, 512):
        save(
            build_icon(size, radius_ratio=0.22, glyph_scale=0.78),
            PUBLIC_ICONS / f"icon-{size}.png",
        )

    # Maskable: square edge to the bleed, glyph pulled into the safe zone so a
    # circular crop never clips the cap.
    save(
        build_icon(512, radius_ratio=0.0, glyph_scale=0.78 * MASKABLE_SAFE_SCALE),
        PUBLIC_ICONS / "icon-maskable-512.png",
    )

    # iOS applies its own rounding and does not honour transparency, so the
    # apple icon is a full square. Next serves src/app/apple-icon.png as the
    # apple-touch-icon link automatically.
    apple = build_icon(180, radius_ratio=0.0, glyph_scale=0.78)
    save(apple.convert("RGB").convert("RGBA"), APP_DIR / "apple-icon.png")

    # Browser tab icon, also picked up automatically by Next.
    save(build_icon(64, radius_ratio=0.22, glyph_scale=0.82), APP_DIR / "icon.png")


if __name__ == "__main__":
    main()
