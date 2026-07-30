"""Generate transparent-background fireworks PNGs (Google PNG-style bursts)."""
from __future__ import annotations

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "newyear")
EXT = os.path.join(ROOT, "extensions", "volume-discount-theme", "assets")


def _glow_dot(img: Image.Image, x: float, y: float, r: float, rgba: tuple[int, int, int, int]):
    """Soft glowing circle with alpha falloff."""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    steps = max(4, int(r))
    for i in range(steps, 0, -1):
        t = i / steps
        a = int(rgba[3] * (t**1.6) * 0.55)
        rr = r * (1.0 + (1 - t) * 1.8)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(*rgba[:3], a))
    d.ellipse([x - r * 0.45, y - r * 0.45, x + r * 0.45, y + r * 0.45], fill=rgba)
    img.alpha_composite(layer)


def burst(
    size: int,
    colors: list[tuple[int, int, int, int]],
    rays: int = 48,
    trail: bool = True,
    seed: int = 1,
    density: float = 1.0,
) -> Image.Image:
    random.seed(seed)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    max_len = size * 0.44

    # soft bloom behind burst
    bloom = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bloom)
    for r in range(int(size * 0.22), 0, -3):
        a = int(28 * (r / (size * 0.22)))
        c = colors[0]
        bd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*c[:3], a))
    bloom = bloom.filter(ImageFilter.GaussianBlur(radius=size * 0.04))
    img.alpha_composite(bloom)

    n_rays = int(rays * density)
    for i in range(n_rays):
        ang = (2 * math.pi * i / n_rays) + random.uniform(-0.04, 0.04)
        color = colors[i % len(colors)]
        length = max_len * random.uniform(0.5, 1.0)
        segs = 16
        for s in range(segs):
            t0 = s / segs
            t1 = (s + 1) / segs
            x0 = cx + math.cos(ang) * length * t0
            y0 = cy + math.sin(ang) * length * t0
            x1 = cx + math.cos(ang) * length * t1
            y1 = cy + math.sin(ang) * length * t1
            fade = (1.0 - t1) ** 0.7
            a = int(color[3] * fade)
            w = max(1, int((4.5 - t1 * 3.2) * (size / 160)))
            d.line([(x0, y0), (x1, y1)], fill=(*color[:3], a), width=w)

        # outer spark clusters
        tip_n = random.randint(2, 5)
        for _ in range(tip_n):
            jitter = random.uniform(0.82, 1.05)
            jang = ang + random.uniform(-0.12, 0.12)
            tx = cx + math.cos(jang) * length * jitter
            ty = cy + math.sin(jang) * length * jitter
            pr = random.uniform(size * 0.012, size * 0.028)
            spark = (
                min(255, color[0] + 40),
                min(255, color[1] + 40),
                min(255, color[2] + 20),
                int(color[3] * random.uniform(0.7, 1.0)),
            )
            _glow_dot(img, tx, ty, pr, spark)

    # mid-ring sparks
    for _ in range(int(70 * density)):
        ang = random.uniform(0, 2 * math.pi)
        dist = max_len * random.uniform(0.2, 0.95)
        x = cx + math.cos(ang) * dist
        y = cy + math.sin(ang) * dist
        color = random.choice(colors)
        pr = random.uniform(size * 0.006, size * 0.018)
        _glow_dot(img, x, y, pr, (*color[:3], int(color[3] * random.uniform(0.45, 0.9))))

    # bright core
    _glow_dot(img, cx, cy, size * 0.04, (255, 255, 245, 240))
    _glow_dot(img, cx, cy, size * 0.018, (255, 255, 255, 255))

    if trail:
        for s in range(18):
            t = s / 18
            y = cy + max_len * 0.12 + t * size * 0.3
            x = cx + math.sin(t * 4) * (size * 0.01)
            a = int(170 * (1 - t))
            w = max(1.2, 2.8 * (1 - t))
            _glow_dot(img, x, y, w, (255, 230, 140, a))

    return img


def willow(size: int, colors: list[tuple[int, int, int, int]], seed: int = 2) -> Image.Image:
    random.seed(seed)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cx = size / 2
    cy = size * 0.28
    bloom = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bloom)
    for r in range(int(size * 0.18), 0, -3):
        a = int(22 * (r / (size * 0.18)))
        bd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*colors[0][:3], a))
    img.alpha_composite(bloom.filter(ImageFilter.GaussianBlur(radius=size * 0.035)))

    d = ImageDraw.Draw(img)
    for i in range(42):
        ang = -math.pi * 0.2 + (math.pi * 1.4) * (i / 41)
        color = colors[i % len(colors)]
        length = size * random.uniform(0.38, 0.58)
        segs = 18
        for s in range(segs):
            t0 = s / segs
            t1 = (s + 1) / segs
            droop0 = (t0**2.1) * size * 0.32
            droop1 = (t1**2.1) * size * 0.32
            x0 = cx + math.cos(ang) * length * t0
            y0 = cy + math.sin(ang) * length * t0 * 0.25 + droop0
            x1 = cx + math.cos(ang) * length * t1
            y1 = cy + math.sin(ang) * length * t1 * 0.25 + droop1
            a = int(color[3] * (1 - t1 * 0.65))
            w = max(1, int(3.0 * (1 - t1 * 0.55)))
            d.line([(x0, y0), (x1, y1)], fill=(*color[:3], a), width=w)
        tx = cx + math.cos(ang) * length
        ty = cy + math.sin(ang) * length * 0.25 + size * 0.32
        _glow_dot(img, tx, ty, size * 0.014, (*color[:3], 210))
    _glow_dot(img, cx, cy, size * 0.03, (255, 250, 220, 230))
    return img


def multi_cluster(size: int, seed: int = 3) -> Image.Image:
    random.seed(seed)
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    palettes = [
        [
            (255, 70, 70, 230),
            (255, 190, 50, 230),
            (255, 100, 200, 210),
            (90, 200, 255, 210),
            (140, 255, 120, 210),
        ],
        [(255, 220, 80, 235), (255, 170, 40, 220), (255, 255, 210, 210)],
        [
            (190, 110, 255, 230),
            (255, 80, 180, 220),
            (100, 170, 255, 210),
            (255, 230, 90, 210),
        ],
    ]
    positions = [(0.30, 0.30, 0.58), (0.70, 0.26, 0.50), (0.50, 0.60, 0.64)]
    for (px, py, sc), pal in zip(positions, palettes):
        sub = burst(int(size * sc), pal, rays=40, trail=False, seed=seed + int(px * 100))
        x = int(px * size - sub.width / 2)
        y = int(py * size - sub.height / 2)
        base.alpha_composite(sub, (max(0, x), max(0, y)))
    return base


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(EXT, exist_ok=True)

    gold = [
        (255, 220, 90, 235),
        (255, 185, 45, 225),
        (255, 250, 200, 210),
        (255, 255, 255, 190),
    ]
    rainbow = [
        (255, 60, 70, 230),
        (255, 150, 40, 230),
        (255, 230, 55, 230),
        (70, 220, 110, 220),
        (70, 150, 255, 230),
        (190, 90, 255, 230),
        (255, 90, 190, 220),
    ]
    violet = [
        (200, 110, 255, 235),
        (255, 80, 180, 225),
        (110, 150, 255, 220),
        (255, 220, 100, 210),
    ]
    crimson = [
        (255, 50, 85, 235),
        (255, 130, 50, 225),
        (255, 220, 90, 210),
        (255, 255, 230, 190),
    ]

    files = {
        "fireworks-burst.png": burst(320, rainbow, rays=56, trail=True, seed=11),
        "fireworks-gold.png": burst(320, gold, rays=52, trail=True, seed=22),
        "fireworks-violet.png": burst(320, violet, rays=50, trail=True, seed=33),
        "fireworks-crimson.png": burst(320, crimson, rays=52, trail=True, seed=44),
        "fireworks-willow.png": willow(320, gold, seed=55),
        "fireworks-cluster.png": multi_cluster(320, seed=66),
    }

    for name, im in files.items():
        path = os.path.join(OUT, name)
        im.save(path, "PNG")
        im.save(os.path.join(EXT, "vd-ny-" + name), "PNG")
        print(name, im.size, os.path.getsize(path))

    files["fireworks-burst.png"].save(os.path.join(OUT, "fireworks.png"), "PNG")
    files["fireworks-burst.png"].save(os.path.join(EXT, "vd-ny-fireworks.png"), "PNG")
    print("replaced fireworks.png with transparent rainbow burst")


if __name__ == "__main__":
    main()
