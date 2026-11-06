# 11 — Alerts you can trust

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../03-answer-questions-in-browser/00-README.md`](../03-answer-questions-in-browser/00-README.md) (alerts and the "needs you" announcement) · Parallel with plan 12 (disjoint files)

## Goal
- With **Alerts on**, a person is told about every finish and every question, including ones that happened while the page was reloading or disconnected.
- The chime works after a page reload without the person having to switch alerts off and on.
- When the browser blocks desktop pop-ups, the page says so in plain words instead of staying silent.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| L1 | **Unlock on first touch.** `public/notify.js`: if alerts are on when the module loads, add one-time `pointerdown` and `keydown` listeners on `document` (`{once:true, capture:true}`) that create/resume the `AudioContext` (reuse the creation code from `setAlerts`) and, if `Notification.permission === 'default'`, call `Notification.requestPermission()` (allowed because it runs inside a user gesture). Export `unlockAlerts()` doing exactly that so tests can call it. |
| L2 | **Catch-up on reconnect.** New export `catchUp({history, asks}, say)` in `notify.js`. Storage key `office.seen` (ms epoch string, try/catch like `KEY`). Rules, only when alerts are on: if `office.seen` is missing, set it to `Date.now()` and announce nothing (first run); otherwise take history items with `finishedAt > seen`, `outcome !== 'stopped'`, and `finishedAt` within the last 6 hours; if there is exactly one, call `announceFinished(item, say)`; if several, call `alert('N sessions finished while you were away', 'Open the Finished shelf to read them.', {say})`; then set `office.seen` to the newest `finishedAt` seen. `announceFinished` also advances `office.seen` to `item.finishedAt` for live finishes. |
| L3 | **Missed questions.** `catchUp` also takes `asks.open` (array): every open ask of `kind === 'question'` whose `id` is not in the in-memory `announcedAsks` Set calls `announceNeedsYou(say, ask)` once and is added to the Set. `announceNeedsYou` adds the id to the Set when called live, so a reconnect never repeats it. |
| L4 | **Blocked pop-ups, in words.** New export `popupState()` → `'granted' \| 'default' \| 'denied' \| 'unsupported'`. In `client.js`, on `hello`, if alerts are on and `popupState() !== 'granted'`, show once per page load the banner: default → `Alerts are on. Click anywhere on the page once to let your browser show pop-ups too.`; denied/unsupported → `Alerts are on, but your browser is blocking pop-ups. You will still hear a chime and see the tab title change. Allow notifications for this site in your browser settings to get pop-ups.` |
| L5 | **Wiring.** In `client.js` the `hello` branch (~line 111) calls `catchUp({history: msg.history, asks: msg.asks}, banner)` after `setShelf`/`setAsks`, then the L4 check. `msg.history` is `{items, count}` and `msg.asks` is the shape `setAsks` already receives (`open` array). No server change. |
| L6 | **Out of scope.** Sound choices, snooze, per-folder alerts, email or phone push, any `public/index.html` change. |

## Status
- [x] 01 — notify.js and client.js changes with tests (gated by orchestrator: notify tests 7/7, lib tests 26/26, node --check, diff vs Scope; no verify-slice.sh or root lint in this repo)
- [ ] 02 — Acceptance

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | plan 12 (disjoint: plan 12 never touches `public/notify.js` or `public/client.js`) | Sonnet | `public/notify.js`, `public/client.js`, `public/notify.test.mjs` (new) |
| 02 | 01 | none | Haiku | `docs/plans/11-alerts-you-can-trust/**` |

**Rules for every slice:** keep every existing export of `notify.js`; every storage access in try/catch; nothing may throw when `Notification`, `AudioContext` or `localStorage` are missing.

## Acceptance checklist
- [x] `node --test public/notify.test.mjs` passes with fake `window`/`document`/`localStorage`/`Notification`: first run announces nothing and stores `office.seen`; one missed finish calls `announceFinished`; three missed finishes give one summary alert; a `stopped` item and items older than 6 h are ignored; an open question ask is announced once across two `catchUp` calls; `unlockAlerts` resumes audio and requests permission only when it is `default`.
  - Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence11/01-notify-tests.txt` — 7 tests, 7 pass, 0 fail, exit 0 (test names and bodies read and matched to each claim).
- [x] `node --check` passes on `public/notify.js` and `public/client.js`.
  - Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence11/02-node-check.txt` — both exit 0.
- [x] `grep -n "catchUp\|popupState" public/client.js` shows the `hello` wiring.
  - Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence11/03-client-wiring-grep.txt` — `catchUp` at line 119 and the `popupState` banner check at lines 120-122, both inside the `msg.kind === 'hello'` branch.
- [ ] MANUAL: turn alerts on, reload, click once, finish a session while the tab is in the background: you hear the chime and get a pop-up; stop the server, let a session finish, restart it: "finished while you were away" appears; with notifications blocked for the site the banner explains how to allow them.

## Known issues
- MANUAL (checklist row 4, not automatable here): browser-level chime, pop-up, offline catch-up and blocked-permission banner. Steps are in `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence11/04-manual-steps.txt`. A person must run them; the row stays unticked until then.
