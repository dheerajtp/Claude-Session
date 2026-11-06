# 12/01 — Ledger fields, pin, routes, tests (server)

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: 12/02 (disjoint: this slice owns `lib/` and `server.js`, 12/02 owns `public/`) and plan 11

## Decisions you need
H1, H2, H3 — run `grep -E '^\| (H1|H2|H3) ' 00-README.md`.

## Read first
- `lib/history.js` whole file (140 lines): constants, `constructor`/`load`, `record` (builds `item`, replaces by `key`, sorts, trims, `save`), `forget`, `snapshot`, `save`.
- `server.js`: the `/api/history` line (~229); how `projects` is available there (`projects.insideRoot(raw)` returns `{path, rel}` or `{error}`); how POST routes read JSON (`readBody(req)`) and answer (`send(res, status, obj)`), e.g. the `/api/dismiss` block (~336).
- `lib/images.test.mjs` first 15 lines for the test style.

## Scope (files you own)
`lib/history.js`, `lib/history.test.mjs` (new), `server.js`.

## Tasks
1. **History (H1, H2).** Add the constructor option `{file}` (store as `this.file`, use it in `load` and `save` instead of the module `CACHE`), the three item fields, the keep-`pinned` rule when replacing, `MAX_ITEMS = 200`, `SHELF_ITEMS = 60`, trimming that never drops pinned items, `snapshot(limit = SHELF_ITEMS)`, and `setPinned(key, pinned)`. Export `SHELF_ITEMS`.
2. **Routes (H3).** In `server.js` add `GET /api/history/all` and `POST /api/history/pin` exactly as specified (use `projects.insideRoot(item.cwd || '')` and take `.rel`, `null` when it has `.error`). Keep the existing `/api/history` route.
3. **Tests (`lib/history.test.mjs`).** Use `fs.mkdtempSync` for `file`, a stub room `{broadcast(){}}`, and `h.record({id, sessionId, name, cwd, prompt, ...}, 'finished')`. Cases: fields stored; re-record keeps `pinned`; 205 records + 2 pinned keep both pinned and total 200 or fewer unpinned plus pinned; `snapshot()` length ≤ 60; `setPinned` true then false for unknown key.

## Done when
`node --test lib/history.test.mjs` passes; `node --test lib/*.test.mjs` all pass; `node --check server.js lib/history.js`; with `PORT=4199` and a temp HOME (copy nothing from the real `data/`; the temp run must not write the real `data/history.json`, so start the server from a temp copy or point the check at the unit tests if it cannot be isolated), `GET /api/history/all` and the pin route behave as in H3. `git diff --stat` lists only the three files in Scope. Append `## Result`.

## Result
- Status: DONE
- Files changed: lib/history.js, lib/history.test.mjs, server.js
- Checks: node --test lib/*.test.mjs PASS (31); node --check PASS; live routes on temp copy (PORT 4197) PASS (200/404/400)
- Notes: snapshot(Infinity) used for /api/history/all; real data/ untouched.
