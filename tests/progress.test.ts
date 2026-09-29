import { describe, expect, it } from 'vitest';
import { addDays } from '../src/model/daily';
import type { Stats } from '../src/model/engine';
import { ProgressStore, averageScore } from '../src/model/progress';
import { ScoreStore } from '../src/model/scores';
import { memoryStore } from '../src/model/store';

const base = new Date(2026, 8, 21, 10, 0);
const stats = (s: Partial<Stats> = {}): Stats => ({ moves: 0, tilesCleared: 0, biggestGroup: 0, tilesSpawned: 0, elapsed: 0, ...s });
const playDaily = (store: ProgressStore, date: Date, score: number) =>
  store.record({ mode: 'daily', reason: 'noMoves', score, stats: stats({ moves: 3, tilesCleared: 10, biggestGroup: 5 }), speedLevel: 1, classic: false, date });

describe('progress (ported from ProgressStoreTests.swift)', () => {
  it('counts a streak and unlocks Daily Habit', () => {
    const store = new ProgressStore(memoryStore());
    playDaily(store, base, 120);
    playDaily(store, addDays(base, 1), 80);
    const third = playDaily(store, addDays(base, 2), 200);
    expect(third.streak).toBe(3);
    expect(third.unlocked).toContain('dailyHabit');
    expect(store.streak(addDays(base, 3))).toBe(3);
    expect(store.streak(addDays(base, 4))).toBe(0);
  });

  it('keeps the best Daily score per day', () => {
    const store = new ProgressStore(memoryStore());
    playDaily(store, base, 90);
    playDaily(store, base, 40);
    expect(store.dailyScore(base)).toBe(90);
    expect(store.stats('daily').played).toBe(2);
    expect(averageScore(store.stats('daily'))).toBe(65);
  });

  it('reports a new best and unlocks achievements once', () => {
    const store = new ProgressStore(memoryStore());
    const s = stats({ moves: 12, biggestGroup: 21 });
    const first = store.record({ mode: 'puzzle', reason: 'cleared', score: 640, stats: s, speedLevel: 1, classic: true });
    expect(first.isNewBest).toBe(true);
    expect(new Set(first.unlocked)).toEqual(new Set(['firstClear', 'bigTwenty', 'cleanSweep', 'fiveHundred', 'oldSchool']));
    const second = store.record({ mode: 'puzzle', reason: 'cleared', score: 100, stats: s, speedLevel: 1, classic: true });
    expect(second.isNewBest).toBe(false);
    expect(second.previousBest).toBe(640);
    expect(second.unlocked).toEqual([]);
  });

  it('unlocks the Action achievements', () => {
    const store = new ProgressStore(memoryStore());
    const outcome = store.record({ mode: 'action', reason: 'overflow', score: 50, stats: stats({ elapsed: 200 }), speedLevel: 11, classic: false });
    expect(outcome.unlocked).toEqual(expect.arrayContaining(['survivor', 'speedDemon']));
    expect(store.stats('action').topSpeed).toBe(11);
  });

  it('persists across reloads', () => {
    const kv = memoryStore();
    new ProgressStore(kv).unlock('firstClear');
    expect(new ProgressStore(kv).isUnlocked('firstClear')).toBe(true);
  });
});

describe('scores', () => {
  it('keeps the top five, highest first', () => {
    const scores = new ScoreStore(memoryStore());
    [10, 50, 30, 70, 20, 60].forEach((s) => scores.add('ABC', s, 'puzzle'));
    expect(scores.entries('puzzle').map((e) => e.score)).toEqual([70, 60, 50, 30, 20]);
    expect(scores.qualifies(15, 'puzzle')).toBe(false);
    expect(scores.qualifies(25, 'puzzle')).toBe(true);
    expect(scores.qualifies(999, 'daily')).toBe(false);
  });
});
