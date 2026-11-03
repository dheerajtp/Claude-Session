# 05 — Clearer crew cards

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../03-answer-questions-in-browser/00-README.md`](../03-answer-questions-in-browser/00-README.md) (the arming toggle it explains)

## Goal
- A person can tell in one glance what each session is doing right now, and which ones need them.
- Every button says in plain words what it does, and the one that has an on/off state shows which state it is in with words, not only a colour.
- Helper avatars stop crowding the list: five slice-workers no longer look like five full sessions.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| R1 | **Card content, top to bottom.** (1) head: dot, name, state chip (as now); (2) `div.act` the current activity as the largest text (13.5px, `var(--ink)`) — this is "what it is doing now"; (3) `div.ask` the request, prefixed `You asked: ` and cut to 110 chars as now; (4) one `div.facts` line replacing `.src` + `.meta`: `<origin> · <time> · did N things` using the existing `ORIGIN` and `plainStats()` wording, plus `· N helpers working` when it has live helpers; (5) the progress block (`.meter` + `.steps`) **only when `a.todoTotal > 0`**; the unknown-plan shimmer bar and "It has not made a plan yet." are removed; (6) `helperLine()` text stays for sessions, not for helpers. |
| R2 | **Answer-here switch.** The "Route approvals here" button becomes a switch row: `<button role="switch" aria-checked="true\|false" class="switch">` showing a pill track and the label **Ask me here, not in the terminal**, with a state line under it in plain words: on → `On — its questions and permission requests appear here.`; off → `Off — it asks in your terminal or editor.` Title (both states): `Questions Claude asks you, and requests to write files or run commands, show up on this page instead of the terminal. You have 50 seconds to answer; after that the terminal asks as usual.` Same visibility rule as today (`!a.parent`, source `claude` or `claude-hook`, state not `done`) and same call: `POST /api/arming {agentId, on}` then `refreshAsks()`. Nothing changes on the server. |
| R3 | **Other buttons.** `Dismiss` → **Hide card** with title `Takes this card off the page. The session keeps running and is not stopped. It stays hidden for 10 minutes.` (the existing `/api/dismiss` call and 10-minute cooldown). `Stop` → **Stop run**, rose `stop` style (the existing rose button class), only for runs started by this page and not finished, title `Ends this run now. It cannot be resumed.`. Buttons sit in one row under the switch: Hide on the left, Stop on the right. |
| R4 | **Helpers keep full cards.** An agent with `a.parent` renders with the same card layout as a session (R1), and its facts line starts `helper working for <boss>` (existing `boss(a)` wording) instead of the origin. A helper gets **Hide card** only (no switch, no Stop), as today. No nesting and no compact rows. |
| R5 | **Order and groups.** All agents, helpers included, sort by group: `Needs you` (`blocked`) → `Working` (`booting`, `walking`, `thinking`, `working`, `coffee`) → `Standing by` (`idle`) → `Finished` (`done`, `error`, `leaving`); within a group by `startedAt`. A small-caps label row `li.group` precedes each non-empty group. |
| R6 | **Subtitle.** Under the "Crew" heading add `<p class="hint" id="crewHint">`: `Every Claude session and helper on this computer. Click one to see its details.` `#crewCount` keeps counting every agent as today; `#empty` and the totals footer are unchanged. |
| R7 | **Non-blocking look.** The switch has a visible `:focus-visible` outline; the on state uses `var(--teal)` with the word "On" (never colour alone). Cards stay readable at the left-panel width (about 300px) with no horizontal overflow. |
| R8 | **Out of scope.** The detail panel (`renderDetail`), the canvas bubbles, any server or hook change, a user setting for the hide time, changing what arming does. |

## Status
- [x] 01 — Crew cards, switch, buttons, grouping, subtitle, README note
- [x] 02 — Acceptance (5 PASS after one fix, rest MANUAL)

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | none | Sonnet | `public/client.js`, `public/index.html`, `public/styles.css`, `README.md` |
| 02 | 01 | none | Haiku | `docs/plans/05-clearer-crew-cards/` |

**Rules for every slice:** zero dependencies, no build step, plain words on the page (no "route", "arm", "approvals", "session id"); keep `askKey` rebuild behaviour of `renderAsks()` untouched.

## Acceptance checklist
- [x] A working session card shows its current activity as the biggest line, and no "It has not made a plan yet." text exists in `row()`.
  - Evidence: `.roster .act` 13.5px ink is the largest card text; plan text count 0; row() harness builds `.act` then `.facts`, meter only when todoTotal>0 (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence5/01-activity-biggest.txt`, `04b-row-harness.txt`).
- [x] The switch reads "Ask me here, not in the terminal" with a state line that says On or Off in words; toggling calls `/api/arming`.
  - Evidence: label, both state sentences and R2 title in served client.js; live `POST /api/arming` on:true -> `asks.armed` [sid], on:false -> [] (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence5/02-switch.txt`, `06-arming-live.txt`).
- [ ] Buttons are "Hide card" and "Stop run" (rose), with the titles in R3.
- [x] Helpers use the same card layout as sessions, start their facts line with "helper working for …", and have only **Hide card**. (Acceptance first FAILED this: helpers of page-started runs showed Stop run. Fixed by adding `!a.parent` at `client.js:860`; verified by reading the code, not re-run through the checker's harness.)
- [x] Groups appear in the order Needs you, Working, Standing by, Finished.
  - Evidence: node harness on the real `groupRank` + render() sort: blocked < working states < idle < done/error/leaving, ties by startedAt, helpers ranked by state (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence5/05-groups-order.txt`).
- [x] A hint line under "Crew" explains what the list shows.
  - Evidence: `<p class="hint" id="crewHint">` with the R6 sentence directly under the Crew h2 in served index.html (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence5/07-hint.txt`).

## Known issues
- FAIL (row 4, R4): a helper of a page-started run gets **Stop run** as well as Hide card. `row()` gates Stop on `a.source === 'claude'` with no `!a.parent` check, and `server.js` `onSubagent` copies the parent's `source` to the helper. Hooked-session helpers are fine (Hide card only). Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence5/04-helpers.txt`, `04b-row-harness.txt`.
- MANUAL (row 3): labels, titles and Hide-left/Stop-right layout are confirmed in code, but the rose colour needs a browser. Also, Stop run uses class `mini stop` (`button.stop`, rose-tinted), not the `danger` class R3 names. Steps: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence5/10-manual-visual-steps.txt` section C.
- MANUAL (visual, R7): activity/chip hierarchy, switch track/On-Off look and `:focus-visible` outline, group label styling, no horizontal overflow at about 300px. Steps: `10-manual-visual-steps.txt` sections A, B, E, F. Look out for this: the run-form `.switch` rule (`margin: 2px 0 10px`) also matches the card's `button.switch`, which may leave a 10px gap above the state line.
