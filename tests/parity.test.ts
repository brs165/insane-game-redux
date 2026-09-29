import { describe, expect, it } from 'vitest';
import { dailyNumber, dailySeed } from '../src/model/daily';
import { GameEngine } from '../src/model/engine';
import { SplitMix64 } from '../src/model/rng';

/**
 * Cross-platform fixtures. The iOS project has the same values in
 * InsaneGameTests/PlatformParityTests.swift. If both suites pass, the web and iOS apps deal
 * identical boards for the same seed, which is what keeps the Daily Puzzle the same everywhere.
 */
export const PARITY = {
  splitMixSeed0: [0xe220a8397b1dcdafn, 0x6e789e6aa1b965f4n, 0x06c45d188009454fn],
  seed42Puzzle: [
    '122152524233', '342131451341', '244544544421', '241312442113',
    '521121543512', '541245255541', '545152314224', '254544313414'
  ],
  daily20260929: {
    seed: 0x8a7bae707c98fcfen,
    number: 272,
    board: [
      '455524513525', '121124323145', '213324353555', '325125313415',
      '353121111551', '551441213413', '324352124354', '244525524121'
    ]
  }
};

const rows = (e: GameEngine) => e.board.grid.map((row) => row.map((t) => (t ? t.kind : 0)).join(''));

describe('iOS parity fixtures', () => {
  it('SplitMix64 matches the reference sequence', () => {
    const r = new SplitMix64(0n);
    expect([r.next(), r.next(), r.next()]).toEqual(PARITY.splitMixSeed0);
  });

  it('seed 42 deals the fixture Puzzle board', () => {
    expect(rows(new GameEngine('puzzle', { seed: 42n }))).toEqual(PARITY.seed42Puzzle);
  });

  it('Daily #272 (29 Sep 2026) matches the fixture', () => {
    const day = new Date(2026, 8, 29, 12);
    expect(dailySeed(day)).toBe(PARITY.daily20260929.seed);
    expect(dailyNumber(day)).toBe(PARITY.daily20260929.number);
    expect(rows(new GameEngine('daily', { seed: dailySeed(day) }))).toEqual(PARITY.daily20260929.board);
  });

  it('bounded draws stay in range and use every value', () => {
    const r = new SplitMix64(123n);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.intInClosedRange(1, 5);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect(seen.size).toBe(5);
  });
});
