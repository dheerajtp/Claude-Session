# 11/01 — notify.js and client.js changes with tests

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: plan 12 (disjoint files)

## Decisions you need
L1–L5 — run `grep -E '^\| (L1|L2|L3|L4|L5) ' 00-README.md`.

## Read first
- `public/notify.js` (100 lines, whole file): `KEY`, `on`, `audio`, `setAlerts`, `chime`, `alert`, `announceFinished`, `announceNeedsYou`.
- `public/client.js`: imports at line 5; the `hello` branch in `connect()` (~lines 110–118); `banner()` (~line 186); the alerts button wiring (~lines 246–266).
- `lib/asks.test.mjs` first 15 lines for the `node:test` style (tests here are ES modules too; `public/*.js` are ES modules so they import directly in node).

## Scope (files you own)
`public/notify.js`, `public/client.js`, `public/notify.test.mjs` (new).

## Tasks
1. **Environment-safe module.** `notify.js` runs `localStorage`/`document` code at import. Make the top-level code tolerate missing globals (`typeof document === 'undefined'` guards, existing try/catch for localStorage) so the test can import it after defining fakes on `globalThis`.
2. **Unlock (L1).** Add `export async function unlockAlerts()` (create/resume `audio`, request permission when `'default'`) and, when `on` is true at load and `document` exists, register the one-time listeners calling it.
3. **Catch-up (L2, L3).** Add `export function catchUp({history, asks}, say)`, `export function popupState()` and the module-level `const announcedAsks = new Set()`; make `announceNeedsYou` add `ask.id` and `announceFinished` advance `office.seen` (never move it backwards).
4. **Wiring (L5, L4).** In `client.js` import `catchUp, popupState`; in the `hello` branch after `setShelf`/`setAsks` call `catchUp(...)` then, if `alertsOn() && popupState() !== 'granted'` and not yet shown this load (`let popupNoted = false`), call `banner(...)` with the exact L4 text for the state (`kind` omitted for the warning, `'ok'` not used). Do not change anything else in `client.js`.
5. **Tests (`public/notify.test.mjs`).** Use `node:test`; define `globalThis.localStorage` (Map-backed), `document` (`addEventListener` stub, `hidden: false`, `title`), `window` (with `addEventListener`), `Notification` (permission field, `requestPermission` spy) before `await import('./notify.js')`. Cover every case in the README's first acceptance row.

## Done when
`node --test public/notify.test.mjs` passes; `node --check public/notify.js public/client.js`; the existing `node --test lib/*.test.mjs` still pass; `git diff --stat` lists only the three files in Scope. Append `## Result`.

## Result
- Status: DONE
- Files changed: public/notify.js, public/client.js, public/notify.test.mjs
- Checks: node --test public/notify.test.mjs PASS; node --check PASS; lib tests see below; diff limited to Scope PASS
- Notes: popupState returns unsupported if Notification missing; setAlerts left unchanged (duplicates unlockAlerts audio code).
