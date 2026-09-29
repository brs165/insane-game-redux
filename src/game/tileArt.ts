import { COLS, ROWS } from '../model/board';

/** Index = tile kind. 1 triangle (amber), 2 cross (coral), 3 square (mint), 4 circle (violet), 5 diamond (sky). */
export const TILE_COLORS = ['#000000', '#FFB547', '#FF5D73', '#3DDC97', '#9B7BFF', '#43B8F5'];
export const LCD = { bg: '#a7b594', bg2: '#97a585', px: '#1f2a1c', bezel: '#2a2e3d' };
export const WELL = { top: '#171c3b', bottom: '#0f1329' };
export const DANGER = '#FF3355';

/** The original 8×8 token bitmaps from INSANE.z80 (Token1…Token5). */
export const BITMAPS: number[][] = [
  [],
  [0x10, 0x38, 0x38, 0x6c, 0x74, 0xf6, 0xfe, 0x00],
  [0x38, 0x38, 0xe6, 0xf6, 0xfe, 0x38, 0x38, 0x00],
  [0xfe, 0xc6, 0xf6, 0xf6, 0xfe, 0xfe, 0xfe, 0x00],
  [0x38, 0x6c, 0xf6, 0xfe, 0xfe, 0x7c, 0x38, 0x00],
  [0x10, 0x38, 0x6c, 0xfe, 0x7c, 0x38, 0x10, 0x00]
];

/** The original 96 × 8 title bitmap (TitleBitmap), one string per row. */
export const TITLE_ROWS = [
  '001100110011101111100011100001100111011111100000111110001110000111001110111111000000001000011110',
  '011101111011011001100011100011110110111000000001100110001110001111011101110000000000011000000001',
  '011001111011011110000111100011110110111111000011000000011110001111011101111110010001001000000001',
  '011001111011001111101101110011110110111110000011011110110111001111111101111100001010001000000110',
  '011011101110010011101111110111011101110000000111000100111111011011101111100000001010001000000001',
  '110011001110110011011111110110011101111110000111011101111111011011011011111100001010001000000001',
  '110011001110111110111001110110011101111110000011111011100111011011011011111100000100011101011110',
  '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
];

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function glyphPath(g: CanvasRenderingContext2D, kind: number, cx: number, cy: number, h: number): void {
  g.beginPath();
  if (kind === 1) {
    g.moveTo(cx, cy - h * 1.05); g.lineTo(cx + h * 1.12, cy + h * 0.9); g.lineTo(cx - h * 1.12, cy + h * 0.9); g.closePath();
  } else if (kind === 2) {
    const a = h * 0.38, b = h * 1.05;
    const pts = [[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]];
    pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x, cy + y) : g.moveTo(cx + x, cy + y)));
    g.closePath();
  } else if (kind === 3) {
    const s = h * 0.86; g.rect(cx - s, cy - s, 2 * s, 2 * s);
  } else if (kind === 4) {
    g.arc(cx, cy, h * 0.98, 0, Math.PI * 2);
  } else {
    g.moveTo(cx, cy - h * 1.18); g.lineTo(cx + h * 0.95, cy); g.lineTo(cx, cy + h * 1.18); g.lineTo(cx - h * 0.95, cy); g.closePath();
  }
}

/** A pre-rendered tile. `margin` is transparent space around the face for the drop shadow (CSS px). */
export interface Sprite {
  canvas: HTMLCanvasElement;
  margin: number;
  size: number;
}

export const spriteMargin = (cell: number) => Math.ceil(cell * 0.2);

function drawGem(g: CanvasRenderingContext2D, kind: number, cell: number, m: number, bright: boolean): void {
  const inset = cell * 0.055, x = m + inset, y = m + inset, s = cell - inset * 2, r = s * 0.24;
  const base = TILE_COLORS[kind];
  const top = mix(base, '#ffffff', bright ? 0.55 : 0.32);
  const mid = bright ? mix(base, '#ffffff', 0.22) : base;
  const bot = mix(base, '#000000', bright ? 0.18 : 0.34);

  g.save();
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = cell * 0.14; g.shadowOffsetY = cell * 0.07;
  roundRect(g, x, y, s, s, r); g.fillStyle = bot; g.fill();
  g.restore();

  const grd = g.createLinearGradient(0, y, 0, y + s);
  grd.addColorStop(0, top); grd.addColorStop(0.5, mid); grd.addColorStop(1, bot);
  roundRect(g, x, y, s, s, r); g.fillStyle = grd; g.fill();

  g.save();
  roundRect(g, x, y, s, s, r); g.clip();
  g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(x, y + s * 0.84, s, s * 0.2);
  g.beginPath(); g.ellipse(x + s * 0.5, y - s * 0.12, s * 0.72, s * 0.5, 0, 0, Math.PI * 2);
  g.fillStyle = bright ? 'rgba(255,255,255,.26)' : 'rgba(255,255,255,.15)'; g.fill();
  g.restore();

  const lw = Math.max(1, cell * 0.03);
  const rim = g.createLinearGradient(0, y, 0, y + s);
  rim.addColorStop(0, bright ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.55)');
  rim.addColorStop(0.45, 'rgba(255,255,255,0)');
  roundRect(g, x + lw / 2, y + lw / 2, s - lw, s - lw, r - lw / 2); g.strokeStyle = rim; g.lineWidth = lw; g.stroke();

  const gh = s * 0.25;
  g.save();
  g.lineJoin = 'round'; g.lineWidth = gh * 0.3;
  g.shadowColor = mix(base, '#000000', 0.6); g.shadowBlur = cell * 0.05; g.shadowOffsetY = cell * 0.03;
  glyphPath(g, kind, x + s / 2, y + s / 2 + s * 0.02, gh);
  g.fillStyle = g.strokeStyle = mix(base, '#ffffff', bright ? 0.9 : 0.78);
  g.fill(); g.stroke();
  g.restore();

  g.beginPath(); g.arc(x + s * 0.22, y + s * 0.2, s * 0.055, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,.6)'; g.fill();
}

function drawLcd(g: CanvasRenderingContext2D, kind: number, cell: number, m: number, inverted: boolean): void {
  const p = cell / 8, gap = Math.max(0.6, p * 0.14), bits = BITMAPS[kind];
  if (inverted) { g.fillStyle = LCD.px; g.fillRect(m, m, cell, cell); }
  g.fillStyle = inverted ? LCD.bg : LCD.px;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (bits[row] & (0x80 >> col)) g.fillRect(m + col * p + gap / 2, m + row * p + gap / 2, p - gap, p - gap);
    }
  }
}

export function makeSprite(kind: number, cell: number, dpr: number, classic: boolean, highlighted: boolean): Sprite {
  const m = spriteMargin(cell), size = cell + m * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.ceil(size * dpr);
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  if (classic) drawLcd(g, kind, cell, m, highlighted); else drawGem(g, kind, cell, m, highlighted);
  return { canvas, margin: m, size };
}

/** The recessed well behind the tiles: faint slots (modern) or LCD glass with a bezel (classic). */
export function makeWell(w: number, h: number, cell: number, pad: number, dpr: number, classic: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * dpr); canvas.height = Math.ceil(h * dpr);
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  if (classic) {
    roundRect(g, 0, 0, w, h, cell * 0.35); g.fillStyle = LCD.bezel; g.fill();
    const m = pad * 0.45;
    const grd = g.createLinearGradient(0, m, 0, h - m);
    grd.addColorStop(0, LCD.bg); grd.addColorStop(1, LCD.bg2);
    roundRect(g, m, m, w - m * 2, h - m * 2, cell * 0.12); g.fillStyle = grd; g.fill();
    g.fillStyle = 'rgba(0,0,0,.035)';
    const p = cell / 8;
    for (let y = pad; y < pad + ROWS * cell; y += p) g.fillRect(pad, y, COLS * cell, Math.max(0.5, p * 0.12));
    return canvas;
  }
  roundRect(g, 0, 0, w, h, cell * 0.42);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, WELL.top); grd.addColorStop(1, WELL.bottom);
  g.fillStyle = grd; g.fill();
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
  roundRect(g, 0.5, 0.5, w - 1, h - 1, cell * 0.42); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.028)';
  const i = cell * 0.08;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      roundRect(g, pad + c * cell + i, pad + r * cell + i, cell - 2 * i, cell - 2 * i, cell * 0.2); g.fill();
    }
  }
  return canvas;
}

/** Tile images as data URLs, for DOM use (How to Play, score rows). Cached per size. */
const urlCache = new Map<string, string>();
export function spriteURL(kind: number, cell: number, highlighted = false): string {
  const key = `${kind}-${cell}-${highlighted}`;
  let url = urlCache.get(key);
  if (!url) {
    url = makeSprite(kind, cell, Math.min(3, Math.max(2, window.devicePixelRatio || 1)), false, highlighted).canvas.toDataURL('image/png');
    urlCache.set(key, url);
  }
  return url;
}

/** Draws the 96 × 8 title bitmap onto a canvas at `scale` px per pixel. */
export function drawTitleBitmap(canvas: HTMLCanvasElement, scale = 4): void {
  canvas.width = 96 * scale; canvas.height = 8 * scale;
  const g = canvas.getContext('2d')!;
  g.fillStyle = LCD.bg; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = LCD.px;
  TITLE_ROWS.forEach((row, y) => [...row].forEach((b, x) => {
    if (b === '1') g.fillRect(x * scale + 0.4, y * scale + 0.4, scale - 0.8, scale - 0.8);
  }));
}
