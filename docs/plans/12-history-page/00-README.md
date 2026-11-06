# 12 — History page

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../05-clearer-crew-cards/00-README.md`](../05-clearer-crew-cards/00-README.md) (the Finished ledger) · Parallel with plan 11 (disjoint files) · Used by: plans 13 and 14 (same workbench files, so they run after this)

## Goal
- A new **History** tab in the workbench (next to Projects, Sessions and Claude & usage) lists every finished run the office remembers, so the main office screen stays uncluttered.
- A person can search it, filter it, pin the runs that matter, **follow up** on a finished session, and **run again** with the same words.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| H1 | **Ledger fields** (`lib/history.js`). Each item gains `sessionId` (`agent.sessionId \|\| null`), `ask` (the full request, `String(agent.prompt \|\| '').slice(0, 2000)` or `null`) and `pinned` (boolean, default `false`; a replacement row for the same `key` keeps the old `pinned`). `MAX_ITEMS` 60 → 200; new `SHELF_ITEMS = 60` and `snapshot(limit = SHELF_ITEMS)` so the main-page shelf still gets 60. Trimming keeps every pinned item and then the newest unpinned ones up to `MAX_ITEMS`. The constructor becomes `constructor(room, {file} = {})` with `file` defaulting to the current `data/history.json` path, so tests never touch real data. |
| H2 | **Pinning.** `History.setPinned(key, pinned)` returns `true` and saves, or `false` when the key is unknown. |
| H3 | **Routes** (`server.js`, next to `/api/history`). `GET /api/history/all` → `{items, count}`, newest first, each item `{...item, rel, canFollowUp, canRunAgain}` where `rel = projects.insideRoot(item.cwd).rel` (or `null` on error / no root), `canFollowUp = Boolean(item.sessionId && rel !== null)`, `canRunAgain = Boolean(item.ask && rel !== null)`. `POST /api/history/pin` with JSON `{key, pinned}` → `200 {ok:true}`, `404 {error:'that run is not in the history'}`, `400` if `key` is not a string. The existing `GET /api/history` is unchanged apart from H1's default limit. |
| H4 | **Tab.** Workbench tab button `#wbTabHistory` labelled **History** between Sessions and Claude & usage; pane `<section id="wbHistory" class="wbpane" hidden>`; `showTab`/`wireTabs`/`openSheet` in `workbench.js` learn the `'history'` tab. Opening the tab fetches `/api/history/all`. |
| H5 | **Pane layout.** A `.rootbar` with `#wbHistLine` (`N finished runs` / `Nothing has finished yet.`) and a **Refresh** button (`.rootacts`). Under it one controls row: search `<input id="wbHistSearch" placeholder="Search what you asked or what it did">` (case-insensitive over `name`, `folder`, `ask`, `prompt`, `report`; 150 ms debounce), `<select id="wbHistOutcome">` (All outcomes, Finished the job, Stopped with a problem, Went quiet, Session closed, You stopped it), `<select id="wbHistFolder">` (All folders + distinct `folder` values), checkbox **Pinned only**. The list shows pinned first, then newest. |
| H6 | **Card.** Name, folder, outcome chip (words from `OUTCOMES`: `finished the job`, `session closed`, `stopped with a problem`, `you stopped it`, `went quiet`), `You asked: …` clipped to 160 chars, the report clipped to 220, a facts line (`time ago · took X · N things done · $0.12 · 31k tokens`, omitting parts that are zero), and buttons **Pin / Unpin**, **Follow up**, **Run again**. A disabled button has a `title` saying why (`This session did not report an id, so it cannot be carried on.` / `This folder is outside your projects folder.`). |
| H7 | **Follow up and Run again never auto-send.** Follow up: `state.sessRel = item.rel; showTab(sheetTab = 'sessions'); await loadSessions(item.rel); openLaunchForm({id: item.sessionId, label: item.name})`. Run again: the same navigation then `openLaunchForm(null)` and `$('wbSessPrompt').value = item.ask`. The person edits and presses the existing send button. |
| H8 | **Out of scope.** Deleting history rows, export, the main page, cost totals (plan 13), stop-all (plan 14). |

## Assumptions (not yet approved)
- History keeps 200 runs (was 60); pinned runs are never dropped.
- "Run again" prefills the Sessions form instead of sending at once, so nothing runs by accident.

## Status
- [x] 01 — Ledger fields, pin, routes, tests (server) (gated by orchestrator: lib tests 31/31 incl. 5 new, node --check, diff vs Scope; no verify-slice.sh or root lint in this repo)
- [x] 02 — History tab and pane (web) (gated by orchestrator: node --check, diff vs Scope, markup greps; plus a follow-up fixing "things done" to count `toolCalls` like the main shelf; no verify-slice.sh or root lint in this repo)
- [ ] 03 — Acceptance

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | 12/02 (disjoint), plan 11 | Sonnet | `lib/history.js`, `lib/history.test.mjs` (new), `server.js` |
| 02 | none (contract fixed by H3) | 12/01, plan 11 | Sonnet | `public/index.html`, `public/workbench.js`, `public/styles.css` |
| 03 | 01, 02 | none | Haiku | `docs/plans/12-history-page/**` |

**Rules for every slice:** do not touch `public/client.js` or `public/notify.js` (plan 11); the main office page gets no new controls.

## Acceptance checklist
- [x] `node --test lib/history.test.mjs` passes on a temp file: new fields stored; replacement keeps `pinned`; pinned survive trimming past 200; `snapshot()` returns at most 60; `setPinned` true/false. (5/5 pass; evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence12/01-history-unit-tests.txt`)
- [x] With the server on `PORT=4199` and a temp HOME: `GET /api/history/all` lists items with `rel`, `canFollowUp`, `canRunAgain`; `POST /api/history/pin` returns 200 for a known key and 404 for an unknown one and the pin shows in the next list. (Temp copy, sess-inside pinned 200, no-such-run 404, key 42 400, pin visible in next `/api/history/all`; evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence12/02-routes-live.txt`)
- [x] Served page has `#wbTabHistory`, `#wbHistory`, `#wbHistSearch`, `#wbHistOutcome`, `#wbHistFolder`; `node --check public/workbench.js`; the existing `node --test lib/*.test.mjs` still pass. (All ids served 1x each; check ok; lib suite 31/31; evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence12/03b-served-page.txt`, `.../03a-workbench-check.txt`, `.../02-all-lib-tests.txt`)
- [x] A node harness of the pane's filter function shows search, outcome, folder and pinned-only filters and the pinned-first order. (20/20 checks incl. facts line "things done" from `toolCalls`; evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence12/04-pane-filter-harness.txt`)
- [ ] MANUAL: History tab lists past runs; search and filters narrow the list; Pin keeps a run at the top after a reload; Follow up opens the Sessions form for that session; Run again opens a new-session form with the old words in it; the main office screen has no new controls.

## Known issues
- 12/03 row 5 is MANUAL (not run by the verifier; needs a browser and a human judgement). Steps: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence12/05-manual-steps.txt`. Until a person ticks it, this plan is not fully accepted.
