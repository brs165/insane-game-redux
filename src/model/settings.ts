import type { GameMode } from './engine';
import { Emitter, type KeyValueStore } from './store';

interface Values {
  soundOn: boolean;
  hapticsOn: boolean;
  classicScreen: boolean;
  tapTwiceToClear: boolean;
  lastMode: GameMode;
  lastInitials: string;
  hasSeenTutorial: boolean;
}

const DEFAULTS: Values = {
  soundOn: true,
  hapticsOn: true,
  classicScreen: false,
  tapTwiceToClear: true,
  lastMode: 'puzzle',
  lastInitials: 'AAA',
  hasSeenTutorial: false
};

const KEY = 'insane.settings.v1';

/** Player preferences, saved on every change. */
export class Settings extends Emitter {
  private values: Values;

  constructor(private readonly store: KeyValueStore) {
    super();
    let saved: Partial<Values> = {};
    try { saved = JSON.parse(store.get(KEY) ?? '{}'); } catch { /* defaults */ }
    this.values = { ...DEFAULTS, ...saved };
    if (!['puzzle', 'action', 'daily'].includes(this.values.lastMode)) this.values.lastMode = 'puzzle';
  }

  get<K extends keyof Values>(key: K): Values[K] {
    return this.values[key];
  }

  set<K extends keyof Values>(key: K, value: Values[K]): void {
    if (this.values[key] === value) return;
    this.values[key] = value;
    this.store.set(KEY, JSON.stringify(this.values));
    this.emit();
  }

  toggle(key: 'soundOn' | 'hapticsOn' | 'classicScreen' | 'tapTwiceToClear'): void {
    this.set(key, !this.values[key]);
  }
}
