import { registerSW } from 'virtual:pwa-register';
import type { App } from './app';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const isStandalone = (): boolean =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** iPhone/iPad Safari has no install prompt, so the title screen shows this hint instead. */
export function installHint(): string | null {
  if (!isIOS() || isStandalone()) return null;
  try { if (localStorage.getItem('insane.installHintDismissed')) return null; } catch { /* ignore */ }
  return 'Install for offline play and to keep your scores safe: tap Share, then Add to Home Screen.';
}

/** Registers the service worker (offline cache), the update banner and the install button. */
export function setupPWA(app: App): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      app.showUpdateBanner(() => void updateSW(true));
    },
    onOfflineReady() {
      app.notice('Ready to play offline');
    }
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const evt = e as BeforeInstallPromptEvent;
    app.installPrompt = async () => {
      await evt.prompt();
      await evt.userChoice.catch(() => null);
      app.installPrompt = null;
      app.showMenuIfIdle();
    };
    app.showMenuIfIdle();
  });
  window.addEventListener('appinstalled', () => {
    app.installPrompt = null;
    app.showMenuIfIdle();
  });
}
