import type { App } from '../app';
import { haptics } from '../audio/haptics';
import { sfx } from '../audio/sound';
import { GameScene } from '../game/scene';
import { drawTitleBitmap } from '../game/tileArt';
import { dailyNumber } from '../model/daily';
import { GameEngine, MODES, MODE_INFO, type GameMode } from '../model/engine';
import { MODE_COLOR, MODE_ICON, esc, fmt, h, logoHTML, qs, setAccent } from './dom';
import { icons } from './icons';
import { installHint } from '../pwa';

/** Title screen: logo and history, mode picker, and a demo board playing itself behind everything. */
export class MenuScreen {
  readonly el: HTMLElement;
  private readonly scene: GameScene;
  private readonly onResize = () => this.scene.layout(window.innerWidth * 0.96, window.innerHeight * 0.92);

  constructor(private readonly app: App) {
    this.el = h(`
      <div class="screen menu">
        <div class="menu-backdrop" aria-hidden="true"><canvas></canvas></div>
        <div class="menu-inner">
          <div class="toolbar">
            <button class="btn-secondary install" hidden>${icons.install} Install</button>
            <button class="icon-btn" data-act="howto" aria-label="How to play" title="How to play">${icons.help}</button>
            <button class="icon-btn" data-act="stats" aria-label="Statistics and achievements" title="Statistics">${icons.chart}</button>
            <button class="icon-btn" data-act="settings" aria-label="Settings" title="Settings">${icons.gear}</button>
          </div>
          <div class="menu-grid">
            <div class="intro">
              <p class="eyebrow">SameGame · 12 × 8 board · since 1997</p>
              ${logoHTML()}
              <p class="lede">Clear touching groups of matching tiles. Tiles fall to fill the gaps, and empty columns slide left. Plan ahead, because the biggest groups are worth far more than a clean board.</p>
              <div class="ti"><canvas aria-label="The original TI-83 title bitmap"></canvas>
                <span>The original title bitmap, 96 × 8 pixels. Turn on the classic screen in Settings to play on it.</span></div>
              <p class="credits">Original TI-85 Insane Game by Martin Hock. TI-83 version by Bill Nagel, 1997. ION port by Jason Kovacs, 2000.</p>
            </div>
            <div class="controls">
              <div class="install-card" hidden></div>
              <div class="modes" role="radiogroup" aria-label="Game mode"></div>
              <button class="btn-primary play"></button>
              <div class="scoring" aria-label="Scoring">
                <strong>Points = (tiles − 1)²</strong>
                ${[[2, 1], [3, 4], [5, 16], [10, 81], [20, 361]].map(([n, p]) => `<span class="chip">${n} → <b>${p}</b></span>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>`);

    const demoCanvas = qs<HTMLCanvasElement>(this.el, '.menu-backdrop canvas');
    this.scene = new GameScene(demoCanvas, new GameEngine('puzzle'), 'demo', {
      classic: app.settings.get('classicScreen'), tapTwice: false
    });
    drawTitleBitmap(qs<HTMLCanvasElement>(this.el, '.ti canvas'));

    this.el.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) =>
      b.addEventListener('click', () => app.openSheet(b.dataset.act as 'howto' | 'stats' | 'settings')));
    qs(this.el, '.play').addEventListener('click', () => app.start(app.selectedMode));
    qs(this.el, '.modes').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.mode');
      if (btn) this.select(btn.dataset.mode as GameMode);
    });
    qs(this.el, '.install').addEventListener('click', () => void app.installPrompt?.());
    this.render();
  }

  mounted(): void {
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.scene.start();
    const current = this.el.querySelector<HTMLElement>('.mode[aria-checked="true"]');
    current?.focus({ preventScroll: true });
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.scene.destroy();
  }

  onSettingsChanged(): void {
    this.scene.classic = this.app.settings.get('classicScreen');
    this.render();
  }

  onDataChanged(): void {
    this.render();
  }

  handleKey(e: KeyboardEvent): boolean {
    const i = MODES.indexOf(this.app.selectedMode);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { this.select(MODES[(i + 1) % MODES.length], true); return true; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { this.select(MODES[(i + MODES.length - 1) % MODES.length], true); return true; }
    const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON' && !(e.target as HTMLElement).classList.contains('mode');
    if ((e.key === 'Enter' || e.key === ' ') && !onButton) { this.app.start(this.app.selectedMode); return true; }
    return false;
  }

  private select(mode: GameMode, focus = false): void {
    if (mode === this.app.selectedMode) return;
    this.app.selectedMode = mode; // triggers render via settings subscription
    sfx.tick();
    haptics.select();
    if (focus) this.el.querySelector<HTMLElement>(`.mode[data-mode="${mode}"]`)?.focus({ preventScroll: true });
  }

  private render(): void {
    const mode = this.app.selectedMode;
    setAccent(mode);
    const today = new Date();
    const number = dailyNumber(today);
    const streak = this.app.progress.streak(today);

    const modes = qs(this.el, '.modes');
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.mode;
    modes.innerHTML = MODES.map((m) => {
      const info = MODE_INFO[m];
      const bestLabel = m === 'daily' ? 'Today' : 'Best';
      const foot = m === 'daily'
        ? `<p class="mode-foot">${streak > 0 ? `Puzzle #${number} · ${streak}-day streak` : `Puzzle #${number} · start a streak today`}</p>` : '';
      return `<button class="mode" role="radio" aria-checked="${m === mode}" data-mode="${m}" style="--mc:${MODE_COLOR[m]}">
        <span class="glyph">${icons[MODE_ICON[m]]}</span>
        <span><span class="mode-head"><span class="mode-name">${esc(info.title)}</span>
          <span class="mode-best">${bestLabel} <b class="num">${fmt(this.app.best(m, today))}</b></span></span>
          <p class="mode-desc">${esc(info.blurb)}</p>${foot}</span>
      </button>`;
    }).join('');
    if (focused) modes.querySelector<HTMLElement>(`.mode[data-mode="${focused}"]`)?.focus({ preventScroll: true });

    qs(this.el, '.play').textContent = mode === 'daily' ? `Play Daily #${number}` : `Play ${MODE_INFO[mode].title}`;

    qs(this.el, '.install').hidden = !this.app.installPrompt;
    const card = qs(this.el, '.install-card');
    const hint = installHint();
    card.hidden = !hint;
    if (hint) {
      card.innerHTML = `${icons.install}<span>${esc(hint)}</span><button aria-label="Dismiss">${icons.close}</button>`;
      card.querySelector('button')!.addEventListener('click', () => {
        try { localStorage.setItem('insane.installHintDismissed', '1'); } catch { /* ignore */ }
        card.hidden = true;
      });
    }
  }
}
