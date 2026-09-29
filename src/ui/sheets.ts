import type { App } from '../app';
import { hapticsSupported } from '../audio/haptics';
import { drawTitleBitmap, spriteURL } from '../game/tileArt';
import { GameEngine, MODES, MODE_INFO, isAction, pointsForGroup, type GameMode } from '../model/engine';
import { ACHIEVEMENTS, averageScore } from '../model/progress';
import type { Cell } from '../model/board';
import { ROWS } from '../model/board';
import { MODE_COLOR, MODE_ICON, VERSION, achievementHTML, esc, fmt, h, leaderboardHTML, mmss, qs, switchHTML, weekHTML } from './dom';
import { icons } from './icons';

/** Opens a modal sheet (a native <dialog>, so Esc and focus handling come for free). */
function openSheet(title: string, body: HTMLElement, opts: { doneLabel?: string; onClose?: () => void } = {}): HTMLDialogElement {
  const d = h<HTMLDialogElement>(`
    <dialog class="sheet" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="done">${esc(opts.doneLabel ?? 'Done')}</button></div>
    </dialog>`);
  d.append(body);
  qs(d, '.done').addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // tap outside on desktop
  d.addEventListener('close', () => { opts.onClose?.(); d.remove(); });
  document.body.append(d);
  d.showModal();
  return d;
}

// MARK: - How to Play

export function openHowToPlay(app: App): void {
  const scoreRows = [[2, 4], [3, 5], [5, 1], [10, 3], [20, 2]].map(([n, kind]) => {
    const shown = Math.min(n, 10);
    const imgs = Array.from({ length: shown }, () => `<img src="${spriteURL(kind, 20)}" alt="">`).join('');
    return `<div class="score-row" aria-label="${n} tiles score ${pointsForGroup(n)} points"><span class="imgs">${imgs}</span>
      ${n > shown ? `<span class="more">+${n - shown}</span>` : ''}
      <span class="pts"><span style="color:var(--muted)">${n} →</span> <span style="color:${['', '#FFB547', '#FF5D73', '#3DDC97', '#9B7BFF', '#43B8F5'][kind]}">+${pointsForGroup(n)}</span></span></div>`;
  }).join('');

  const tips: [string, string, string][] = [
    ['hand', 'Tap twice to clear', 'On touch screens in Puzzle and Daily, the first tap shows the group and its points. Turn this off in Settings for one-tap clears.'],
    ['help', 'Press and hold to preview', 'Slide your finger off the board before lifting to cancel. With a mouse, just hover.'],
    ['pause', 'Pausing hides the board', 'Just like the calculator, so a pause can’t be used to plan.'],
    ['calc', 'Classic TI-83 screen', 'Play on the green LCD with the original 8 × 8 tile bitmaps. Press L on a keyboard.']
  ];

  const pages = [
    ['Clear matching groups', 'Tap any group of two or more touching tiles of the same kind. Tiles above fall into the gap, and an empty column slides left, which can join new groups together. This is Martin Hock’s own example from 1997.',
      '<div class="mini" aria-label="Animated example: clearing groups makes tiles fall and columns slide left."></div><p class="mini-caption" aria-live="polite"></p>'],
    ['Bigger is better', 'Each clear scores (tiles − 1)², so one group of twenty is worth more than forty pairs. Save colors up, then pop them all at once. Empty the whole board in Puzzle or Daily and your score is multiplied by four.',
      `<div class="score-rows">${scoreRows}</div>`],
    ['Three ways to play', 'Pick a mode on the title screen. Each keeps its own best scores, and Statistics tracks your streaks and achievements.',
      `<div class="mode-list">${MODES.map((m) => `<div class="mode-item" style="--mc:${MODE_COLOR[m]}"><span class="glyph">${icons[MODE_ICON[m]]}</span>
        <div><b>${esc(MODE_INFO[m].title)}</b><span>${esc(MODE_INFO[m].blurb)}</span></div></div>`).join('')}</div>`],
    ['Handy to know', 'Install the game from your browser’s Share or menu button to play offline and keep your scores safe.',
      `<div class="tips">${tips.map(([ic, t, d]) => `<div class="tip">${icons[ic as keyof typeof icons]}<div><b>${esc(t)}</b><span>${esc(d)}</span></div></div>`).join('')}</div>`]
  ];

  const body = h(`
    <div class="howto">
      <div class="pages">${pages.map(([t, p, visual], i) => `
        <section class="page" aria-label="Page ${i + 1} of ${pages.length}"><div class="page-inner">
          ${visual}<p class="eyebrow">${i + 1} of ${pages.length}</p><h3>${esc(t)}</h3><p>${esc(p)}</p>
        </div></section>`).join('')}</div>
      <div class="dots">${pages.map((_, i) => `<button aria-label="Go to page ${i + 1}" data-dot="${i}"></button>`).join('')}</div>
      <div class="howto-foot"><button class="btn-primary next" autofocus>Next</button></div>
    </div>`);

  const scroller = qs(body, '.pages');
  const next = qs<HTMLButtonElement>(body, '.next');
  const dots = [...body.querySelectorAll<HTMLButtonElement>('[data-dot]')];
  let page = 0;
  const pageWidth = () => scroller.clientWidth || 1;
  const setPage = (i: number) => {
    page = i;
    dots.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
    next.textContent = i === pages.length - 1 ? 'Start playing' : 'Next';
  };
  const goTo = (i: number) => scroller.scrollTo({ left: i * pageWidth(), behavior: 'smooth' });
  scroller.addEventListener('scroll', () => {
    const i = Math.round(scroller.scrollLeft / pageWidth());
    if (i !== page) setPage(i);
  }, { passive: true });
  dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));
  setPage(0);

  const mini = new MiniBoard(qs(body, '.mini'), qs(body, '.mini-caption'));
  const dialog = openSheet('How to play', body, {
    doneLabel: 'Close',
    onClose: () => { mini.stop(); app.settings.set('hasSeenTutorial', true); }
  });
  next.addEventListener('click', () => { if (page < pages.length - 1) goTo(page + 1); else dialog.close(); });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { goTo(Math.min(pages.length - 1, page + 1)); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { goTo(Math.max(0, page - 1)); e.preventDefault(); }
  });
  mini.start();
}

/** Replays the readme example (5s, 3s, 2s, 1s → perfect board) with the real engine and DOM tiles. */
class MiniBoard {
  private static readonly picture = ['12325', '25555', '12331'];
  private static readonly moves: Cell[] = [{ col: 4, row: 6 }, { col: 2, row: 7 }, { col: 0, row: 6 }, { col: 0, row: 7 }];
  private readonly cell = 46;
  private readonly pad = 14;
  private nodes = new Map<number, HTMLElement>();
  private running = false;
  private timer = 0;

  constructor(private readonly box: HTMLElement, private readonly caption: HTMLElement) {
    box.style.width = `${this.cell * 5 + this.pad * 2}px`;
    box.style.height = `${this.cell * 3 + this.pad * 2}px`;
  }

  start(): void { this.running = true; void this.loop(); }
  stop(): void { this.running = false; clearTimeout(this.timer); }

  private wait(ms: number): Promise<boolean> {
    return new Promise((res) => { this.timer = window.setTimeout(() => res(this.running), ms); });
  }

  private sync(engine: GameEngine, lit: Cell[]): void {
    const litKeys = new Set(lit.map((c) => c.row * 100 + c.col));
    const side = this.cell + Math.ceil(this.cell * 0.2) * 2;
    const alive = new Set<number>();
    engine.board.forEachTile((tile, c) => {
      alive.add(tile.id);
      let n = this.nodes.get(tile.id);
      const isLit = litKeys.has(c.row * 100 + c.col);
      if (!n) {
        n = document.createElement('div');
        n.className = 't';
        n.style.width = n.style.height = `${side}px`;
        this.box.append(n);
        this.nodes.set(tile.id, n);
      }
      n.style.backgroundImage = `url(${spriteURL(tile.kind, this.cell, isLit)})`;
      const x = this.pad + c.col * this.cell + this.cell / 2 - side / 2;
      const y = this.pad + (c.row - (ROWS - 3)) * this.cell + this.cell / 2 - side / 2 - (isLit ? this.cell * 0.05 : 0);
      n.style.transform = `translate(${x}px, ${y}px)`;
    });
    for (const [id, n] of this.nodes) {
      if (alive.has(id)) continue;
      n.style.transform += ' scale(0.1)';
      n.classList.add('gone');
      this.nodes.delete(id);
      setTimeout(() => n.remove(), 400);
    }
  }

  private async loop(): Promise<void> {
    const kinds = Array.from({ length: ROWS }, () => Array(12).fill(0));
    MiniBoard.picture.forEach((line, i) => [...line].forEach((ch, c) => { kinds[ROWS - 3 + i][c] = Number(ch); }));
    while (this.running) {
      this.nodes.forEach((n) => n.remove());
      this.nodes.clear();
      const engine = new GameEngine('puzzle', { kinds });
      this.sync(engine, []);
      this.caption.textContent = 'Tap a group of two or more.';
      if (!(await this.wait(1300))) return;
      for (const move of MiniBoard.moves) {
        const group = engine.board.group(move);
        this.sync(engine, group);
        this.caption.textContent = `${group.length} tiles · +${pointsForGroup(group.length)}`;
        if (!(await this.wait(1100))) return;
        engine.clear(move);
        this.sync(engine, []);
        this.caption.textContent = engine.isOver
          ? `Board clear! ${engine.score / 4} × 4 = ${engine.score} points`
          : 'Tiles fall, then columns slide left.';
        if (!(await this.wait(engine.isOver ? 2200 : 1300))) return;
      }
    }
  }
}

// MARK: - Statistics

export function openStats(app: App): void {
  let mode: GameMode = app.selectedMode;
  const body = h(`<div class="sheet-body"></div>`);
  const render = () => {
    const s = app.progress.stats(mode);
    const tiles: [string, string, boolean][] = [
      ['Games played', fmt(s.played), false],
      ['Best score', fmt(s.best), true],
      ['Average score', fmt(averageScore(s)), false],
      ['Tiles cleared', fmt(s.tilesCleared), false],
      ['Biggest group', s.biggestGroup ? String(s.biggestGroup) : '—', false]
    ];
    if (isAction(mode)) {
      tiles.push(['Longest survival', mmss(s.longestSurvival), false], ['Top speed level', s.topSpeed ? String(s.topSpeed) : '—', false]);
    } else {
      tiles.push(['Boards cleared', fmt(s.boardsCleared), false]);
      if (mode === 'daily') tiles.push(['Current streak', `${app.progress.streak()} days`, true]);
    }
    body.innerHTML = `
      <div class="seg" role="group" aria-label="Mode">${MODES.map((m) => `<button data-m="${m}" aria-pressed="${m === mode}">${esc(MODE_INFO[m].short)}</button>`).join('')}</div>
      <div class="tiles" style="--accent:${MODE_COLOR[mode]}">${tiles.map(([l, v, hi]) => `<div class="tile-stat${hi ? ' hi' : ''}"><span class="label">${esc(l)}</span><div class="v">${esc(v)}</div></div>`).join('')}</div>
      ${mode === 'daily'
        ? `<p class="eyebrow group-title">Last seven days</p><div style="margin-top:10px">${weekHTML(app.progress)}</div>`
        : `<p class="eyebrow group-title">Top scores</p><div style="margin-top:10px">${leaderboardHTML(app.scores.entries(mode))}</div>`}
      <p class="eyebrow group-title">Achievements · ${app.progress.unlockedCount} of ${ACHIEVEMENTS.length}</p>
      <div class="ach-list" style="margin-top:10px">${ACHIEVEMENTS.map((a) => achievementHTML(a, app.progress.isUnlocked(a))).join('')}</div>`;
    body.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.m as GameMode; render(); }));
  };
  render();
  openSheet('Statistics', body);
}

// MARK: - Settings

export function openSettings(app: App): void {
  const s = app.settings;
  const body = h(`<div class="sheet-body"></div>`);
  let confirming = false;
  const rows: [string, 'soundOn' | 'hapticsOn' | 'tapTwiceToClear' | 'classicScreen', string][] = [
    ['Sound', 'soundOn', 'Synthesized effects. Starts after your first tap.'],
    ['Vibration', 'hapticsOn', hapticsSupported ? 'A buzz with each clear.' : 'Not supported by this browser (iPhone Safari has no vibration).'],
    ['Tap twice to clear', 'tapTwiceToClear', 'Touch screens, Puzzle and Daily: the first tap shows the group and its points.'],
    ['Classic TI-83 screen', 'classicScreen', 'Green LCD with the original 8 × 8 tile bitmaps.']
  ];
  const render = () => {
    body.innerHTML = `
      <p class="eyebrow group-title" style="margin-top:0">Play</p>
      <div class="group">${rows.map(([t, key, d]) => `<div class="set-row"><div class="t"><b>${esc(t)}</b><span>${esc(d)}</span></div>${switchHTML(`sw-${key}`, s.get(key), t)}</div>`).join('')}</div>
      <p class="eyebrow group-title">Help and data</p>
      <div class="group">
        <button class="set-row link" data-a="howto">${icons.help}<span class="t">How to play</span></button>
        <button class="set-row link danger" data-a="reset">${icons.close}<span class="t">Reset statistics and scores</span></button>
        ${confirming ? `<div class="confirm"><p>Reset all statistics, scores and achievements? This can’t be undone.</p>
          <div class="row-btns"><button class="btn-secondary" data-a="cancel">Cancel</button><button class="btn-primary" data-a="confirm" style="background:var(--coral);color:#2a0610">Reset everything</button></div></div>` : ''}
      </div>
      <p class="eyebrow group-title">About</p>
      <div class="group about">
        <canvas aria-label="The original TI-83 title bitmap"></canvas>
        <p>Original TI-85 Insane Game by Martin Hock. TI-83 version by Bill Nagel, 1997. ION port by Jason Kovacs, 2000. Rebuilt for iOS and the web.</p>
        <p style="color:var(--faint)">Version ${VERSION}</p>
      </div>`;
    drawTitleBitmap(qs<HTMLCanvasElement>(body, '.about canvas'));
    rows.forEach(([, key]) => qs(body, `#sw-${key}`).addEventListener('click', () => { s.toggle(key); render(); }));
    body.querySelector('[data-a="howto"]')!.addEventListener('click', () => { dialog.close(); openHowToPlay(app); });
    body.querySelector('[data-a="reset"]')!.addEventListener('click', () => { confirming = true; render(); });
    body.querySelector('[data-a="cancel"]')?.addEventListener('click', () => { confirming = false; render(); });
    body.querySelector('[data-a="confirm"]')?.addEventListener('click', () => {
      app.resetAllProgress();
      confirming = false;
      render();
      app.notice('Statistics and scores reset');
    });
  };
  render();
  const dialog = openSheet('Settings', body);
}
