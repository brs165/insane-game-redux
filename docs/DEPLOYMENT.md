# Deploying to GitHub Pages

The repo ships with a GitHub Actions workflow (`.github/workflows/deploy.yml`) that tests, builds and
publishes the game on every push to `main`. The build uses relative paths (`base: './'` in
`vite.config.ts`), so it works at any repo name without edits.

## First deployment

1. **Create the repository.** On GitHub, click **New repository**. Any name works; it becomes part of
   the address, e.g. `insane-game` → `https://<username>.github.io/insane-game/`. Public repos get
   Pages on every plan; private repos need a paid plan, and the site is public either way.
2. **Push the code.** From this folder:
   ```bash
   git init -b main
   git add .
   git commit -m "Insane Game PWA"
   git remote add origin https://github.com/<username>/<repo-name>.git
   git push -u origin main
   ```
   Or use GitHub Desktop: *File → Add Local Repository*, then *Publish repository*.
3. **Turn on Pages.** In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Run the workflow.** The push in step 2 already started it; if it ran before Pages was enabled, open
   **Actions → Deploy to GitHub Pages → Run workflow**. When the *deploy* job is green, its summary
   shows the live address.
5. **Install it.** Open the address on your phone. On iPhone: Share → *Add to Home Screen*. On
   Android/Chrome/Edge: use the Install button on the title screen or the browser menu.

## Releasing an update

Push to `main`. Players get the new version like this:

1. The service worker notices new files in the background.
2. The game shows **"A new version is ready. Reload"** at the bottom of the screen.
3. Tapping Reload switches to the new version. If they ignore it, the next cold start picks it up.

Bump `version` in `package.json` and `VERSION` in `src/ui/dom.ts` when you release, so Settings →
About shows the right number.

## Custom domain (optional)

1. In **Settings → Pages → Custom domain**, enter e.g. `insane.example.com` and save.
2. At your DNS provider, add a `CNAME` record pointing `insane` to `<username>.github.io`.
3. Once the certificate is issued, tick **Enforce HTTPS**. No code changes are needed, thanks to the
   relative paths.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Workflow fails at `npm test` | A rule test broke. Run `npm test` locally; the failing test names the rule. |
| Deploy job says Pages isn't enabled | Settings → Pages → Source must be **GitHub Actions**, then re-run the workflow. |
| Page loads but is blank | Hard-refresh once. If it persists, check the browser console for 404s; the `dist/` layout must be published as-is. |
| Old version keeps showing | The update banner appears after the new service worker downloads. Close every tab or the installed app and reopen it. |
| iPhone lost my scores | Safari can clear data for sites not added to the Home Screen after about a week of not visiting. Installed web apps keep their data. |
| No vibration on iPhone | iOS Safari doesn't support the Vibration API; this is expected. Android supports it. |
