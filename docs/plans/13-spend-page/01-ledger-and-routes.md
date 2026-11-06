# 13/01 — Spend ledger, hook, routes, tests (server)

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: plans 11 and 12 done · Parallel with: 13/02 (disjoint: this slice owns `lib/` and `server.js`, 13/02 owns `public/`)

## Decisions you need
S1, S2, S3, S4 — run `grep -E '^\| (S1|S2|S3|S4) ' 00-README.md`.

## Read first
- `lib/history.js`: `constructor(room, {file})`, `record()` (the end of it, just before `this.save()` and the `broadcast`), `SHELF_ITEMS`.
- `server.js`: where `History`/`room.history` is created and the `/api/history` routes; the POST pattern of `/api/dismiss` (~336); `readBody`, `send`.
- `lib/history.test.mjs` (from plan 12) for the temp-file test style.

## Scope (files you own)
`lib/spend.js` (new), `lib/spend.test.mjs` (new), `lib/history.js`, `server.js`.

## Tasks
1. **`lib/spend.js` (S1, S3).** Implement `Spend` with `add`, `setLimit`, `snapshot(now = Date.now())` (returns the S4 body without `note`), load/save with temp-file-then-rename, 400-day prune, 2000-key cap. Keep money as plain numbers; round only in `snapshot` (4 decimals).
2. **History hook (S2, S3).** In `record()`, after the item is built and before `save()`: `const r = this.spend?.add({...}); if (r?.crossed) this.room?.broadcast('spend:limit', { today: r.today, limit: r.limit });`. Add `spend = null` as a field in the constructor. Nothing else in `history.js` changes.
3. **Server (S2, S4).** Create `const spend = new Spend({})` next to the history setup, assign `room.history.spend = spend`, add `GET /api/spend` (add the exact `note`) and `POST /api/spend/limit` with the S4 validation (`Number.isFinite`, 0–10000, or `null`/empty string for off).
4. **Tests (`lib/spend.test.mjs`).** Cover every case in the README's first acceptance row, using fixed `at` timestamps (build them with `new Date(2026, 10, 3, 12).getTime()` so the local-date bucket is stable) and a temp `file`.

## Done when
`node --test lib/spend.test.mjs` and `node --test lib/*.test.mjs` pass; `node --check server.js lib/spend.js lib/history.js`; in a temp copy of the project (never the real `data/`), `PORT=4199` serves `/api/spend` with 30 `days` and the limit route accepts `5`/`null` and rejects `-1` and `"abc"`; `git diff --stat` lists only the files in Scope. Append `## Result`.
