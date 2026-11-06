# 14/01 — Labels, active-runs and stop-all routes, Sessions-tab button

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: plan 13 done · Parallel with: none

## Decisions you need
C1–C5 — run `grep -E '^\| (C1|C2|C3|C4|C5) ' 00-README.md`.

## Read first
- `public/index.html`: every `.rootacts` group (`grep -n 'class="rootacts"' -A4 public/index.html`), especially the Sessions one (~lines 268–273).
- `public/workbench.js`: `openSessionsTab` (~507), `loadSessions` (~512), `note()` (~403), `showTab` (to know when the Sessions tab is visible), `api()` (~34).
- `server.js`: the `runs` Map and the `/api/stop` block (~327–334); `lib/claude-runner.js` `stop()` (~488) and the fields it sets (`stopped`, `child`).

## Scope (files you own)
`public/index.html`, `public/workbench.js`, `public/styles.css`, `server.js`.

## Tasks
1. **Labels (C1).** Edit the four button texts only.
2. **Routes (C2, C3).** Add `GET /api/runs/active` and `POST /api/stop-all` as specified; reuse one helper `activeRuns()` returning the array so both routes agree.
3. **Button (C4, C5).** Add `#wbSessStopAll` to the Sessions `.rootacts` group. In `workbench.js` add `refreshActiveRuns()` (fetch the count, set disabled/title/label), call it from `openSessionsTab` and the Refresh handler, run a 5 s `setInterval` only while the Sessions tab is the visible one (start in `showTab` when `tab === 'sessions'`, clear otherwise), and implement the two-click behaviour with a 4 s revert timer. Pluralise: `1 run` / `N runs`.
4. **CSS.** Nothing required; add a rule only if the label's longer text wraps in `.rootacts` (it should keep `white-space: nowrap` from plan 09 and wrap the group below 600px).
5. Do not edit `public/client.js`, `public/notify.js`, `lib/`.

## Done when
`node --check server.js public/workbench.js`; `node --test lib/*.test.mjs` pass; `grep -n "Choose folder\|Go up\|New folder\|Ask Claude again\|Stop all runs from this page" public/index.html` finds all five; in a temp copy of the project on `PORT=4199`, `GET /api/runs/active` → `{"count":0}` and `POST /api/stop-all` → `{"ok":true,"stopped":0}` (stop the server by PID). Append `## Result`.
