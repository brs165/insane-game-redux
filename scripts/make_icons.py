"""Renders the PWA icons into public/icons/ (the same art as the iOS app icon).

Usage:  pip install pillow numpy   then   npm run icons
The generated PNGs are committed, so you only need this if you change the art.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
S = 4            # supersampling factor
N = 1024 * S
COL = {1: "#FFB547", 2: "#FF5D73", 3: "#3DDC97", 4: "#9B7BFF", 5: "#43B8F5"}


def hx(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vgrad(w, h, c1, c2, c3):
    g = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / max(1, h - 1)
        c = mix(c1, c2, t / 0.5) if t < 0.5 else mix(c2, c3, (t - 0.5) / 0.5)
        d.line([(0, y), (w, y)], fill=c)
    return g


def glyph(dr, k, cx, cy, h, fill):
    if k == 1:
        dr.polygon([(cx, cy - h * 1.05), (cx + h * 1.12, cy + h * 0.9), (cx - h * 1.12, cy + h * 0.9)], fill=fill)
    elif k == 2:
        a, b = h * 0.38, h * 1.05
        dr.rectangle([cx - a, cy - b, cx + a, cy + b], fill=fill)
        dr.rectangle([cx - b, cy - a, cx + b, cy + a], fill=fill)
    elif k == 3:
        s = h * 0.86
        dr.rounded_rectangle([cx - s, cy - s, cx + s, cy + s], radius=h * 0.12, fill=fill)
    elif k == 4:
        dr.ellipse([cx - h * 0.98, cy - h * 0.98, cx + h * 0.98, cy + h * 0.98], fill=fill)
    else:
        dr.polygon([(cx, cy - h * 1.18), (cx + h * 0.95, cy), (cx, cy + h * 1.18), (cx - h * 0.95, cy)], fill=fill)


def tile(img, k, x, y, s, hi=False):
    base = hx(COL[k])
    r = int(s * 0.24)
    sh = Image.new("L", (N, N), 0)
    ImageDraw.Draw(sh).rounded_rectangle([x, y + s * 0.07, x + s, y + s * 1.07], radius=r, fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(s * 0.08))
    img = Image.composite(Image.new("RGB", (N, N), (0, 0, 0)), img, sh)
    top = mix(base, (255, 255, 255), 0.55 if hi else 0.32)
    mid = mix(base, (255, 255, 255), 0.22) if hi else base
    bot = mix(base, (0, 0, 0), 0.18 if hi else 0.34)
    body = vgrad(int(s), int(s), top, mid, bot)
    m = Image.new("L", (int(s), int(s)), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=255)
    img.paste(body, (int(x), int(y)), m)
    gl = Image.new("L", (int(s), int(s)), 0)
    ImageDraw.Draw(gl).ellipse([s * 0.5 - s * 0.72, -s * 0.62, s * 0.5 + s * 0.72, s * 0.38], fill=int(255 * (0.26 if hi else 0.16)))
    gl = Image.fromarray(np.minimum(np.array(gl), np.array(m)))
    img.paste((255, 255, 255), (int(x), int(y)), gl)
    em = Image.new("L", (N, N), 0)
    glyph(ImageDraw.Draw(em), k, x + s / 2, y + s / 2 + s * 0.02, s * 0.25, 255)
    esh = em.filter(ImageFilter.GaussianBlur(s * 0.03))
    esh = Image.eval(esh, lambda v: int(v * 0.6)).transform(esh.size, Image.AFFINE, (1, 0, 0, 0, 1, -s * 0.03))
    img = Image.composite(Image.new("RGB", (N, N), mix(base, (0, 0, 0), 0.6)), img, esh)
    img = Image.composite(Image.new("RGB", (N, N), mix(base, (255, 255, 255), 0.9 if hi else 0.78)), img, em)
    sp = Image.new("L", (N, N), 0)
    rr = s * 0.055
    ImageDraw.Draw(sp).ellipse([x + s * 0.22 - rr, y + s * 0.2 - rr, x + s * 0.22 + rr, y + s * 0.2 + rr], fill=150)
    img.paste((255, 255, 255), (0, 0), sp)
    return img


def render(grid_fraction):
    """3×3 tile grid with the amber L-shaped group highlighted; grid_fraction = grid width / icon width."""
    bg = Image.new("RGB", (N, N))
    d = ImageDraw.Draw(bg)
    for y in range(0, N, S):
        d.rectangle([0, y, N, y + S], fill=mix(hx("#232a5c"), hx("#0b0e1d"), y / N))
    img = bg
    cell = N * grid_fraction / 3
    off = (N - cell * 3) / 2
    ins = cell * 0.055
    s = cell - 2 * ins
    layout = [[5, 2, 4], [1, 4, 3], [1, 1, 2]]
    hl = {(1, 0), (2, 0), (2, 1)}
    for r in range(3):
        for c in range(3):
            lift = cell * 0.05 if (r, c) in hl else 0
            img = tile(img, layout[r][c], off + c * cell + ins, off + r * cell + ins - lift, s, (r, c) in hl)
    ol = Image.new("L", (N, N), 0)
    od = ImageDraw.Draw(ol)
    lw = int(cell * 0.05)
    lift = cell * 0.05

    def X(c):
        return off + c * cell

    def Y(r):
        return off + r * cell - lift

    segs = [((X(0), Y(1)), (X(0), Y(3))), ((X(0), Y(3)), (X(2), Y(3))), ((X(2), Y(3)), (X(2), Y(2))),
            ((X(2), Y(2)), (X(1), Y(2))), ((X(1), Y(2)), (X(1), Y(1))), ((X(1), Y(1)), (X(0), Y(1)))]
    for a, b in segs:
        od.line([a, b], fill=255, width=lw)
    for a, _ in segs:
        od.ellipse([a[0] - lw / 2, a[1] - lw / 2, a[0] + lw / 2, a[1] + lw / 2], fill=255)
    glow = ol.filter(ImageFilter.GaussianBlur(cell * 0.08))
    img = Image.composite(Image.new("RGB", (N, N), hx("#FFB547")), img, Image.eval(glow, lambda v: min(255, int(v * 1.6))))
    img = Image.composite(Image.new("RGB", (N, N), (255, 255, 255)), img, ol)
    return img.resize((1024, 1024), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    full = render(0.765)
    for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png"), (32, "favicon-32.png")]:
        full.resize((size, size), Image.LANCZOS).save(OUT / name)
    # Maskable icons must keep content inside the central 80% circle, so the grid is smaller.
    render(0.52).resize((512, 512), Image.LANCZOS).save(OUT / "maskable-512.png")
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
