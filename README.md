# Study Log (working name; rename via APP_NAME in app.js + manifest.webmanifest)
Plain HTML/CSS/JS PWA, no build step, no network calls. Data: localStorage key `studylog.v1` (schema v2 (multi-subject; v1 auto-migrates into Physics), migrate() in app.js).
Files: index.html, styles.css, app.js, docx.js (offline zip + Word writer), sw.js, manifest.webmanifest, icons/.
Run locally: `python3 -m http.server 8792 --bind 127.0.0.1` then open http://127.0.0.1:8792/
Tests: `cd tests && NODE_PATH=/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules node run.js` (server must be running).
