/** Minimal key/value storage so the stores run on localStorage in the app and in memory in tests. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** localStorage, falling back to memory if it is blocked (private mode, disabled storage). */
export function browserStore(): KeyValueStore {
  const memory = memoryStore();
  return {
    get(key) {
      try { return globalThis.localStorage?.getItem(key) ?? memory.get(key); } catch { return memory.get(key); }
    },
    set(key, value) {
      memory.set(key, value);
      try { globalThis.localStorage?.setItem(key, value); } catch { /* memory copy still works this session */ }
    }
  };
}

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => { map.set(k, v); } };
}

export function readJSON<T>(store: KeyValueStore, key: string, fallback: T): T {
  const raw = store.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** Tiny change notifier, so UI can re-render when a store changes. */
export class Emitter {
  private listeners = new Set<() => void>();
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  protected emit(): void {
    for (const fn of this.listeners) fn();
  }
}
