# Trivia Practice V2

A mobile-friendly trivia web app that you can install to your iPhone Home Screen.

## Files
- `index.html` — UI shell
- `style.css` — theme
- `app.js` — logic (20s timer, score + high score, online/offline question sources)
- `manifest.webmanifest` — PWA manifest (Add to Home Screen)
- `icons/` — app icons (192, 512 PNG)
- `data/history.json` — example internal DB (correct answer at index 0)

## Deploy on GitHub Pages
1. Create repo **Trivia-Practice-V2** and upload all files at the repo **root**. Ensure folders:
   - `data/history.json`
   - `icons/icon-192.png`, `icons/icon-512.png`
2. Repo **Settings ? Pages** ? Source: `main` branch, **/(root)** ? **Save**.
3. Open your site: `https://YOUR-USERNAME.github.io/Trivia-Practice-V2/`

## Install on iPhone
1. Open the site in **Safari**.
2. Tap **Share** ? **Add to Home Screen** ? **Add**.
3. Launch from the icon for fullscreen play.

## Internal DB vs Online
- **Online pool ON** ? fetches from OpenTDB.
- **Online pool OFF** ? loads `data/<category>.json` (e.g., `data/history.json`). The app shuffles answers at runtime and uses `correctIndex: 0`.