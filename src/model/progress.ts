import { addDays, dayKey } from './daily';
import { isAction, type EndReason, type GameMode, type Stats } from './engine';
import { Emitter, readJSON, type KeyValueStore } from './store';

export type Achievement =
  | 'firstClear' | 'bigTwenty' | 'cleanSweep' | 'fiveHundred'
  | 'survivor' | 'speedDemon' | 'dailyHabit' | 'oldSchool';

export const ACHIEVEMENTS: readonly Achievement[] = [
  'firstClear', 'bigTwenty', 'cleanSweep', 'fiveHundred', 'survivor', 'speedDemon', 'dailyHabit', 'oldSchool'
];

export const ACHIEVEMENT_INFO: Record<Achievement, { title: string; detail: string; icon: string }> = {
  firstClear: { title: 'First Pop', detail: 'Clear your first group', icon: 'sparkles' },
  bigTwenty: { title: 'Big Twenty', detail: 'Clear 20 or more tiles at once', icon: 'grid' },
  cleanSweep: { title: 'Clean Sweep', detail: 'Empty an entire board', icon: 'seal' },
  fiveHundred: { title: 'Five Hundred Club', detail: 'Score 500 in one Puzzle or Daily game', icon: 'star' },
  survivor: { title: 'Survivor', detail: 'Last three minutes in Action Mode', icon: 'timer' },
  speedDemon: { title: 'Speed Demon', detail: 'Reach speed level 10 in Action Mode', icon: 'bolt' },
  dailyHabit: { title: 'Daily Habit', detail: 'Play the Daily Puzzle three days running', icon: 'calendar' },
  oldSchool: { title: 'Old School', detail: 'Finish a game on the classic TI-83 screen', icon: 'calc' }
};

/** Lifetime totals for one mode. */
export interface ModeStats {
  played: number;
  best: number;
  totalScore: number;
  tilesCleared: number;
  biggestGroup: number;
  boardsCleared: number;
  longestSurvival: number;
  topSpeed: number;
}

export const emptyModeStats = (): ModeStats => ({
  played: 0, best: 0, totalScore: 0, tilesCleared: 0, biggestGroup: 0, boardsCleared: 0, longestSurvival: 0, topSpeed: 0
});

export const averageScore = (s: ModeStats): number => (s.played === 0 ? 0 : Math.round(s.totalScore / s.played));

export interface Outcome {
  isNewBest: boolean;
  previousBest: number;
  unlocked: Achievement[];
  streak: number;
}

interface Saved {
  modeStats: Partial<Record<GameMode, ModeStats>>;
  dailyBest: Record<string, number>;
  unlocked: Partial<Record<Achievement, string>>; // ISO date
}

const KEY = 'insane.progress.v1';

/** Statistics, Daily Puzzle history and achievements (port of ProgressStore.swift). */
export class ProgressStore extends Emitter {
  private data: Saved;

  constructor(private readonly store: KeyValueStore) {
    super();
    this.data = readJSON<Saved>(store, KEY, { modeStats: {}, dailyBest: {}, unlocked: {} });
    this.data.modeStats ??= {};
    this.data.dailyBest ??= {};
    this.data.unlocked ??= {};
  }

  stats(mode: GameMode): ModeStats {
    return { ...emptyModeStats(), ...this.data.modeStats[mode] };
  }

  isUnlocked(a: Achievement): boolean {
    return this.data.unlocked[a] !== undefined;
  }

  unlockDate(a: Achievement): Date | null {
    const iso = this.data.unlocked[a];
    return iso ? new Date(iso) : null;
  }

  get unlockedCount(): number {
    return ACHIEVEMENTS.filter((a) => this.isUnlocked(a)).length;
  }

  dailyScore(date: Date): number | null {
    return this.data.dailyBest[dayKey(date)] ?? null;
  }

  /** Consecutive days with a Daily Puzzle played: counts today if played, otherwise ends yesterday. */
  streak(asOf: Date = new Date()): number {
    let day = asOf;
    if (this.data.dailyBest[dayKey(day)] === undefined) day = addDays(day, -1);
    let count = 0;
    while (this.data.dailyBest[dayKey(day)] !== undefined) {
      count += 1;
      day = addDays(day, -1);
    }
    return count;
  }

  /** Unlocks an achievement. Returns true only the first time. */
  unlock(a: Achievement, date: Date = new Date()): boolean {
    if (this.isUnlocked(a)) return false;
    this.data.unlocked[a] = date.toISOString();
    this.persist();
    return true;
  }

  /** Records a finished game and returns what changed. */
  record(game: {
    mode: GameMode; reason: EndReason; score: number; stats: Stats;
    speedLevel: number; classic: boolean; date?: Date;
  }): Outcome {
    const date = game.date ?? new Date();
    const s = this.stats(game.mode);
    const previousBest = s.best;
    s.played += 1;
    s.best = Math.max(s.best, game.score);
    s.totalScore += game.score;
    s.tilesCleared += game.stats.tilesCleared;
    s.biggestGroup = Math.max(s.biggestGroup, game.stats.biggestGroup);
    if (game.reason === 'cleared') s.boardsCleared += 1;
    if (isAction(game.mode)) {
      s.longestSurvival = Math.max(s.longestSurvival, game.stats.elapsed);
      s.topSpeed = Math.max(s.topSpeed, game.speedLevel);
    }
    this.data.modeStats[game.mode] = s;
    if (game.mode === 'daily') {
      const key = dayKey(date);
      this.data.dailyBest[key] = Math.max(this.data.dailyBest[key] ?? 0, game.score);
    }
    this.persist();

    const unlocked: Achievement[] = [];
    const check = (a: Achievement, condition: boolean) => {
      if (condition && this.unlock(a, date)) unlocked.push(a);
    };
    const streak = this.streak(date);
    const action = isAction(game.mode);
    check('firstClear', game.stats.moves > 0);
    check('bigTwenty', game.stats.biggestGroup >= 20);
    check('cleanSweep', game.reason === 'cleared');
    check('fiveHundred', !action && game.score >= 500);
    check('survivor', action && game.stats.elapsed >= 180);
    check('speedDemon', action && game.speedLevel >= 10);
    check('dailyHabit', streak >= 3);
    check('oldSchool', game.classic && game.reason !== 'quit');

    return { isNewBest: game.score > previousBest && game.score > 0, previousBest, unlocked, streak };
  }

  reset(): void {
    this.data = { modeStats: {}, dailyBest: {}, unlocked: {} };
    this.persist();
  }

  private persist(): void {
    this.store.set(KEY, JSON.stringify(this.data));
    this.emit();
  }
}
