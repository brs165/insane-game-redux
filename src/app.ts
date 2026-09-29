import { setHapticsEnabled } from './audio/haptics';
import { setSoundEnabled, unlockAudio } from './audio/sound';
import type { GameMode } from './model/engine';
import { ACHIEVEMENT_INFO, ProgressStore, type Achievement } from './model/progress';
import { ScoreStore } from './model/scores';
import { Settings } from './model/settings';
import { browserStore } from './model/store';
import { badgeHTML, esc, h } from './ui/dom';
import { GameScreen } from './ui/game';
import { MenuScreen } from './ui/menu';
import { openHowToPlay, openSettings, openStats } from './ui/sheets';

export type SheetKind = 'howto' | 'stats' | 'settings';

/**
 * App-wide state and navigation (port of AppModel.swift): stores, the title screen or current game,
 * sheets, toasts, and global keyboard/visibility handling.
 */
export class App {
  readonly settings: Settings;
  readonly scores: ScoreStore;
  readonly progress: ProgressStore;

  /** Set by the PWA layer when the browser offers an install prompt (Chrome, Edge, Android). */
  installPrompt: (() => Promise<void>) | null = null;

  private current: MenuScreen | GameScreen | null = null;
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  private persistedAsked = false;

  constructor(private readonly root: HTMLElement) {
    const kv = browserStore();
    this.settings = new Settings(kv);
    this.scores = new ScoreStore(kv);
    this.progress = new ProgressStore(kv);

    setSoundEnabled(this.settings.get('soundOn'));
    setHapticsEnabled(this.settings.get('hapticsOn'));
    this.settings.subscribe(() => {
      setSoundEnabled(this.settings.get('soundOn'));
      setHapticsEnabled(this.settings.get('hapticsOn'));
      this.current?.onSettingsChanged();
    });
    const refresh = () => this.current?.onDataChanged();
    this.scores.subscribe(refresh);
    this.progress.subscribe(refresh);

    // Browsers only allow audio after a gesture; also ask to keep saved data on first interaction.
    const firstGesture = () => {
      unlockAudio();
      if (!this.persistedAsked) {
        this.persistedAsked = true;
        void navigator.storage?.persist?.().catch(() => false);
      }
    };
    window.addEventListener('pointerdown', firstGesture, { capture: true });
    window.addEventListener('keydown', firstGesture, { capture: true });
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.current instanceof GameScreen) this.current.pause();
    });
  }

  get selectedMode(): GameMode { return this.settings.get('lastMode'); }
  set selectedMode(mode: GameMode) { this.settings.set('lastMode', mode); }

  /** Best score for the HUD and mode cards. For the Daily Puzzle, today's best. */
  best(mode: GameMode, date = new Date()): number {
    if (mode === 'daily') return this.progress.dailyScore(date) ?? 0;
    return Math.max(this.scores.best(mode), this.progress.stats(mode).best);
  }

  showMenu(): void {
    this.swap(new MenuScreen(this));
    if (!this.settings.get('hasSeenTutorial')) this.openSheet('howto');
  }

  /** Re-renders the title screen (e.g. to reveal the Install button) without interrupting a game. */
  showMenuIfIdle(): void {
    if (this.current instanceof MenuScreen) this.current.onDataChanged();
  }

  start(mode: GameMode): void {
    this.selectedMode = mode;
    this.swap(new GameScreen(this, mode));
  }

  openSheet(kind: SheetKind): void {
    if (this.current instanceof GameScreen) this.current.pause();
    if (kind === 'howto') openHowToPlay(this);
    else if (kind === 'stats') openStats(this);
    else openSettings(this);
  }

  resetAllProgress(): void {
    this.scores.reset();
    this.progress.reset();
  }

  /** Achievement banner that drops in from the top. */
  toastAchievement(a: Achievement): void {
    this.showToast(`${badgeHTML(a, 32)}<div><small>ACHIEVEMENT UNLOCKED</small><strong>${esc(ACHIEVEMENT_INFO[a].title)}</strong></div>`, 2800);
  }

  /** Short plain notice ("Copied to clipboard"). */
  notice(text: string): void {
    this.showToast(`<div style="padding-left:10px"><strong style="font-size:14px">${esc(text)}</strong></div>`, 2200);
  }

  /** Persistent bottom banner offering a reload when a new version has been downloaded. */
  showUpdateBanner(apply: () => void): void {
    if (document.querySelector('.banner.update')) return;
    const b = h(`<div class="banner update" role="status"><span>A new version is ready.</span><button>Reload</button></div>`);
    b.querySelector('button')!.addEventListener('click', apply);
    document.body.append(b);
  }

  private showToast(inner: string, ms: number): void {
    if (!this.toastEl) {
      this.toastEl = h('<div class="toast" role="status" aria-live="polite"></div>');
      document.body.append(this.toastEl);
    }
    const t = this.toastEl;
    t.innerHTML = inner;
    t.classList.remove('show');
    void t.offsetWidth; // restart the transition
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
  }

  private swap(next: MenuScreen | GameScreen): void {
    this.current?.destroy();
    this.current = next;
    this.root.replaceChildren(next.el);
    next.mounted();
  }

  private onKey(e: KeyboardEvent): void {
    if (document.querySelector('dialog[open]')) return; // sheets handle their own keys (Esc closes)
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.key === 'm' || e.key === 'M') && !(this.current instanceof GameScreen && this.current.isEnteringInitials)) {
      this.settings.toggle('soundOn');
      return;
    }
    if ((e.key === 'l' || e.key === 'L') && !(this.current instanceof GameScreen && this.current.isEnteringInitials)) {
      this.settings.toggle('classicScreen');
      return;
    }
    if (this.current?.handleKey(e)) e.preventDefault();
  }
}
