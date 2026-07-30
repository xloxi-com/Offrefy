"""Generate pastel decorated Easter egg PNGs (transparent background)."""
from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "easter")
EXT = os.path.join(ROOT, "extensions", "volume-discount-theme", "assets")


def egg_shape_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    # Classic egg: wider bottom, narrower top
    cx, cy = size / 2, size / 2 + size * 0.02
    for y in range(size):
        t = (y - (cy - size * 0.42)) / (size * 0.84)
        if t < 0 or t > 1:
            continue
        # radius varies along height
        w = 0.28 + 0.22 * math.sin(math.pi * min(1, max(0, t)))
        # slightly fatter lower half
        if t > 0.45:
            w += 0.06 * ((t - 0.45) / 0.55)
        rx = size * w
        d.ellipse([cx - rx, y - 1.2, cx + rx, y + 1.2], fill=255)
    # smooth fill via oversized ellipse approximation
    mask2 = Image.new("L", (size, size), 0)
    d2 = ImageDraw.Draw(mask2)
    d2.ellipse(
        [size * 0.22, size * 0.08, size * 0.78, size * 0.92],
        fill=255,
    )
    # blend toward egg silhouette
    return Image.composite(mask2, mask, mask)


def draw_egg(
    size: int,
    base: tuple[int, int, int],
    stripes: list[tuple[int, int, int]],
    style: str = "stripes",
) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # body
    d.ellipse(
        [size * 0.22, size * 0.08, size * 0.78, size * 0.92],
        fill=(*base, 255),
    )
    # pattern clipped roughly by drawing only inside bounds
    if style == "stripes":
        band_h = size * 0.09
        y0 = size * 0.18
        for i, col in enumerate(stripes):
            y = y0 + i * band_h * 1.15
            d.rectangle([size * 0.18, y, size * 0.82, y + band_h * 0.55], fill=(*col, 230))
    elif style == "dots":
        for i, col in enumerate(stripes * 4):
            ang = i * 0.9
            r = size * (0.12 + (i % 3) * 0.08)
            x = size / 2 + math.cos(ang) * r
            y = size * 0.45 + math.sin(ang) * r * 0.85
            pr = size * 0.035
            d.ellipse([x - pr, y - pr, x + pr, y + pr], fill=(*col, 235))
    elif style == "wavy":
        for i, col in enumerate(stripes):
            y = size * (0.25 + i * 0.12)
            pts = []
            for x in range(int(size * 0.2), int(size * 0.8), 3):
                yy = y + math.sin((x / size) * math.pi * 6 + i) * size * 0.02
                pts.append((x, yy))
            if len(pts) > 1:
                d.line(pts, fill=(*col, 240), width=max(2, size // 40))

    # soft highlight
    d.ellipse(
        [size * 0.34, size * 0.16, size * 0.52, size * 0.34],
        fill=(255, 255, 255, 90),
    )
    # apply oval mask
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse(
        [size * 0.22, size * 0.08, size * 0.78, size * 0.92],
        fill=255,
    )
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(EXT, exist_ok=True)

    eggs = {
        "egg-pink.png": draw_egg(
            256,
            (255, 182, 193),
            [(255, 105, 180), (255, 255, 255), (186, 85, 211)],
            "stripes",
        ),
        "egg-blue.png": draw_egg(
            256,
            (173, 216, 230),
            [(70, 130, 180), (255, 255, 200), (60, 179, 113)],
            "stripes",
        ),
        "egg-gold.png": draw_egg(
            256,
            (255, 223, 128),
            [(218, 165, 32), (255, 255, 255), (205, 133, 63)],
            "wavy",
        ),
        "egg-lilac.png": draw_egg(
            256,
            (221, 160, 221),
            [(147, 112, 219), (255, 182, 193), (255, 255, 255)],
            "dots",
        ),
        "egg-mint.png": draw_egg(
            256,
            (152, 251, 152),
            [(46, 139, 87), (255, 255, 255), (255, 182, 193)],
            "stripes",
        ),
    }

    for name, im in eggs.items():
        path = os.path.join(OUT, name)
        im.save(path, "PNG")
        im.save(os.path.join(EXT, "vd-ea-" + name), "PNG")
        print(name, os.path.getsize(path))

    # Copy fluent assets to extension
    for name in os.listdir(OUT):
        if not name.endswith(".png"):
            continue
        src = os.path.join(OUT, name)
        dst = os.path.join(EXT, "vd-ea-" + name)
        if not os.path.exists(dst):
            Image.open(src).save(dst, "PNG")
            print("copied", name)


if __name__ == "__main__":
    main()
