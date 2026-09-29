import type { GameMode } from './engine';
import { Emitter, readJSON, type KeyValueStore } from './store';

export interface ScoreEntry {
  id: string;
  initials: string;
  score: number;
  date: string; // ISO
}

const KEY = 'insane.scores.v1';
export const MAX_ENTRIES = 5;

/** Top five scores with initials for Puzzle and Action. Daily history lives in ProgressStore. */
export class ScoreStore extends Emitter {
  private puzzle: ScoreEntry[];
  private action: ScoreEntry[];

  constructor(private readonly store: KeyValueStore) {
    super();
    const saved = readJSON<{ puzzle?: ScoreEntry[]; action?: ScoreEntry[] }>(store, KEY, {});
    this.puzzle = saved.puzzle ?? [];
    this.action = saved.action ?? [];
  }

  entries(mode: GameMode): ScoreEntry[] {
    return mode === 'puzzle' ? this.puzzle : mode === 'action' ? this.action : [];
  }

  best(mode: GameMode): number {
    return this.entries(mode)[0]?.score ?? 0;
  }

  qualifies(score: number, mode: GameMode): boolean {
    if (score <= 0 || mode === 'daily') return false;
    const list = this.entries(mode);
    return list.length < MAX_ENTRIES || score > (list[list.length - 1]?.score ?? 0);
  }

  /** Inserts a score and returns the new entry's id (for highlighting). */
  add(initials: string, score: number, mode: GameMode): string {
    const entry: ScoreEntry = { id: crypto.randomUUID(), initials, score, date: new Date().toISOString() };
    if (mode === 'daily') return entry.id;
    const list = [...this.entries(mode), entry].sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
    if (mode === 'puzzle') this.puzzle = list; else this.action = list;
    this.persist();
    return entry.id;
  }

  reset(): void {
    this.puzzle = [];
    this.action = [];
    this.persist();
  }

  private persist(): void {
    this.store.set(KEY, JSON.stringify({ puzzle: this.puzzle, action: this.action }));
    this.emit();
  }
}
