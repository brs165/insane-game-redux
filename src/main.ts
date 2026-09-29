import '@fontsource/bungee/latin-400.css';
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/sora/latin-400.css';
import '@fontsource/sora/latin-600.css';
import '@fontsource/sora/latin-700.css';
import '@fontsource/sora/latin-800.css';
import './styles.css';

import { App } from './app';
import { setupPWA } from './pwa';

const root = document.getElementById('app');
if (root) {
  const app = new App(root);
  app.showMenu();
  setupPWA(app);
  // Canvas text (points chip, floaters) uses the web fonts; redraw once they are ready.
  void document.fonts?.ready.then(() => window.dispatchEvent(new Event('resize')));
}
