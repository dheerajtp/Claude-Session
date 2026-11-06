# 10/01 — Sweep timing, notification guard, tests

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: none

## Decisions you need
F1–F4 — run `grep -E '^\| (F1|F2|F3|F4) ' 00-README.md`.

## Read first
- `lib/hook-bridge.js`: constants at lines ~22–30; the `Notification` handler (~line 293, with the existing `idle_prompt`/`auth_success` early return); `Stop` (~327, sets `endedAt`); `reapStaleHooks` (~476–530, the first `if` block is the done/error sweep).
- `lib/room.js`: `Room` constructor, `upsert`, `touch`, `remove`, `agents` (a Map).
- `lib/asks.test.mjs` top 20 lines: how tests import and build things (copy the style; tests use `node:test` and `node:assert/strict`).
- `server.js` ~line 552: the `reapStaleHooks` interval.

## Scope (files you own)
`lib/hook-bridge.js`, `lib/hook-bridge.test.mjs` (new), `server.js`.

## Tasks
1. **Constants (F1, F4).** Set `TURN_DONE_ON_FLOOR_MS = 10 * 1000`, add `ERROR_ON_FLOOR_MS = 45 * 1000`, export both. In the first sweep `if` of `reapStaleHooks` use `TURN_DONE_ON_FLOOR_MS` when `a.state === 'done'` and `ERROR_ON_FLOOR_MS` when `a.state === 'error' && a.source === 'claude'`; the rest of that block is unchanged.
2. **Interval (F2).** In `server.js` change the `reapStaleHooks` interval to `5_000`.
3. **Guard (F3).** Change the handler to `Notification(body, agent)`. Right after computing `plain`, add: `if (type === 'idle_prompt' || type === 'auth_success' || (agent && agent.endedAt)) return { patch: {}, note: { kind: 'sys', … }, log: { kind: 'sys', … } };` (reuse the existing early-return body and its comment, updated to mention finished turns).
4. **Tests (`lib/hook-bridge.test.mjs`).** Use `new Room()` from `lib/room.js`, `handleHook(room, {session_id, cwd, hook_event_name, …}, {})` and `reapStaleHooks(room, {})`. Cases: (a) UserPromptSubmit then Stop → state `done`; set `agent.endedAt = Date.now() - 11_000` through `room.upsert` and call `reapStaleHooks` → agent gone; (b) `endedAt = Date.now() - 5_000` → still present; (c) `idle_prompt` after Stop → state still `done`; (d) `permission_prompt` after Stop → state still `done` and swept once `endedAt` is 11 s old; (e) `permission_prompt` during a live turn (after UserPromptSubmit, no Stop) → state `blocked`; (f) a native error run (`source: 'claude'`, `state: 'error'`, `endedAt` 20 s ago) is still present, and gone at 46 s.

## Done when
`node --test lib/hook-bridge.test.mjs` passes (all cases above); `node --test lib/images.test.mjs lib/asks.test.mjs lib/hook-install.test.mjs` still pass; `node --check server.js lib/hook-bridge.js`; `git diff --stat` lists only the three files in Scope. Append `## Result`.

## Result
- Status: DONE
- Files changed: lib/hook-bridge.js, lib/hook-bridge.test.mjs (new), server.js
- Checks: hook-bridge tests 5/5 PASS; images/asks/hook-install tests PASS; node --check PASS; diff limited to Scope (plus pre-existing docs dir)
- Notes: Test (f) uses a direct room.upsert for the error agent; the 5 tests cover cases a-f (a/b combined).
