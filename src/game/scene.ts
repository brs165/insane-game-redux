import { Board, COLS, ROWS, type Cell, cellKey } from '../model/board';
import { GameEngine, isAction, pointsForGroup, type Clear, type EndReason } from '../model/engine';
import { DANGER, LCD, TILE_COLORS, makeSprite, makeWell, mix, roundRect, type Sprite } from './tileArt';

/** Events the board reports to its owner (GameSession). The title-screen demo has no delegate. */
export interface SceneDelegate {
  didClear(clear: Clear): void;
  didSpawn(): void;
  didTick(): void;
  didTapInvalid(): void;
  didArmGroup(): void;
  willEnd(reason: EndReason): void;
  didEnd(reason: EndReason): void;
}

export type Role = 'play' | 'demo';
type InputMode = 'mouse' | 'touch' | 'key';

/** Per-tile animation state in board units (row 0 = top). Chases the tile's real cell every frame. */
interface TileAnim { col: number; row: number; vy: number; squash: number; wiggle: number }
interface Dying { kind: number; x: number; y: number; life: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: number; size: number; rot: number; vr: number; spark: boolean }
interface Floater { x: number; y: number; text: string; life: number; kind: number; big: number; banner: boolean }
interface Ring { x: number; y: number; life: number; kind: number; n: number }

const GRAVITY = 60; // cells per second²
const HOVER_PREVIEW_DELAY = 3; // seconds the mouse must rest on a cell before the highlight/points preview shows
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const FONT_DISPLAY = 'Bungee, "Arial Black", sans-serif';
const FONT_UI = 'Sora, system-ui, -apple-system, sans-serif';
const FONT_PIXEL = 'Silkscreen, ui-monospace, monospace';

/**
 * Renders the board on a canvas and handles input. Rules live in GameEngine; this class animates them.
 * Port of GameScene.swift (SpriteKit) onto Canvas 2D.
 */
export class GameScene {
  engine: GameEngine;
  readonly role: Role;
  delegate: SceneDelegate | null = null;
  tapTwice: boolean;
  paused = false;
  isEnding = false;
  /** Lets the owner update help text when the player switches between mouse, touch and keyboard. */
  onInputModeChange: ((mode: InputMode) => void) | null = null;

  private readonly g: CanvasRenderingContext2D;
  private isClassic: boolean;
  private dpr = 1;
  private cell = 0;
  private pad = 0;
  private W = 0;
  private H = 0;
  private sprites: { n: Sprite; h: Sprite }[] = [];
  private well: HTMLCanvasElement | null = null;

  private anim = new Map<number, TileAnim>();
  private dying: Dying[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private shake = 0;
  private flash = 0;
  private clock = 0;
  private settleUntil = 0;
  private demoTimer = 1.6;
  private needsDrop = true;

  private raf = 0;
  private last = 0;
  private running = false;
  private timers: number[] = [];
  private cleanup: (() => void)[] = [];

  private inputMode: InputMode = 'mouse';
  private hoverFocus: Cell | null = null;
  private hoverSince = 0;
  private touchFocus: Cell | null = null;
  private armed: Cell | null = null;
  private cursor: Cell = { col: 0, row: 0 };
  private cursorVis = { x: 0, y: 0 };

  constructor(private readonly canvas: HTMLCanvasElement, engine: GameEngine, role: Role, opts: { classic: boolean; tapTwice: boolean }) {
    this.engine = engine;
    this.role = role;
    this.isClassic = opts.classic;
    this.tapTwice = opts.tapTwice;
    this.g = canvas.getContext('2d')!;
    if (isAction(engine.mode)) this.cursor = { col: 0, row: ROWS / 2 };
    this.cursorVis = { x: this.cursor.col, y: this.cursor.row };
    if (role === 'play') this.attachInput();
  }

  // MARK: - Public API

  get classic(): boolean { return this.isClassic; }
  set classic(on: boolean) {
    if (on === this.isClassic) return;
    this.isClassic = on;
    this.buildArt();
  }

  /** Fits the board inside the available box (CSS px) and sizes the canvas to it. */
  layout(availableWidth: number, availableHeight: number): void {
    const w = Math.max(160, availableWidth), h = Math.max(110, availableHeight);
    const cell = Math.max(16, Math.floor(Math.min(w / (COLS + 0.7), h / (ROWS + 0.7))));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (cell === this.cell && dpr === this.dpr && this.sprites.length) return;
    this.cell = cell;
    this.pad = Math.round(cell * 0.35);
    this.W = cell * COLS + this.pad * 2;
    this.H = cell * ROWS + this.pad * 2;
    this.dpr = dpr;
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.buildArt();
    if (this.needsDrop) {
      this.needsDrop = false;
      this.populate(true);
    }
    if (!this.running) this.draw();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.stop();
    this.timers.forEach((t) => clearTimeout(t));
    this.cleanup.forEach((fn) => fn());
    this.delegate = null;
  }

  /** Ends the game immediately (pause menu → End game). */
  endGame(): void {
    if (this.role !== 'play' || this.isEnding) return;
    this.engine.quit();
    this.beginEnding('quit');
  }

  /** Keyboard play on desktop: arrows move, Space/Enter clears. Returns true if handled. */
  handleKey(key: string): boolean {
    if (this.role !== 'play' || this.isEnding || this.paused) return false;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const mv = moves[key];
    if (mv) {
      this.engine.registerTouch();
      if (this.inputMode !== 'key') {
        if (this.hoverFocus) this.cursor = { ...this.hoverFocus };
        this.cursorVis = { x: this.cursor.col, y: this.cursor.row };
        this.setInputMode('key');
      } else {
        const col = (this.cursor.col + mv[0] + COLS) % COLS, row = (this.cursor.row + mv[1] + ROWS) % ROWS;
        if (Math.abs(col - this.cursor.col) > 1 || Math.abs(row - this.cursor.row) > 1) this.cursorVis = { x: col, y: row };
        this.cursor = { col, row };
      }
      return true;
    }
    if (key === ' ' || key === 'Enter' || key === 'z' || key === 'Z') {
      this.engine.registerTouch();
      if (this.inputMode !== 'key') {
        if (this.hoverFocus) this.cursor = { ...this.hoverFocus };
        this.setInputMode('key');
      }
      this.performClear(this.cursor);
      return true;
    }
    return false;
  }

  // MARK: - Art & layout

  private buildArt(): void {
    if (!this.cell) return;
    this.sprites = [];
    for (let k = 0; k <= 5; k++) {
      const kind = Math.max(1, k);
      this.sprites.push({
        n: makeSprite(kind, this.cell, this.dpr, this.isClassic, false),
        h: makeSprite(kind, this.cell, this.dpr, this.isClassic, true)
      });
    }
    this.well = makeWell(this.W, this.H, this.cell, this.pad, this.dpr, this.isClassic);
  }

  private populate(dropIn: boolean): void {
    this.anim.clear();
    this.engine.board.forEachTile((tile, c) => {
      let row = c.row;
      if (dropIn) row = c.row - ROWS - 1 - (ROWS - 1 - c.row) * 0.55 - Math.random() * 0.5;
      this.anim.set(tile.id, { col: c.col, row, vy: 0, squash: 0, wiggle: 0 });
    });
  }

  private cellAt(clientX: number, clientY: number): Cell | null {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !this.cell) return null;
    const x = (clientX - r.left) * (this.W / r.width) - this.pad;
    const y = (clientY - r.top) * (this.H / r.height) - this.pad;
    const c = { col: Math.floor(x / this.cell), row: Math.floor(y / this.cell) };
    return Board.isInside(c) ? c : null;
  }

  // MARK: - Input

  /** Restarts the hover-preview delay whenever the pointer moves to a different cell. */
  private setHover(cell: Cell | null): void {
    const same = cell && this.hoverFocus && cell.col === this.hoverFocus.col && cell.row === this.hoverFocus.row;
    if (!same) this.hoverSince = this.clock;
    this.hoverFocus = cell;
  }

  private setInputMode(mode: InputMode): void {
    if (mode === this.inputMode) return;
    this.inputMode = mode;
    this.onInputModeChange?.(mode);
  }

  private attachInput(): void {
    const c = this.canvas;
    const down = (e: PointerEvent) => {
      if (this.isEnding || this.paused) return;
      e.preventDefault();
      this.engine.registerTouch();
      const cell = this.cellAt(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') {
        this.setInputMode('mouse');
        this.setHover(cell);
      } else {
        this.setInputMode('touch');
        this.touchFocus = cell;
        try { c.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
    };
    const move = (e: PointerEvent) => {
      if (this.isEnding || this.paused) return;
      const cell = this.cellAt(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') {
        this.setInputMode('mouse');
        this.setHover(cell);
      } else if (this.touchFocus !== null || e.buttons) {
        this.touchFocus = cell;
      }
    };
    const up = (e: PointerEvent) => {
      if (this.isEnding || this.paused) return;
      const cell = this.cellAt(e.clientX, e.clientY);
      this.touchFocus = null;
      if (!cell) return; // lifted off the board: cancel
      this.handleTap(cell, e.pointerType === 'mouse');
    };
    const cancel = () => { this.touchFocus = null; };
    const leave = (e: PointerEvent) => { if (e.pointerType === 'mouse') this.setHover(null); };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', cancel);
    c.addEventListener('pointerleave', leave);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this.cleanup.push(() => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', cancel);
      c.removeEventListener('pointerleave', leave);
    });
  }

  private handleTap(cell: Cell, isMouse: boolean): void {
    // Mouse users already see the hover preview, so a click clears straight away.
    const needsArm = !isAction(this.engine.mode) && this.tapTwice && !isMouse;
    if (!needsArm) {
      this.armed = null;
      this.performClear(cell);
      return;
    }
    const armedGroup = this.armed ? this.engine.board.group(this.armed) : [];
    if (armedGroup.some((c) => c.col === cell.col && c.row === cell.row)) {
      this.armed = null;
      this.performClear(cell);
    } else if (this.engine.board.group(cell).length >= 2) {
      this.armed = cell;
      this.delegate?.didArmGroup();
    } else {
      this.armed = null;
      this.rejectTap(cell);
    }
  }

  private rejectTap(cell: Cell): void {
    const tile = this.engine.board.get(cell);
    if (!tile) return;
    const a = this.anim.get(tile.id);
    if (a) a.wiggle = 1;
    this.delegate?.didTapInvalid();
  }

  private performClear(cell: Cell): void {
    const result = this.engine.clear(cell);
    if (!result) { this.rejectTap(cell); return; }
    this.animateClear(result);
    this.settleUntil = this.clock + 0.28;
    this.delegate?.didClear(result);
    if (this.role === 'play' && this.engine.endReason) this.beginEnding(this.engine.endReason);
  }

  // MARK: - Frame loop

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = this.last === 0 ? 1 / 60 : Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.paused) {
      this.update(dt);
      this.draw();
    } else {
      this.last = 0;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    if (!this.cell) return;
    this.clock += dt;

    if (this.role === 'play') {
      if (!this.isEnding) {
        const spawns = this.engine.advance(dt);
        for (const s of spawns) this.anim.set(s.tile.id, { col: s.cell.col, row: -1.1, vy: 4, squash: 0, wiggle: 0 });
        if (spawns.length) this.delegate?.didSpawn();
        if (this.engine.endReason === 'overflow') this.beginEnding('overflow');
        this.delegate?.didTick();
      }
    } else {
      this.demoTimer -= dt;
      if (this.demoTimer <= 0) this.runDemoStep();
    }

    this.engine.board.forEachTile((tile, c) => {
      let a = this.anim.get(tile.id);
      if (!a) { a = { col: c.col, row: c.row, vy: 0, squash: 0, wiggle: 0 }; this.anim.set(tile.id, a); }
      if (a.row < c.row) {
        a.vy += GRAVITY * dt;
        a.row += a.vy * dt;
        if (a.row >= c.row) { a.row = c.row; a.squash = Math.min(1, a.vy / 13); a.vy = 0; }
      } else if (a.row > c.row) {
        a.row = c.row; a.vy = 0;
      }
      // Slide sideways only once landed, like the original's DownGrav then LeftGrav.
      if (a.row >= c.row && a.col !== c.col) {
        a.col += (c.col - a.col) * Math.min(1, dt * 16);
        if (Math.abs(a.col - c.col) < 0.01) a.col = c.col;
      }
      a.squash = Math.max(0, a.squash - dt * 6);
      a.wiggle = Math.max(0, a.wiggle - dt * 2.5);
    });

    this.dying = this.dying.filter((d) => (d.life += dt) < 0.26);
    this.particles = this.particles.filter((p) => {
      p.life += dt; p.vy += 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      return p.life < p.max;
    });
    this.floaters = this.floaters.filter((f) => (f.life += dt) < (f.banner ? 1.6 : 1.0));
    this.rings = this.rings.filter((r) => (r.life += dt) < 0.6);
    this.shake *= Math.exp(-dt * 9);
    if (this.shake < 0.2) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 1.2);
    this.cursorVis.x += (this.cursor.col - this.cursorVis.x) * Math.min(1, dt * 22);
    this.cursorVis.y += (this.cursor.row - this.cursorVis.y) * Math.min(1, dt * 22);
  }

  // MARK: - Drawing

  private focusCell(): Cell | null {
    if (this.role !== 'play' || this.isEnding || this.clock < this.settleUntil) return null;
    if (this.touchFocus) return this.touchFocus;
    if (this.inputMode === 'key') return this.cursor;
    if (this.inputMode === 'mouse' && this.hoverFocus) {
      return this.clock - this.hoverSince >= HOVER_PREVIEW_DELAY ? this.hoverFocus : null;
    }
    return this.armed;
  }

  private drawSprite(sp: Sprite, col: number, row: number, opts: { lift?: number; alpha?: number; squash?: number; wiggle?: number; scale?: number } = {}): void {
    const g = this.g, cell = this.cell;
    const squash = opts.squash ?? 0, wiggle = opts.wiggle ?? 0, scale = opts.scale ?? 1;
    const wob = wiggle > 0 ? Math.sin(wiggle * 28) * wiggle * cell * 0.09 : 0;
    const px = this.pad + col * cell + cell / 2 + wob;
    const py = this.pad + row * cell + cell + (opts.lift ?? 0);
    g.save();
    g.globalAlpha = opts.alpha ?? 1;
    g.translate(px, py);
    g.scale((1 + squash * 0.08) * scale, (1 - squash * 0.14) * scale);
    g.drawImage(sp.canvas, -cell / 2 - sp.margin, -cell - sp.margin, sp.size, sp.size);
    g.restore();
  }

  draw(): void {
    const g = this.g, cell = this.cell, pad = this.pad, W = this.W, H = this.H;
    if (!cell || !this.sprites.length) return;
    const classic = this.isClassic;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (this.shake) g.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    if (this.well) g.drawImage(this.well, 0, 0, W, H);

    const fc = this.focusCell();
    let group = fc ? this.engine.board.group(fc) : [];
    if (group.length < 2) group = [];
    const inGroup = new Set(group.map(cellKey));
    const lift = classic ? 0 : -cell * 0.05;
    const overflowed = this.isEnding && this.engine.endReason === 'overflow';

    g.save();
    g.beginPath(); g.rect(0, pad - cell * 0.1, W, H); g.clip();

    // Action Mode: ghost of the next tile grows in its slot.
    if (this.role === 'play' && isAction(this.engine.mode) && !this.isEnding) {
      const slot = this.engine.board.spawnSlot();
      if (slot) {
        const p = this.engine.spawnProgress;
        this.drawSprite(this.sprites[this.engine.nextKind].n, slot.col, slot.row, { alpha: 0.12 + 0.3 * p, scale: 0.55 + 0.3 * p });
      }
    }

    this.engine.board.forEachTile((tile, c) => {
      const a = this.anim.get(tile.id);
      if (!a) return;
      const hl = inGroup.has(cellKey(c));
      const sp = hl ? this.sprites[tile.kind].h : this.sprites[tile.kind].n;
      const alpha = overflowed ? 0.75 : group.length && !hl && !classic ? 0.5 : 1;
      this.drawSprite(sp, a.col, a.row, { lift: hl ? lift : 0, alpha, squash: a.squash, wiggle: a.wiggle });
    });

    for (const d of this.dying) {
      const k = d.life / 0.26, sp = this.sprites[d.kind].h;
      const s = 1 + k * 0.25 - k * k * 1.1;
      g.save();
      g.globalAlpha = 1 - k;
      g.translate(pad + d.x * cell, pad + d.y * cell);
      g.rotate(k * 0.6);
      g.scale(Math.max(0, s), Math.max(0, s));
      g.drawImage(sp.canvas, -cell / 2 - sp.margin, -cell / 2 - sp.margin, sp.size, sp.size);
      g.restore();
    }
    g.restore();

    if (group.length) this.drawGroupPreview(group, inGroup, lift);
    if (this.role === 'play' && this.inputMode === 'key' && !this.isEnding) this.drawCursor();
    this.drawEffects();

    if (this.role === 'play' && isAction(this.engine.mode)) {
      const fill = this.engine.tileCount / (COLS * ROWS);
      const a = Math.max(0, (fill - 0.72) / 0.28) * (0.55 + 0.45 * Math.sin(this.clock * (6 + fill * 6))) + this.flash;
      if (a > 0.01) {
        g.save();
        g.globalAlpha = Math.min(1, a);
        g.strokeStyle = classic ? LCD.px : DANGER;
        g.lineWidth = cell * 0.14;
        g.shadowColor = DANGER;
        g.shadowBlur = classic ? 0 : cell * 0.6;
        roundRect(g, cell * 0.07, cell * 0.07, W - cell * 0.14, H - cell * 0.14, cell * 0.38);
        g.stroke();
        g.restore();
      }
    }
  }

  private drawGroupPreview(group: Cell[], inGroup: Set<number>, lift: number): void {
    const g = this.g, cell = this.cell, pad = this.pad, classic = this.isClassic;
    const tile = this.engine.board.get(group[0]);
    if (!tile) return;
    const color = classic ? LCD.px : TILE_COLORS[tile.kind];
    if (!classic) {
      g.save();
      g.lineCap = 'round';
      g.beginPath();
      for (const c of group) {
        const X = pad + c.col * cell, Y = pad + c.row * cell + lift;
        const has = (col: number, row: number) => col >= 0 && col < COLS && inGroup.has(row * COLS + col);
        if (!has(c.col + 1, c.row)) { g.moveTo(X + cell, Y); g.lineTo(X + cell, Y + cell); }
        if (!has(c.col - 1, c.row)) { g.moveTo(X, Y); g.lineTo(X, Y + cell); }
        if (!has(c.col, c.row - 1)) { g.moveTo(X, Y); g.lineTo(X + cell, Y); }
        if (!has(c.col, c.row + 1)) { g.moveTo(X, Y + cell); g.lineTo(X + cell, Y + cell); }
      }
      g.strokeStyle = color; g.globalAlpha = 0.45; g.lineWidth = cell * 0.2;
      g.globalCompositeOperation = 'lighter';
      g.stroke();
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.75 + 0.25 * Math.sin(this.clock * 6);
      g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(2, cell * 0.055);
      g.shadowColor = color; g.shadowBlur = cell * 0.3;
      g.stroke();
      g.restore();
    }

    // Points chip above the top of the group: "7 tiles  +36"
    const n = group.length, pts = pointsForGroup(n);
    const top = Math.min(...group.map((c) => c.row));
    const xs = group.filter((c) => c.row === top).map((c) => c.col);
    const cx = pad + (xs.reduce((s, x) => s + x, 0) / xs.length + 0.5) * cell;
    const fs = Math.max(11, Math.round(cell * 0.34));
    g.save();
    g.font = `700 ${fs}px ${classic ? FONT_PIXEL : FONT_UI}`;
    const a = `${n} tiles  `, b = `+${pts}`;
    const wa = g.measureText(a).width, wb = g.measureText(b).width;
    const w = wa + wb + fs * 1.2, h = fs * 1.9;
    const x = Math.max(4, Math.min(this.W - w - 4, cx - w / 2));
    const y = Math.max(3, pad + top * cell + lift - h - cell * 0.08);
    g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = classic ? 0 : 12;
    roundRect(g, x, y, w, h, classic ? 2 : h / 2);
    g.fillStyle = classic ? LCD.bg : 'rgba(12,14,32,.92)'; g.fill();
    g.shadowBlur = 0; g.lineWidth = 1.5; g.strokeStyle = color; g.stroke();
    g.textBaseline = 'middle';
    g.fillStyle = classic ? LCD.px : '#e6e8f7'; g.fillText(a, x + fs * 0.6, y + h / 2 + 1);
    g.fillStyle = color; g.fillText(b, x + fs * 0.6 + wa, y + h / 2 + 1);
    g.restore();
  }

  private drawCursor(): void {
    const g = this.g, cell = this.cell, i = cell * 0.02;
    const X = this.pad + this.cursorVis.x * cell, Y = this.pad + this.cursorVis.y * cell;
    const color = this.engine.mode === 'action' ? '#FF5D73' : this.engine.mode === 'daily' ? '#3DDC97' : '#FFB547';
    g.save();
    g.lineWidth = Math.max(2, cell * 0.06);
    if (this.isClassic) { g.setLineDash([cell * 0.1, cell * 0.08]); g.strokeStyle = LCD.px; }
    else { g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = cell * 0.3; g.globalAlpha = 0.7 + 0.3 * Math.sin(this.clock * 8); }
    roundRect(g, X + i, Y + i, cell - 2 * i, cell - 2 * i, this.isClassic ? 2 : cell * 0.26);
    g.stroke();
    g.restore();
  }

  private drawEffects(): void {
    const g = this.g, cell = this.cell, pad = this.pad, classic = this.isClassic;
    for (const r of this.rings) {
      const k = r.life / 0.6;
      g.save();
      g.globalAlpha = (1 - k) * 0.8;
      g.strokeStyle = classic ? LCD.px : TILE_COLORS[r.kind];
      g.lineWidth = cell * 0.1 * (1 - k) + 1;
      g.beginPath(); g.arc(pad + r.x * cell, pad + r.y * cell, cell * (0.5 + k * (1.5 + r.n * 0.08)), 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    for (const p of this.particles) {
      const k = p.life / p.max, x = pad + p.x * cell, y = pad + p.y * cell, s = p.size * cell * (1 - k * 0.5);
      g.save();
      g.globalAlpha = 1 - k * k;
      g.translate(x, y);
      g.rotate(p.rot);
      if (classic) {
        g.fillStyle = LCD.px;
        const q = Math.max(2, Math.round(cell / 8));
        g.fillRect(-q / 2, -q / 2, q, q);
      } else if (p.spark) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = mix(TILE_COLORS[p.kind], '#ffffff', 0.6);
        g.beginPath(); g.arc(0, 0, s * 0.45, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = TILE_COLORS[p.kind];
        roundRect(g, -s / 2, -s / 2, s, s, s * 0.25); g.fill();
      }
      g.restore();
    }
    for (const f of this.floaters) {
      if (f.life < 0) continue;
      const k = f.life / (f.banner ? 1.6 : 1.0);
      const size = f.banner ? Math.max(18, cell * 0.8) : Math.max(14, cell * (0.42 + f.big * 0.5));
      const y = pad + f.y * cell - k * cell * (f.banner ? 0.4 : 1.1);
      const x = Math.max(size * 1.5, Math.min(this.W - size * 1.5, pad + f.x * cell));
      const pop = Math.min(1, f.life * 10), sc = 0.6 + 0.4 * pop + (1 - pop) * 0.3;
      g.save();
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      g.translate(x, y); g.scale(sc, sc);
      g.font = `${size}px ${classic ? FONT_PIXEL : FONT_DISPLAY}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (!classic) { g.lineWidth = size * 0.16; g.strokeStyle = 'rgba(10,12,28,.85)'; g.lineJoin = 'round'; g.strokeText(f.text, 0, 0); }
      g.fillStyle = classic ? LCD.px : f.banner ? '#ffffff' : mix(TILE_COLORS[f.kind], '#ffffff', 0.25);
      g.fillText(f.text, 0, 0);
      g.restore();
    }
  }

  // MARK: - Effects

  private animateClear(result: Clear): void {
    const n = result.size;
    const per = reduceMotion() ? 1 : n > 40 ? 3 : n > 20 ? 4 : 6;
    let sx = 0, sy = 0, count = 0;
    for (const tile of result.tiles) {
      const a = this.anim.get(tile.id);
      this.anim.delete(tile.id);
      if (!a) continue;
      const x = a.col + 0.5, y = a.row + 0.5;
      sx += x; sy += y; count++;
      this.dying.push({ kind: tile.kind, x, y, life: 0 });
      for (let i = 0; i < per; i++) {
        const ang = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5 + Math.min(n, 30) * 0.08;
        this.particles.push({
          x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 3, life: 0, max: 0.5 + Math.random() * 0.45,
          kind: tile.kind, size: 0.08 + Math.random() * 0.12, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, spark: Math.random() < 0.35
        });
      }
    }
    if (!count) return;
    const mx = sx / count, my = sy / count;
    if (this.role === 'play') {
      this.floaters.push({ x: mx, y: my, text: `+${result.points}`, life: 0, kind: result.kind, big: Math.min(1, n / 18), banner: false });
      if (n > 5 && !reduceMotion()) this.shake = Math.max(this.shake, Math.min(14, (n - 5) * 1.3));
    }
    if (n >= 10 && !reduceMotion()) this.rings.push({ x: mx, y: my, life: 0, kind: result.kind, n });
  }

  private beginEnding(reason: EndReason): void {
    if (this.isEnding) return;
    this.isEnding = true;
    this.touchFocus = null;
    this.armed = null;
    this.delegate?.willEnd(reason);
    if (reason === 'cleared') {
      this.floaters.push({ x: COLS / 2, y: ROWS / 2, text: 'BOARD CLEAR ×4', life: -0.2, kind: 1, big: 1, banner: true });
    } else if (reason === 'overflow') {
      this.flash = 1;
      if (!reduceMotion()) this.shake = 10;
    }
    const wait = reason === 'quit' ? 0 : reason === 'cleared' ? 1500 : 1000;
    this.timers.push(window.setTimeout(() => this.delegate?.didEnd(reason), wait));
  }

  /** Title screen: clear one of the biggest groups every second; deal a new board when stuck. */
  private runDemoStep(): void {
    const move = this.engine.demoMove();
    if (move) {
      this.performClear(move);
      this.demoTimer = 1.1;
    } else {
      this.engine = new GameEngine('puzzle');
      this.populate(true);
      this.demoTimer = 2.2;
    }
  }
}
