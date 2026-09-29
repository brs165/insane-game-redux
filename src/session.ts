import { haptics } from './audio/haptics';
import { sfx } from './audio/sound';
import { GameScene, type SceneDelegate } from './game/scene';
import { dailyNumber, dailySeed } from './model/daily';
import { GameEngine, MODE_INFO, isAction, type Clear, type EndReason, type GameMode, type Stats } from './model/engine';
import type { Achievement, ProgressStore } from './model/progress';
import { mmss } from './ui/dom';

/** Everything the game-over screen needs, captured when a game ends. */
export interface GameResult {
  mode: GameMode;
  reason: EndReason;
  score: number;
  clearBonus: number;
  stats: Stats;
  speedLevel: number;
  tilesLeft: number;
  isNewBest: boolean;
  previousBest: number;
  achievements: Achievement[];
  dailyNumber: number | null;
  streak: number;
  playedOn: Date;
}

export function shareText(r: GameResult): string {
  const parts = [r.dailyNumber !== null
    ? `Insane Game Daily #${r.dailyNumber}: ${r.score.toLocaleString()} points`
    : `Insane Game ${MODE_INFO[r.mode].title}: ${r.score.toLocaleString()} points`];
  if (r.reason === 'cleared') parts.push('board cleared');
  if (r.stats.biggestGroup > 0) parts.push(`biggest group ${r.stats.biggestGroup}`);
  if (isAction(r.mode)) parts.push(`survived ${mmss(r.stats.elapsed)}`);
  if (r.dailyNumber !== null && r.streak > 1) parts.push(`${r.streak}-day streak`);
  return parts.join(', ') + '.';
}

/**
 * One game in progress (port of GameSession.swift). Owns the scene, turns its events into sound,
 * haptics and achievements, and tells the UI when HUD values or the result change.
 */
export class GameSession implements SceneDelegate {
  readonly mode: GameMode;
  readonly scene: GameScene;
  readonly startedAt = new Date();
  readonly dailyNumber: number | null;
  result: GameResult | null = null;
  paused = false;

  onChange: () => void = () => {};
  onAchievement: (a: Achievement) => void = () => {};
  onResult: (r: GameResult) => void = () => {};

  private unlockedThisGame: Achievement[] = [];

  constructor(mode: GameMode, canvas: HTMLCanvasElement, private readonly progress: ProgressStore,
              opts: { classic: boolean; tapTwice: boolean }) {
    this.mode = mode;
    const seed = mode === 'daily' ? dailySeed(this.startedAt) : undefined;
    this.dailyNumber = mode === 'daily' ? dailyNumber(this.startedAt) : null;
    this.scene = new GameScene(canvas, new GameEngine(mode, { seed }), 'play', opts);
    this.scene.delegate = this;
  }

  get engine(): GameEngine { return this.scene.engine; }

  pause(): void {
    if (this.result || this.scene.isEnding || this.paused) return;
    this.paused = true;
    this.scene.paused = true;
    this.onChange();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.scene.paused = false;
    this.onChange();
  }

  endGame(): void {
    this.paused = false;
    this.scene.paused = false;
    this.scene.endGame();
  }

  destroy(): void {
    this.scene.destroy();
  }

  private unlock(a: Achievement): void {
    if (!this.progress.unlock(a)) return;
    this.unlockedThisGame.push(a);
    sfx.unlock();
    haptics.won();
    this.onAchievement(a);
  }

  // SceneDelegate

  didClear(clear: Clear): void {
    sfx.pop(clear.size);
    haptics.clear(clear.size);
    this.onChange();
    this.unlock('firstClear');
    if (clear.size >= 20) this.unlock('bigTwenty');
  }

  didSpawn(): void {
    sfx.spawn();
    this.onChange();
    if (this.engine.speedLevel >= 10) this.unlock('speedDemon');
  }

  didTick(): void {
    if (!isAction(this.mode)) return;
    this.onChange();
    if (this.engine.stats.elapsed >= 180 && !this.progress.isUnlocked('survivor')) this.unlock('survivor');
  }

  didTapInvalid(): void {
    sfx.invalid();
    haptics.invalid();
  }

  didArmGroup(): void {
    sfx.arm();
    haptics.select();
  }

  willEnd(reason: EndReason): void {
    if (reason === 'cleared') { sfx.win(); haptics.won(); }
    else if (reason === 'noMoves' || reason === 'overflow') { sfx.gameOver(); haptics.lost(); }
    this.onChange();
  }

  didEnd(reason: EndReason): void {
    const e = this.engine;
    const outcome = this.progress.record({
      mode: this.mode, reason, score: e.score, stats: { ...e.stats }, speedLevel: e.speedLevel,
      classic: this.scene.classic, date: this.startedAt
    });
    this.result = {
      mode: this.mode, reason, score: e.score, clearBonus: e.clearBonus, stats: { ...e.stats },
      speedLevel: e.speedLevel, tilesLeft: e.tileCount, isNewBest: outcome.isNewBest,
      previousBest: outcome.previousBest, achievements: [...this.unlockedThisGame, ...outcome.unlocked],
      dailyNumber: this.dailyNumber, streak: outcome.streak, playedOn: this.startedAt
    };
    this.paused = false;
    this.onResult(this.result);
  }
}
