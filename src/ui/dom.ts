import { dailyNumber, dayKey, lastSevenDays } from '../model/daily';
import type { GameMode } from '../model/engine';
import { ACHIEVEMENT_INFO, type Achievement, type ProgressStore } from '../model/progress';
import type { ScoreEntry } from '../model/scores';
import { icons, type IconName } from './icons';

export const VERSION = '2.0.0';

/** Creates one element from an HTML string. All interpolated user text must go through `esc`. */
export function h<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function qs<T extends Element = HTMLElement>(root: ParentNode, sel: string): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

export const fmt = (n: number): string => n.toLocaleString();
export const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export const MODE_COLOR: Record<GameMode, string> = { puzzle: '#FFB547', action: '#FF5D73', daily: '#3DDC97' };
export const MODE_ICON: Record<GameMode, IconName> = { puzzle: 'triangle', action: 'bolt', daily: 'calendar' };

/** Sets the accent colour for a mode across the whole UI. */
export function setAccent(mode: GameMode): void {
  document.documentElement.dataset.mode = mode;
}

const WORD: [string, string][] = [['I', '#FFB547'], ['N', '#FF5D73'], ['S', '#3DDC97'], ['A', '#9B7BFF'], ['N', '#43B8F5'], ['E', '#FFB547']];
const DARK: Record<string, string> = { '#FFB547': '#9a5f10', '#FF5D73': '#9b1f36', '#3DDC97': '#157a50', '#9B7BFF': '#4d33a6', '#43B8F5': '#1a6696' };

export function wordmarkHTML(): string {
  return `<span class="wordmark" aria-label="Insane">${WORD.map(([ch, c]) => `<span style="color:${c}" aria-hidden="true">${ch}</span>`).join('')}</span>`;
}

export function logoHTML(): string {
  return `<h1 class="logo" aria-label="Insane Game"><span class="row" aria-hidden="true">${WORD.map(([ch, c], i) =>
    `<span class="ch" style="--c:${c};--d:${DARK[c]};--i:${i}">${ch}</span>`).join('')}</span><span class="game" aria-hidden="true">GAME</span></h1>`;
}

export function badgeHTML(a: Achievement | null, size = 40, locked = false): string {
  const icon = locked || !a ? icons.lock : icons[ACHIEVEMENT_INFO[a].icon as IconName];
  return `<span class="badge${locked ? ' locked' : ''}" style="width:${size}px;height:${size}px">${icon}</span>`;
}

export function achievementHTML(a: Achievement, unlocked: boolean): string {
  const info = ACHIEVEMENT_INFO[a];
  return `<div class="ach${unlocked ? '' : ' locked'}" role="group" aria-label="${esc(info.title)}, ${unlocked ? 'unlocked' : 'locked'}">
    ${badgeHTML(a, 40, !unlocked)}<div><b>${esc(info.title)}</b><span>${esc(info.detail)}</span></div></div>`;
}

export function leaderboardHTML(entries: ScoreEntry[], highlight: string | null = null): string {
  if (!entries.length) return '<ol class="lb"><li class="empty-row"><span class="empty">No scores yet. Yours could be first.</span></li></ol>';
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return `<ol class="lb">${entries.map((e, i) => `<li class="${e.id === highlight ? 'me' : ''}">
    <span class="r">${i + 1}</span><span class="who">${esc(e.initials)}</span><span class="d">${date(e.date)}</span><span class="s">${fmt(e.score)}</span></li>`).join('')}</ol>`;
}

export function weekHTML(progress: ProgressStore, today = new Date()): string {
  const todayKey = dayKey(today);
  return `<div class="week">${lastSevenDays(today).map((d) => {
    const score = progress.dailyScore(d);
    const cls = ['day', score !== null ? 'played' : '', dayKey(d) === todayKey ? 'today' : ''].join(' ');
    const w = d.toLocaleDateString(undefined, { weekday: 'short' });
    return `<div class="${cls}" aria-label="${esc(w)} Daily #${dailyNumber(d)}: ${score ?? 'not played'}"><span class="w">${esc(w)}</span><span class="v">${score ?? '–'}</span></div>`;
  }).join('')}</div>`;
}

/** A switch styled like iOS, with proper ARIA state. */
export function switchHTML(id: string, on: boolean, label: string): string {
  return `<button class="switch" role="switch" id="${id}" aria-checked="${on}" aria-label="${esc(label)}"></button>`;
}
