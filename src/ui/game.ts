import type { App } from '../app';
import { haptics } from '../audio/haptics';
import { sfx } from '../audio/sound';
import { CAPACITY } from '../model/board';
import { MODE_INFO, isAction, type GameMode } from '../model/engine';
import { GameSession, shareText, type GameResult } from '../session';
import { achievementHTML, esc, fmt, h, leaderboardHTML, mmss, qs, setAccent, weekHTML, wordmarkHTML } from './dom';
import { icons } from './icons';

const HELP = {
  action: 'Tap a group to clear it. Every touch hurries the next tile, so hold still while you think.',
  tapTwice: 'Tap a group to see its points, then tap it again to clear it.',
  oneTap: 'Tap a group of two or more to clear it. Press and hold to preview its points.',
  mouse: 'Hover a group to see its points, then click to clear it. Arrows and Space work too. P pauses.'
};

/** The play screen: HUD, board, pause and game-over overlays. */
export class GameScreen {
  readonly el: HTMLElement;
  readonly session: GameSession;
  private readonly wrap: HTMLElement;
  private readonly ro: ResizeObserver;
  private overlay: HTMLElement | null = null;
  private inputMode: 'mouse' | 'touch' | 'key' = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
  private shown = new Map<string, string>();

  // Game-over initials entry
  private letters: string[] = [];
  private slot = 0;
  private savedId: string | null = null;
  private qualifies = false;

  constructor(private readonly app: App, readonly mode: GameMode) {
    const tools = (cls: string) => `<div class="${cls}">
      <button class="icon-btn" data-act="pause" aria-label="Pause" title="Pause (P)">${icons.pause}</button>
      <button class="icon-btn" data-act="sound" title="Sound (M)"></button>
      <button class="icon-btn" data-act="classic" aria-label="Classic TI-83 screen" title="Classic screen (L)">${icons.calc}</button>
    </div>`;
    const pill = mode === 'daily' ? '' : MODE_INFO[mode].short;
    this.el = h(`
      <div class="screen game" data-mode="${mode}">
        <div class="hud">
          <div class="hud-top">
            <div class="brand">${wordmarkHTML()}<span class="pill">${esc(pill)}</span></div>
            ${tools('tools')}
          </div>
          <div class="stats">
            <div class="stat score"><span class="label">Score</span><span class="val" data-v="score">0</span></div>
            <div class="stat"><span class="label">${mode === 'daily' ? 'Today' : 'Best'}</span><span class="val" data-v="best">0</span></div>
            <div class="stat"><span class="label">${isAction(mode) ? 'Speed' : 'Tiles left'}</span><span class="val" data-v="s3">0</span></div>
            <div class="stat"><span class="label">${isAction(mode) ? 'Next tile' : 'Groups'}</span><span class="val" data-v="s4">0</span></div>
          </div>
          <div class="meter meter-side" ${isAction(mode) ? '' : 'hidden'}><i></i></div>
          <p class="help help-side"></p>
          ${tools('tools tools-side')}
        </div>
        <div class="meter-row" ${isAction(mode) ? '' : 'hidden'}><div class="meter"><i></i></div></div>
        <div class="board-wrap"><canvas role="img" aria-label="Game board"></canvas></div>
        <p class="help"></p>
      </div>`);

    const canvas = qs<HTMLCanvasElement>(this.el, 'canvas');
    this.wrap = qs(this.el, '.board-wrap');
    this.session = new GameSession(mode, canvas, app.progress, {
      classic: app.settings.get('classicScreen'),
      tapTwice: app.settings.get('tapTwiceToClear')
    });
    if (this.session.dailyNumber !== null) qs(this.el, '.pill').textContent = `Daily #${this.session.dailyNumber}`;
    this.session.onChange = () => this.updateHud();
    this.session.onAchievement = (a) => app.toastAchievement(a);
    this.session.onResult = (r) => this.showOver(r);
    this.session.scene.onInputModeChange = (m) => { this.inputMode = m; this.updateHelp(); };

    this.el.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => {
      b.blur();
      const act = b.dataset.act;
      if (act === 'pause') this.pause();
      else if (act === 'sound') app.settings.toggle('soundOn');
      else if (act === 'classic') app.settings.toggle('classicScreen');
    }));

    this.ro = new ResizeObserver(() => {
      const r = this.wrap.getBoundingClientRect();
      this.session.scene.layout(r.width, r.height);
    });
  }

  get isEnteringInitials(): boolean {
    return this.qualifies && this.savedId === null && this.session.result !== null;
  }

  mounted(): void {
    setAccent(this.mode);
    this.ro.observe(this.wrap);
    this.session.scene.start();
    this.onSettingsChanged();
    this.updateHud();
  }

  destroy(): void {
    this.saveIfNeeded();
    this.ro.disconnect();
    this.session.destroy();
  }

  onSettingsChanged(): void {
    const s = this.app.settings;
    this.session.scene.classic = s.get('classicScreen');
    this.session.scene.tapTwice = s.get('tapTwiceToClear');
    this.el.querySelectorAll<HTMLButtonElement>('[data-act="sound"]').forEach((b) => {
      const on = s.get('soundOn');
      b.innerHTML = on ? icons.soundOn : icons.soundOff;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on');
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-act="classic"]').forEach((b) => b.setAttribute('aria-pressed', String(s.get('classicScreen'))));
    this.updateHelp();
    if (this.overlay?.classList.contains('veil')) this.showPause();
  }

  onDataChanged(): void {
    this.updateHud();
  }

  pause(): void {
    if (this.session.result || this.session.scene.isEnding) return;
    this.session.pause();
    this.showPause();
  }

  // MARK: - HUD

  private setText(key: string, value: string): void {
    if (this.shown.get(key) === value) return;
    this.shown.set(key, value);
    const el = this.el.querySelector(`[data-v="${key}"]`);
    if (el) el.textContent = value;
  }

  private updateHud(): void {
    const e = this.session.engine;
    this.setText('score', fmt(e.score));
    this.setText('best', fmt(this.app.best(this.mode, this.session.startedAt)));
    if (isAction(this.mode)) {
      this.setText('s3', `L${e.speedLevel}`);
      this.setText('s4', `${e.secondsToNextSpawn.toFixed(1)}s`);
      const w = `${(e.spawnProgress * 100).toFixed(1)}%`;
      this.el.querySelectorAll<HTMLElement>('.meter i').forEach((i) => { i.style.width = w; });
    } else {
      this.setText('s3', fmt(e.tileCount));
      this.setText('s4', fmt(e.groupCount));
    }
    const label = isAction(this.mode)
      ? `Score ${e.score}. Speed level ${e.speedLevel}.`
      : `Score ${e.score}. ${e.tileCount} tiles left, ${e.groupCount} groups available.`;
    this.el.querySelector('canvas')?.setAttribute('aria-label', `Game board. ${label}`);
  }

  private updateHelp(): void {
    const text = isAction(this.mode) ? HELP.action
      : this.inputMode === 'touch' ? (this.app.settings.get('tapTwiceToClear') ? HELP.tapTwice : HELP.oneTap)
      : HELP.mouse;
    this.el.querySelectorAll('.help').forEach((p) => { p.textContent = text; });
  }

  // MARK: - Overlays

  private setOverlay(el: HTMLElement | null): void {
    this.overlay?.remove();
    this.overlay = el;
    if (el) {
      this.el.append(el);
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    }
  }

  private showPause(): void {
    const s = this.app.settings;
    const title = this.session.dailyNumber !== null ? `Daily Puzzle #${this.session.dailyNumber}` : MODE_INFO[this.mode].title;
    const o = h(`
      <div class="overlay veil" role="dialog" aria-modal="true" aria-label="Paused">
        <div class="card">
          <p class="eyebrow">${esc(title)}</p>
          <h2>Paused</h2>
          <p class="sub">The board stays hidden while paused. Score so far: <b>${fmt(this.session.engine.score)}</b></p>
          <div class="quick">
            <button class="icon-btn" data-q="sound" aria-pressed="${s.get('soundOn')}" aria-label="Sound">${s.get('soundOn') ? icons.soundOn : icons.soundOff}</button>
            <button class="icon-btn" data-q="haptics" aria-pressed="${s.get('hapticsOn')}" aria-label="Vibration">${icons.vibrate}</button>
            <button class="icon-btn" data-q="classic" aria-pressed="${s.get('classicScreen')}" aria-label="Classic TI-83 screen">${icons.calc}</button>
          </div>
          <button class="btn-primary" data-autofocus data-p="resume" style="margin-top:18px">Resume</button>
          <div class="row-btns" style="margin-top:10px">
            <button class="btn-secondary" data-p="restart">${icons.restart} Restart</button>
            <button class="btn-secondary" data-p="end">${icons.flag} End game</button>
          </div>
        </div>
      </div>`);
    o.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const q = b.dataset.q;
      s.toggle(q === 'sound' ? 'soundOn' : q === 'haptics' ? 'hapticsOn' : 'classicScreen');
    }));
    o.querySelector('[data-p="resume"]')!.addEventListener('click', () => this.resume());
    o.querySelector('[data-p="restart"]')!.addEventListener('click', () => this.app.start(this.mode));
    o.querySelector('[data-p="end"]')!.addEventListener('click', () => { this.setOverlay(null); this.session.endGame(); });
    this.setOverlay(o);
  }

  private resume(): void {
    this.setOverlay(null);
    this.session.resume();
  }

  private showOver(r: GameResult): void {
    this.qualifies = this.app.scores.qualifies(r.score, r.mode);
    const saved = this.app.settings.get('lastInitials').toUpperCase().replace(/[^A-Z]/g, '');
    this.letters = [0, 1, 2].map((i) => saved[i] ?? 'A');
    this.slot = 0;
    this.renderOver(r);
  }

  private renderOver(r: GameResult): void {
    const title = r.reason === 'cleared' ? 'You Won!' : r.reason === 'overflow' ? 'Overflow!' : 'Game Over!';
    const sub = {
      cleared: 'Every tile cleared, so your score was quadrupled.',
      noMoves: `No matching groups left. ${r.tilesLeft} tile${r.tilesLeft === 1 ? '' : 's'} remain.`,
      overflow: 'The board filled up. Nobody wins Action Mode, but you lasted a while.',
      quit: 'You ended the game early. Your score still counts.'
    }[r.reason];
    const s = r.stats;
    const biggest = s.biggestGroup > 0 ? String(s.biggestGroup) : '—';
    const facts: [string, string][] = isAction(r.mode)
      ? [['Survived', mmss(s.elapsed)], ['Speed level', String(r.speedLevel)], ['Tiles cleared', String(s.tilesCleared)], ['Biggest group', biggest]]
      : [['Tiles cleared', `${s.tilesCleared} of ${CAPACITY}`], ['Biggest group', biggest], ['Moves', String(s.moves)],
         r.reason === 'cleared' ? ['Clear bonus', `+${fmt(r.clearBonus)}`] : ['Time', mmss(s.elapsed)]];
    const eyebrow = r.dailyNumber !== null ? `Daily Puzzle #${r.dailyNumber}` : MODE_INFO[r.mode].title;
    const entering = this.qualifies && this.savedId === null;

    const initials = entering ? `
      <div class="initials">
        <p>New high score! Enter your initials.</p>
        <div class="slots">
          ${this.letters.map((l, i) => `<div class="slot">
            <button class="arrow" data-up="${i}" aria-label="Next letter">${icons.up}</button>
            <button class="ltr${i === this.slot ? ' on' : ''}" data-l="${i}" aria-label="Initial ${i + 1}: ${l}">${l}</button>
            <button class="arrow" data-down="${i}" aria-label="Previous letter">${icons.down}</button></div>`).join('')}
          <button class="btn-primary" data-save>Save</button>
        </div>
      </div>` : '';

    const history = r.mode === 'daily'
      ? `<p class="label section-title">${r.streak > 1 ? `This week · ${r.streak}-day streak` : 'This week'}</p>${weekHTML(this.app.progress, r.playedOn)}`
      : `<p class="label section-title">Top scores · ${esc(MODE_INFO[r.mode].title)}</p>${leaderboardHTML(this.app.scores.entries(r.mode), this.savedId)}`;

    const achievements = r.achievements.length ? `
      <p class="label section-title" style="color:var(--amber)">${r.achievements.length === 1 ? 'Achievement unlocked' : 'Achievements unlocked'}</p>
      <div class="ach-list">${r.achievements.map((a) => achievementHTML(a, true)).join('')}</div>` : '';

    const o = h(`
      <div class="overlay" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="card">
          <div class="over-head"><p class="eyebrow">${esc(eyebrow)}</p>
            <button class="share" aria-label="Share result">${icons.share}</button></div>
          <h2>${title}</h2>
          <p class="sub">${esc(sub)}</p>
          <div class="bigscore${r.isNewBest ? ' best' : ''}">
            <div><span class="label">Final score</span><br>${r.isNewBest ? `<span class="newbest">${r.previousBest > 0 ? 'NEW BEST' : 'FIRST SCORE'}</span>` : ''}</div>
            <span class="n" data-count="${r.score}">0</span>
          </div>
          <dl class="facts">${facts.map(([k, v]) => `<div><dt class="label">${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          ${achievements}
          ${initials}
          ${history}
          <div class="row-btns" style="margin-top:20px">
            <button class="btn-primary" data-o="again" ${entering ? '' : 'data-autofocus'}>${r.mode === 'daily' ? 'Replay' : 'Play again'}</button>
            <button class="btn-secondary" data-o="menu">Title screen</button>
          </div>
        </div>
      </div>`);

    o.querySelector('.share')!.addEventListener('click', () => void this.share(r));
    o.querySelector('[data-o="again"]')!.addEventListener('click', () => { this.saveIfNeeded(); this.app.start(r.mode); });
    o.querySelector('[data-o="menu"]')!.addEventListener('click', () => { this.saveIfNeeded(); this.app.showMenu(); });
    o.querySelectorAll<HTMLButtonElement>('[data-up]').forEach((b) => b.addEventListener('click', () => this.cycle(Number(b.dataset.up), 1, r)));
    o.querySelectorAll<HTMLButtonElement>('[data-down]').forEach((b) => b.addEventListener('click', () => this.cycle(Number(b.dataset.down), -1, r)));
    o.querySelectorAll<HTMLButtonElement>('[data-l]').forEach((b) => b.addEventListener('click', () => this.cycle(Number(b.dataset.l), 1, r)));
    o.querySelector('[data-save]')?.addEventListener('click', () => { this.saveIfNeeded(); this.renderOver(r); });

    const firstRender = !this.overlay || this.overlay.classList.contains('veil');
    this.setOverlay(o);
    if (entering) o.querySelector<HTMLElement>(`[data-l="${this.slot}"]`)?.focus({ preventScroll: true });
    this.animateCount(qs(o, '[data-count]'), r.score, firstRender);
  }

  private animateCount(el: HTMLElement, to: number, animate: boolean): void {
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
    const start = performance.now(), dur = 900;
    const step = (now: number) => {
      const k = Math.min(1, (now - start - 150) / dur);
      const eased = k <= 0 ? 0 : 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(to * eased));
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private cycle(i: number, step: number, r: GameResult): void {
    const code = this.letters[i].charCodeAt(0) - 65;
    this.letters[i] = String.fromCharCode(65 + ((code + step + 26) % 26));
    this.slot = i;
    sfx.tick();
    haptics.select();
    this.renderOver(r);
  }

  private saveIfNeeded(): void {
    const r = this.session.result;
    if (!r || !this.qualifies || this.savedId !== null) return;
    const initials = this.letters.join('');
    this.app.settings.set('lastInitials', initials);
    this.savedId = this.app.scores.add(initials, r.score, r.mode);
    sfx.arm();
  }

  private async share(r: GameResult): Promise<void> {
    const text = shareText(r);
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) { await navigator.share({ title: 'Insane Game', text, url }); return; }
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      this.app.notice('Result copied to clipboard');
    } catch {
      this.app.notice('Sharing is not available here');
    }
  }

  // MARK: - Keyboard

  handleKey(e: KeyboardEvent): boolean {
    const r = this.session.result;
    if (r) {
      if (this.isEnteringInitials) {
        if (/^[a-zA-Z]$/.test(e.key)) {
          this.letters[this.slot] = e.key.toUpperCase();
          this.slot = Math.min(2, this.slot + 1);
          sfx.tick();
          this.renderOver(r);
          return true;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { this.cycle(this.slot, e.key === 'ArrowUp' ? 1 : -1, r); return true; }
        if (e.key === 'ArrowLeft' || e.key === 'Backspace') { this.slot = Math.max(0, this.slot - 1); this.renderOver(r); return true; }
        if (e.key === 'ArrowRight') { this.slot = Math.min(2, this.slot + 1); this.renderOver(r); return true; }
        if (e.key === 'Enter') { this.saveIfNeeded(); this.renderOver(r); return true; }
        return false;
      }
      if (e.key === 'Escape') { this.app.showMenu(); return true; }
      return false; // Enter/Space activate the focused button natively
    }
    if (this.session.paused) {
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { this.resume(); return true; }
      return false;
    }
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { this.pause(); return true; }
    return this.session.scene.handleKey(e.key);
  }
}
