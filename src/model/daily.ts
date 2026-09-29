import { SplitMix64 } from './rng';

/**
 * The Daily Puzzle: one board per local calendar day, identical on every device and on iOS,
 * because it is generated from a seed derived from the date (same formula as DailyPuzzle.swift).
 */

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** Days since the Unix epoch for the local calendar date (DST-safe). */
const dayIndex = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

/** "2026-09-29", used as the storage key for a day's best score. */
export function dayKey(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/** Board seed for the day. */
export function dailySeed(date: Date): bigint {
  const ymd = date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
  return new SplitMix64(BigInt(ymd) ^ 0x1a5a2e000c0ffee5n).next();
}

/** Running puzzle number shown to players ("Daily #272"). Puzzle #1 is 1 January 2026. */
export function dailyNumber(date: Date): number {
  return Math.max(1, dayIndex(date) - dayIndex(new Date(2026, 0, 1)) + 1);
}

/** `date` shifted by whole calendar days, keeping local midnight semantics. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

/** The seven days ending on `date`, oldest first. */
export function lastSevenDays(date: Date): Date[] {
  return [6, 5, 4, 3, 2, 1, 0].map((back) => addDays(date, -back));
}
