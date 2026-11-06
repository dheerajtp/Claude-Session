# 14 — Workbench controls and tidy-up

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../09-tidy-action-buttons/00-README.md`](../09-tidy-action-buttons/00-README.md) (its lowercase-label side effect) · **Run after plan 13** (shared files: `public/index.html`, `public/workbench.js`, `server.js`)

## Goal
- Every button in the workbench action rows reads like a button: no lowercase leftovers from plan 09.
- A person can stop everything that was started from this page with one deliberate action, from the Sessions tab, not from the busy office screen.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| C1 | **Labels.** In `public/index.html` change the labels inside the `.rootacts` groups: `choose folder` → **Choose folder**, `go up` → **Go up**, `new folder` → **New folder**, `ask Claude again` → **Ask Claude again**. Ids, titles and handlers do not change. (`New session` and `Refresh` are already correct.) |
| C2 | **Active runs route.** `server.js`: `GET /api/runs/active` → `{count}` = number of entries in `runs` whose `run.stopped` is falsy and which have not finished (use the same flags `/api/stop` and the sweep use: `!run.stopped` and the run's agent state is not `done`/`error`; if `ClaudeRun` exposes a `running`/`child` flag use that instead and note it in `## Result`). |
| C3 | **Stop-all route.** `POST /api/stop-all` (no body needed) calls `run.stop()` on every run counted by C2 and schedules `runs.delete(run.id)` after 6 s like `/api/stop`; replies `200 {ok:true, stopped:n}`. It never touches sessions started in an editor or terminal (hooks cannot stop those). |
| C4 | **Button.** In the Sessions pane `.rootacts` add `<button class="mini" id="wbSessStopAll" type="button">Stop all runs from this page</button>` with `title="Stops every run that was started from this page. Sessions started in your editor or terminal are not touched."`. It is disabled with that title replaced by `Nothing started from this page is running.` when the count is 0. The count is read on opening the Sessions tab, after Refresh, and every 5 s while that tab is visible (clear the timer when it is hidden). |
| C5 | **Two clicks.** First click changes the label to **Click again to stop N runs** (N from C2) for 4 seconds, then reverts; the second click inside that time calls C3 and shows `Stopped N runs.` in the Sessions note line (`note('wbSessNote', ...)`) for the usual duration. The button uses the neutral style (not teal). |
| C6 | **Out of scope.** Stopping hook sessions, a stop-all on the main office screen, pausing, any History or Spend change. |

## Status
- [ ] 01 — Labels, active-runs and stop-all routes, Sessions-tab button
- [ ] 02 — Acceptance

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | plan 13 done | none | Sonnet | `public/index.html`, `public/workbench.js`, `public/styles.css`, `server.js` |
| 02 | 01 | none | Haiku | `docs/plans/14-workbench-controls-tidy/**` |

**Rules for every slice:** do not touch `public/client.js` or `public/notify.js`; the main office screen gets no new controls.

## Acceptance checklist
- [ ] Served `index.html` has `Choose folder`, `Go up`, `New folder`, `Ask Claude again`, `Stop all runs from this page`; the old lowercase labels are gone from the `.rootacts` groups.
- [ ] In a temp copy of the project on `PORT=4199`: `GET /api/runs/active` returns `{count:0}`; `POST /api/stop-all` returns `{ok:true, stopped:0}`; with a fake running run injected through a node harness of the route logic (or a stub `claude` binary that sleeps), count is 1 and stop-all returns `stopped:1` and then count is 0.
- [ ] `node --check` passes on `server.js` and `public/workbench.js`; `node --test lib/*.test.mjs` still pass.
- [ ] MANUAL: Sessions tab shows the button disabled when nothing runs; start a run, the button enables; one click shows "Click again to stop 1 runs" (or "1 run") and reverts after 4 s; a second click stops it and the note says so.
