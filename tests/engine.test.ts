import { describe, expect, it } from 'vitest';
import { Board, CAPACITY, COLS, ROWS } from '../src/model/board';
import { dailyNumber, dailySeed } from '../src/model/daily';
import { GameEngine, pointsForGroup } from '../src/model/engine';

/** Places a small picture (digits, bottom-aligned, left-aligned) on the 12 × 8 board. "." = empty. */
function kinds(lines: string[]): number[][] {
  const rows = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));
  const offset = ROWS - lines.length;
  lines.forEach((line, i) => [...line].forEach((ch, c) => { rows[offset + i][c] = Number(ch) || 0; }));
  return rows;
}

/** Renders the bottom `height` rows back into the same picture format (trailing blanks trimmed). */
function picture(e: GameEngine, height: number): string[] {
  const out: string[] = [];
  for (let r = ROWS - height; r < ROWS; r++) {
    let s = '';
    for (let c = 0; c < COLS; c++) s += e.board.get({ col: c, row: r })?.kind ?? '.';
    out.push(s.replace(/\.+$/, ''));
  }
  return out;
}

const firstDelaySeconds = GameEngine.startDelay / GameEngine.unitsPerSecond;

describe('rules (ported from GameEngineTests.swift)', () => {
  it('scores the square of tiles minus one', () => {
    expect([1, 2, 3, 5, 11].map(pointsForGroup)).toEqual([0, 1, 4, 16, 100]);
  });

  it('finds the readme example groups', () => {
    const e = new GameEngine('puzzle', { kinds: kinds(['12325', '25555', '12331']) });
    expect(e.board.allGroups().map((g) => g.length).sort()).toEqual([2, 5]);
  });

  it('replays the readme walkthrough with gravity and a perfect clear', () => {
    const e = new GameEngine('puzzle', { kinds: kinds(['12325', '25555', '12331']) });

    const fives = e.clear({ col: 4, row: 6 })!;
    expect(fives.size).toBe(5);
    expect(fives.points).toBe(16);
    expect(picture(e, 3)).toEqual(['1', '2232', '12331']);

    const threes = e.clear({ col: 2, row: 7 })!;
    expect(threes.size).toBe(3);
    expect(picture(e, 3)).toEqual(['1', '22', '1221']);

    expect(e.clear({ col: 0, row: 6 })?.size).toBe(4);
    expect(e.isOver).toBe(false);
    expect(e.clear({ col: 0, row: 7 })?.size).toBe(3);

    expect(e.endReason).toBe('cleared');
    expect(e.score).toBe((16 + 4 + 9 + 4) * 4);
    expect(e.clearBonus).toBe((16 + 4 + 9 + 4) * 3);
  });

  it('will not clear a single tile', () => {
    const e = new GameEngine('puzzle', { kinds: kinds(['12', '21']) });
    expect(e.clear({ col: 0, row: 7 })).toBeNull();
    expect(e.score).toBe(0);
    expect(e.tileCount).toBe(4);
  });

  it('ends Puzzle when no moves remain', () => {
    const e = new GameEngine('puzzle', { kinds: kinds(['123', '114']) });
    expect(e.clear({ col: 0, row: 7 })).not.toBeNull();
    expect(e.endReason).toBe('noMoves');
    expect(e.clear({ col: 0, row: 7 })).toBeNull();
  });

  it('fills the right rows for each mode', () => {
    expect(new GameEngine('puzzle', { seed: 42n }).tileCount).toBe(96);
    const action = new GameEngine('action', { seed: 42n });
    expect(action.tileCount).toBe(48);
    for (let c = 0; c < COLS; c++) {
      expect(action.board.get({ col: c, row: 3 })).toBeNull();
      expect(action.board.get({ col: c, row: 4 })).not.toBeNull();
    }
  });

  it('spawns Action tiles bottom row first, left to right', () => {
    const e = new GameEngine('action', { kinds: kinds(['123']) });
    expect(e.advance(firstDelaySeconds + 0.001)[0]?.cell).toEqual({ col: 3, row: 7 });
    expect(e.advance(firstDelaySeconds)[0]?.cell).toEqual({ col: 4, row: 7 });
  });

  it('speeds Action up every six tiles', () => {
    const e = new GameEngine('action', { kinds: kinds(['1']) });
    expect(e.speedLevel).toBe(1);
    for (let i = 0; i < 6; i++) e.advance(e.delay / GameEngine.unitsPerSecond + 0.0001);
    expect(e.spawnCount).toBe(6);
    expect(e.delay).toBe(GameEngine.startDelay - 1);
    expect(e.speedLevel).toBe(2);
  });

  it('hastens the next tile on every touch', () => {
    const e = new GameEngine('action', { kinds: kinds(['1']) });
    const before = e.secondsToNextSpawn;
    e.registerTouch();
    expect(before - e.secondsToNextSpawn).toBeCloseTo(GameEngine.unitsPerTouch / GameEngine.unitsPerSecond, 9);
  });

  it('ends Action on overflow', () => {
    const e = new GameEngine('action', { kinds: kinds(Array(ROWS).fill('12'.repeat(6))) });
    expect(e.board.spawnSlot()).toBeNull();
    e.advance(10);
    expect(e.endReason).toBe('overflow');
  });

  it('gives everyone the same Daily board for the same day', () => {
    const morning = new Date(2026, 8, 21, 10, 13);
    const seedA = dailySeed(morning);
    expect(dailySeed(new Date(2026, 8, 21, 10, 14))).toBe(seedA);
    const a = new GameEngine('daily', { seed: seedA });
    const b = new GameEngine('daily', { seed: seedA });
    expect(a.tileCount).toBe(CAPACITY);
    expect(a.board.grid.map((r) => r.map((t) => t?.kind))).toEqual(b.board.grid.map((r) => r.map((t) => t?.kind)));
    const tomorrow = new Date(2026, 8, 22, 10, 13);
    expect(dailySeed(tomorrow)).not.toBe(seedA);
    expect(dailyNumber(tomorrow)).toBe(dailyNumber(morning) + 1);
    expect(dailyNumber(new Date(2026, 0, 1, 23, 0))).toBe(1);
  });

  it('uses Puzzle rules for Daily', () => {
    const e = new GameEngine('daily', { kinds: kinds(['11']) });
    expect(e.advance(60)).toEqual([]);
    e.clear({ col: 0, row: 7 });
    expect(e.endReason).toBe('cleared');
    expect(e.score).toBe(4);
  });

  it('never spawns in Puzzle', () => {
    const e = new GameEngine('puzzle', { kinds: kinds(['12']) });
    expect(e.advance(60)).toEqual([]);
    expect(e.tileCount).toBe(2);
  });

  it('keeps Board helpers consistent', () => {
    const b = new Board();
    expect(b.spawnSlot()).toEqual({ col: 0, row: 7 });
    expect(b.hasMoves).toBe(false);
  });
});
