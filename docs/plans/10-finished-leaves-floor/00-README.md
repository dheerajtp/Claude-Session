# 10 — Finished sessions leave the floor

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../05-clearer-crew-cards/00-README.md`](../05-clearer-crew-cards/00-README.md) (the Finished shelf keeps the record; the floor only shows live work)

## Goal
- A session that has finished disappears from the office floor and the Crew list about 10 seconds later; the banner, the alert and the Finished shelf remain.
- A stray Claude Code notification can never keep a finished session on the floor (or turn it back to "needs you").

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| F1 | **Timing.** In `lib/hook-bridge.js` change `TURN_DONE_ON_FLOOR_MS` from `45 * 1000` to `10 * 1000`. Applies to sessions whose state is `done` (hook sessions and page-started runs). Page-started runs in state `error` keep the old 45 s: add `ERROR_ON_FLOOR_MS = 45 * 1000` and use it in the sweep for `state === 'error'`. |
| F2 | **Sweep rate.** In `server.js` (~line 552) the `reapStaleHooks` interval goes from `15_000` to `5_000` so the 10 s rule is honoured within about 15 s at worst, usually 10–15 s. `.unref()` stays. |
| F3 | **Notification guard.** In the `Notification` handler of `lib/hook-bridge.js` take `(body, agent)`; if `agent && agent.endedAt` (the turn is over) return `{ patch: {}, note: {kind:'sys', ...}, log: {kind:'sys', ...} }` for **every** notification type, exactly like the existing idle/auth early return. Notifications on a live turn (`endedAt` null) behave as today (`permission_prompt` etc. → `blocked`). Keep the existing `idle_prompt`/`auth_success` early return too. |
| F4 | **Exports for tests.** Export the three duration constants (`TURN_DONE_ON_FLOOR_MS`, `ERROR_ON_FLOOR_MS`) from `lib/hook-bridge.js`; nothing else about the module's public surface changes. |
| F5 | **Out of scope.** Helpers (`HELPER_ON_FLOOR_MS`), closed sessions (`CLOSED_ON_FLOOR_MS`), the 4 and 20 minute quiet/forgotten timers, the Finished shelf, and any page (`public/`) change. |

## Status
- [x] 01 — Sweep timing, notification guard, tests (gated by orchestrator: hook-bridge tests 5/5, existing tests 21/21, node --check, diff vs Scope; no verify-slice.sh or root lint in this repo)
- [ ] 02 — Acceptance

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | none | Sonnet | `lib/hook-bridge.js`, `lib/hook-bridge.test.mjs` (new), `server.js` |
| 02 | 01 | none | Haiku | `docs/plans/10-finished-leaves-floor/**` |

**Rules for every slice:** do not edit anything under `public/`; keep the idle/auth fix already in `Notification`.

## Acceptance checklist
- [x] `node --test lib/hook-bridge.test.mjs` passes and includes: a `done` session older than 10 s is removed by `reapStaleHooks`; one younger than 10 s stays; a native `error` run stays until 45 s; a session that finished and then gets `idle_prompt` or `permission_prompt` stays `done` and is still swept at 10 s; a `permission_prompt` during a live turn still gives `blocked`.
  - Evidence: 5/5 pass (tests: "finished turn leaves the floor after 10 s, not before", "idle_prompt after Stop keeps state done", "permission_prompt after Stop keeps done and is swept", "permission_prompt during a live turn blocks", "native error run stays 45 s") — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence10/01-hook-bridge-tests.txt`. The idle_prompt sweep at 10 s is not in the test file; checked ad hoc: state stays `done` and the session is swept after 11 s — `.../evidence10/04-idle-prompt-sweep-adhoc.txt`.
- [x] `node --test lib/images.test.mjs lib/asks.test.mjs lib/hook-install.test.mjs` still pass.
  - Evidence: 21/21 pass, exit 0 — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence10/02-other-tests.txt`.
- [x] `grep -n "setInterval(() => reapStaleHooks" server.js` shows `5_000`; `node --check` passes on `server.js` and `lib/hook-bridge.js`.
  - Evidence: server.js:552 shows `5_000`; both `node --check` exit 0 — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence10/03-interval-and-syntax.txt`.
- [ ] MANUAL: restart the server, finish a Claude session, and watch the avatar and the Crew card leave about 10–15 s after the "finished" banner; the Finished shelf still lists it; no red NEEDS INPUT appears a minute later.

## Known issues
- MANUAL (checklist row 4, not run by the verifier; needs a browser and a live Claude session). Steps are in `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence10/05-manual-row4-steps.txt`. Short form: (1) restart the server yourself; (2) start a Claude session and let it finish; (3) time from the "finished" banner; (4) avatar and Crew card should leave in about 10–15 s; (5) the Finished shelf should still list it; (6) no red NEEDS INPUT a minute later. Record the seconds observed here.
