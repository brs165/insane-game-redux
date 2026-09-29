# Insane Game

**SameGame for the TI-83, rebuilt as an installable, offline-ready web app.**
Clear touching groups of matching tiles, chase huge combos, survive Action Mode, and play the
same Daily Puzzle as everyone else, on the web and on the companion iOS app.

Once deployed, it lives at `https://<your-username>.github.io/<repo-name>/`.

## Quick start

```bash
npm install        # once
npm run dev        # play locally at http://localhost:5173 (add -- --host to test on your phone)
npm test           # 24 rule, progress and iOS-parity tests
npm run build      # production build in dist/
npm run preview    # serve dist/ locally, with the service worker, to test offline and install
```

Requires Node 20 or later.

## Publish to GitHub Pages

1. Create a GitHub repository (any name) and push this folder to its `main` branch.
2. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` runs the tests, builds, and publishes. The first run takes about a minute;
   the address appears in the **Actions** tab and in Settings → Pages.

Full walkthrough, custom domains and troubleshooting: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## What's inside

- **Three modes.** Puzzle (the original), Action (the original's real-time mode) and Daily Puzzle,
  with one seeded board per day, identical on the web and the iOS app, and a streak.
- **Game feel.** Tiles fall with gravity and squash on landing, then slide left. Clears burst into
  shards and sparkles, big groups send out a shock ring and shake the screen, and scores float up.
  Hover or hold to preview a group's points before you clear it.
- **Sound and vibration.** Every effect is synthesized in Web Audio, so there are no audio files.
  Vibration works on Android; iPhone browsers don't support it.
- **How to Play, Statistics, Settings.** An animated walkthrough on first launch, per-mode stats,
  top-five boards with initials, the week's Daily results, and eight achievements.
- **Classic TI-83 screen.** Green LCD with the original 8 × 8 tile bitmaps (press **L**).
- **Installable PWA.** Works offline after the first visit, shows an "update available" banner when
  you deploy a new version, and fits phones in portrait and landscape.
- **Keyboard play.** Arrows move, Space clears, P pauses, M mutes, L toggles the classic screen.

## Documentation

| Doc | What it covers |
|---|---|
| [docs/GAMEPLAY.md](docs/GAMEPLAY.md) | Rules, modes, scoring, Action timing, achievements, controls |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code layout, how it maps to the iOS app, data and storage, the service worker |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | GitHub Pages setup, custom domains, releasing updates, troubleshooting |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local workflow, testing on a phone, icons, versioning, known platform limits |
| [docs/PARITY.md](docs/PARITY.md) | How the Daily Puzzle stays identical on iOS and the web, and how to verify it |

## Credits

Original TI-85 Insane Game by Martin Hock. TI-83 version by Bill Nagel (© 1997). ION port by
Jason Kovacs (2000). The name, the title bitmap and the 8 × 8 tile bitmaps are theirs. The original
1997 readme asked that pages hosting the game link to `www.tou.com/host/tiasm`; that address did not
respond when this was written (September 2026), so it is noted here as history rather than linked.
Fonts: Bungee, Sora and Silkscreen, all under the SIL Open Font License.
