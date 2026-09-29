/**
 * Vibration feedback matched to the sound effects. Uses the Vibration API, which Android browsers
 * support; Safari on iPhone does not, so these calls are silently ignored there.
 */
let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export const hapticsSupported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

function buzz(pattern: number | number[]): void {
  if (!enabled || !hapticsSupported) return;
  try { navigator.vibrate(pattern); } catch { /* ignored */ }
}

export const haptics = {
  clear(n: number): void { buzz(n >= 10 ? 28 : n >= 5 ? 18 : 10); },
  invalid(): void { buzz([8, 40, 8]); },
  select(): void { buzz(6); },
  won(): void { buzz([12, 60, 12, 60, 30]); },
  lost(): void { buzz([40, 80, 60]); }
};
