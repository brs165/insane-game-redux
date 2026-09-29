import { Board, type Cell, type Tile, COLS, ROWS } from './board';
import { SplitMix64, randomSeed } from './rng';

export type GameMode = 'puzzle' | 'action' | 'daily';
export type EndReason = 'cleared' | 'noMoves' | 'overflow' | 'quit';

export const MODES: readonly GameMode[] = ['puzzle', 'action', 'daily'];

export const MODE_INFO: Record<GameMode, { title: string; short: string; blurb: string; isAction: boolean }> = {
  puzzle: {
    title: 'Puzzle Mode',
    short: 'Puzzle',
    isAction: false,
    blurb: 'One full board. Clear groups of two or more until no moves are left. Clear every tile and your score is quadrupled.'
  },
  action: {
    title: 'Action Mode',
    short: 'Action',
    isAction: true,
    blurb: 'Starts half full. New tiles keep arriving, a little faster every six. Every move hurries the next one. You can’t win, only last.'
  },
  daily: {
    title: 'Daily Puzzle',
    short: 'Daily',
    isAction: false,
    blurb: 'Everyone gets the same board today, with Puzzle rules. A new one arrives at midnight. Play on consecutive days to build a streak.'
  }
};

export const isAction = (mode: GameMode): boolean => MODE_INFO[mode].isAction;

export interface Stats {
  moves: number;
  tilesCleared: number;
  biggestGroup: number;
  tilesSpawned: number;
  elapsed: number; // seconds
}

export interface Clear {
  cells: Cell[];
  tiles: Tile[];
  kind: number;
  points: number;
  size: number;
}

export interface Spawn {
  tile: Tile;
  cell: Cell;
}

export const pointsForGroup = (n: number): number => (n < 2 ? 0 : (n - 1) * (n - 1));

/**
 * All game rules; a line-for-line port of GameEngine.swift. No DOM or canvas here: the scene asks
 * the engine what happened and animates it.
 */
export class GameEngine {
  // Action Mode timing, translated from the original counter logic. See GameEngine.swift.
  static readonly unitsPerSecond = 31.25;
  static readonly startDelay = 75;
  static readonly minimumDelay = 2;
  static readonly spawnsPerSpeedUp = 6;
  static readonly unitsPerTouch = 10;
  static readonly unitsPerClear = 5;

  readonly mode: GameMode;
  readonly board = new Board();
  score = 0;
  clearBonus = 0;
  stats: Stats = { moves: 0, tilesCleared: 0, biggestGroup: 0, tilesSpawned: 0, elapsed: 0 };
  units = 0;
  delay = GameEngine.startDelay;
  spawnCount = 0;
  nextKind = 1;
  endReason: EndReason | null = null;

  private readonly rng: SplitMix64;
  private nextID = 0;

  /**
   * New game. With `kinds` (rows top to bottom, 0 = empty) the board is set explicitly (tests);
   * otherwise Puzzle/Daily fill all 96 cells and Action fills the bottom half.
   * The draw order matches the Swift engine exactly, which keeps Daily boards identical.
   */
  constructor(mode: GameMode, options: { seed?: bigint; kinds?: number[][] } = {}) {
    this.mode = mode;
    this.rng = new SplitMix64(options.seed ?? (options.kinds ? 1n : randomSeed()));
    this.nextKind = this.randomKind();
    if (options.kinds) {
      options.kinds.forEach((row, r) => {
        if (r >= ROWS) return;
        row.forEach((k, c) => {
          if (c < COLS && k >= 1 && k <= 5) this.board.set({ col: c, row: r }, this.makeTile(k));
        });
      });
    } else {
      const firstRow = isAction(mode) ? ROWS / 2 : 0;
      for (let r = firstRow; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) this.board.set({ col: c, row: r }, this.makeTile(this.randomKind()));
      }
    }
  }

  get isOver(): boolean { return this.endReason !== null; }
  get tileCount(): number { return this.board.tileCount; }
  get groupCount(): number { return this.board.allGroups().length; }
  /** 1 at the start, rising as tiles arrive faster. */
  get speedLevel(): number { return GameEngine.startDelay - this.delay + 1; }
  get spawnProgress(): number { return Math.min(1, Math.max(0, this.units / this.delay)); }
  get secondsToNextSpawn(): number { return Math.max(0, (this.delay - this.units) / GameEngine.unitsPerSecond); }

  /** Clears the group at `cell` if it has two or more tiles. Returns null when nothing happens. */
  clear(cell: Cell): Clear | null {
    const first = this.board.get(cell);
    if (this.isOver || !first) return null;
    const cells = this.board.group(cell);
    if (cells.length < 2) return null;

    const tiles: Tile[] = [];
    for (const c of cells) {
      const t = this.board.get(c);
      if (t) tiles.push(t);
      this.board.set(c, null);
    }
    this.board.applyGravity();

    const points = pointsForGroup(cells.length);
    this.score += points;
    this.stats.moves += 1;
    this.stats.tilesCleared += cells.length;
    this.stats.biggestGroup = Math.max(this.stats.biggestGroup, cells.length);
    this.registerTouch(GameEngine.unitsPerClear);

    if (!isAction(this.mode)) {
      if (this.board.isEmpty) {
        this.clearBonus = this.score * 3;
        this.score *= 4;
        this.endReason = 'cleared';
      } else if (!this.board.hasMoves) {
        this.endReason = 'noMoves';
      }
    }
    return { cells, tiles, kind: first.kind, points, size: cells.length };
  }

  /** Any touch hastens the next Action Mode tile, like a key press on the calculator. */
  registerTouch(extra: number = GameEngine.unitsPerTouch): void {
    if (!isAction(this.mode) || this.isOver) return;
    this.units += extra;
  }

  quit(): void {
    if (!this.endReason) this.endReason = 'quit';
  }

  /** Advances the clock. In Action Mode this may drop new tiles or overflow the board. */
  advance(dt: number): Spawn[] {
    if (this.isOver || dt <= 0) return [];
    this.stats.elapsed += dt;
    if (!isAction(this.mode)) return [];

    this.units += dt * GameEngine.unitsPerSecond;
    const spawned: Spawn[] = [];
    let steps = 0;
    while (this.units >= this.delay && !this.isOver && steps < 3) {
      this.units -= this.delay;
      steps += 1;
      const s = this.spawnTile();
      if (s) spawned.push(s);
    }
    if (steps === 3) this.units = Math.min(this.units, this.delay * 0.5);
    return spawned;
  }

  /** Title-screen demo: one of the three largest groups, chosen at random. */
  demoMove(): Cell | null {
    const groups = this.board.allGroups().sort((a, b) => b.length - a.length);
    if (!groups.length) return null;
    return groups[this.rng.intInRange(0, Math.min(3, groups.length))][0];
  }

  private spawnTile(): Spawn | null {
    const slot = this.board.spawnSlot();
    if (!slot) {
      this.endReason = 'overflow';
      return null;
    }
    const tile = this.makeTile(this.nextKind);
    this.board.set(slot, tile);
    this.nextKind = this.randomKind();
    this.spawnCount += 1;
    this.stats.tilesSpawned += 1;
    if (this.spawnCount % GameEngine.spawnsPerSpeedUp === 0 && this.delay > GameEngine.minimumDelay) this.delay -= 1;
    return { tile, cell: slot };
  }

  private randomKind(): number {
    return this.rng.intInClosedRange(1, 5);
  }

  private makeTile(kind: number): Tile {
    this.nextID += 1;
    return { id: this.nextID, kind };
  }
}
