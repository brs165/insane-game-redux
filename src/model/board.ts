/** A position on the board. Row 0 is the top row, column 0 the left column. */
export interface Cell {
  readonly col: number;
  readonly row: number;
}

/** One tile. `kind` is 1–5 (triangle, cross, square, circle, diamond) as in INSANE.z80. */
export interface Tile {
  readonly id: number;
  readonly kind: number;
}

export const COLS = 12;
export const ROWS = 8;
export const CAPACITY = COLS * ROWS;

export const cellKey = (c: Cell): number => c.row * COLS + c.col;
export const sameCell = (a: Cell, b: Cell): boolean => a.col === b.col && a.row === b.row;

/**
 * The 12 × 8 playfield and the rules that act on it: flood-fill groups, gravity and the
 * Action Mode insertion order. No UI code, so it is fully unit-testable.
 */
export class Board {
  /** grid[row][col] */
  readonly grid: (Tile | null)[][];

  constructor(grid?: (Tile | null)[][]) {
    this.grid = grid ?? Array.from({ length: ROWS }, () => Array<Tile | null>(COLS).fill(null));
  }

  static isInside(c: Cell): boolean {
    return c.col >= 0 && c.col < COLS && c.row >= 0 && c.row < ROWS;
  }

  get(c: Cell): Tile | null {
    return Board.isInside(c) ? this.grid[c.row][c.col] : null;
  }

  set(c: Cell, tile: Tile | null): void {
    if (Board.isInside(c)) this.grid[c.row][c.col] = tile;
  }

  get tileCount(): number {
    let n = 0;
    for (const row of this.grid) for (const t of row) if (t) n++;
    return n;
  }

  get isEmpty(): boolean {
    return this.tileCount === 0;
  }

  forEachTile(fn: (tile: Tile, cell: Cell) => void): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = this.grid[r][c];
        if (t) fn(t, { col: c, row: r });
      }
    }
  }

  /** Every cell orthogonally connected to `start` holding the same kind (including `start`). */
  group(start: Cell): Cell[] {
    const first = this.get(start);
    if (!first) return [];
    const seen = new Set<number>([cellKey(start)]);
    const stack: Cell[] = [start];
    const out: Cell[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      out.push(cur);
      const neighbours: Cell[] = [
        { col: cur.col + 1, row: cur.row }, { col: cur.col - 1, row: cur.row },
        { col: cur.col, row: cur.row + 1 }, { col: cur.col, row: cur.row - 1 }
      ];
      for (const n of neighbours) {
        const k = cellKey(n);
        if (!Board.isInside(n) || seen.has(k)) continue;
        const t = this.get(n);
        if (t && t.kind === first.kind) {
          seen.add(k);
          stack.push(n);
        }
      }
    }
    return out;
  }

  /** Every group that can be cleared (two or more tiles). */
  allGroups(minimumSize = 2): Cell[][] {
    const seen = new Set<number>();
    const out: Cell[][] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = { col: c, row: r };
        if (!this.grid[r][c] || seen.has(cellKey(cell))) continue;
        const g = this.group(cell);
        for (const x of g) seen.add(cellKey(x));
        if (g.length >= minimumSize) out.push(g);
      }
    }
    return out;
  }

  /** True when at least one pair of matching tiles touches (GameOverScan in the original). */
  get hasMoves(): boolean {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = this.grid[r][c];
        if (!t) continue;
        const right = c + 1 < COLS ? this.grid[r][c + 1] : null;
        const below = r + 1 < ROWS ? this.grid[r + 1][c] : null;
        if ((right && right.kind === t.kind) || (below && below.kind === t.kind)) return true;
      }
    }
    return false;
  }

  /** Tiles fall straight down, then empty columns are removed and the rest shift left. */
  applyGravity(): void {
    const columns: Tile[][] = [];
    for (let c = 0; c < COLS; c++) {
      const col: Tile[] = [];
      for (let r = ROWS - 1; r >= 0; r--) {
        const t = this.grid[r][c];
        if (t) col.push(t); // bottom first
      }
      if (col.length) columns.push(col);
    }
    for (let r = 0; r < ROWS; r++) this.grid[r].fill(null);
    columns.forEach((col, c) => col.forEach((t, i) => { this.grid[ROWS - 1 - i][c] = t; }));
  }

  /** Action Mode insertion point: first empty cell scanning the bottom row left→right, then upward. */
  spawnSlot(): Cell | null {
    for (let r = ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) if (!this.grid[r][c]) return { col: c, row: r };
    }
    return null;
  }
}
