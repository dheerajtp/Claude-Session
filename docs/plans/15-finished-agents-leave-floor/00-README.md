# 15 — Finished agents really leave the floor

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../10-finished-leaves-floor/00-README.md`](../10-finished-leaves-floor/00-README.md) (the 10 s sweep that this plan stops late events from defeating)

## Goal
- When Claude says the work is finished, no avatar for that work stays on the Office floor: not the main session, and not its helpers (the `slice-worker` avatars stuck on WALKING).
- Late hook events (a helper's `SubagentStop`, a stray `PostToolUse`, a helper hand-back message) can no longer turn a finished session back into THINKING and hide it from the 10 s sweep.
- Real new work still brings a session back onto the floor immediately.

## Why it happens (found in `lib/hook-bridge.js`)
- `Stop` sets `state:'done'` + `endedAt`. The sweep in `reapStaleHooks` only removes a session whose state is still `done`.
- Straggler events then overwrite the state: `SubagentStop` → `thinking`, `PostToolUse` → `thinking`, `SubagentStart` → `working`, a helper hand-back `UserPromptSubmit` → `thinking` with `endedAt:null`. The session is never `done` again, so it stays (relay-nest showed THINKING after "finished").
- Helper avatars are created `walking` on a `Task`/`Agent` `PreToolUse` and only retired by a matching `PostToolUse`. If that never matches (parallel or background helpers) they stay `walking` with `endedAt` null, and the sweep keeps every helper whose boss is still on the floor.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| G1 | **Late-event guard.** In `lib/hook-bridge.js` `handleHook`: when the session's agent has `state === 'done'` and `endedAt` set, the events `SubagentStart`, `SubagentStop`, `PostToolUse`, `PostToolUseFailure`, `PreCompact` and a non-`plain` `UserPromptSubmit` (helper or job hand-back) keep `state:'done'`, `endedAt` and `activity` unchanged: drop `state`, `activity` and `endedAt` from their patch, still add the note/log lines and counters. `Notification` already behaves this way (plan 10 F3). |
| G2 | **New work revives.** `PreToolUse` and a `plain` `UserPromptSubmit` on a `done` session set `endedAt: null` (state becomes `working`/`blocked` as today), so the next `Stop` ends it again and the sweep cannot remove it mid-work. |
| G3 | **Stop ends helpers.** On `Stop` for a hook session, every agent with `parent === sessionId` and no `endedAt` becomes `state:'done'`, `endedAt: now`, `activity:'Finished when its boss finished'`; the matching `helperSeats` entries are deleted. Implement as one function `endHelpers(room, sid)` also called by `dropSeats` so session close uses the same path. |
| G4 | **SubagentStop ends one helper.** On `SubagentStop`, take `name = clip(String(body.agent_type \|\| ''), 18)`; the oldest live child (no `endedAt`) of that session whose `name` equals it gets `state:'done'`, `endedAt: now`, `activity:'Finished the job it was given'`, and its `helperSeats` entry is deleted. No match means do nothing. |
| G5 | **Helpers leave fast.** `HELPER_ON_FLOOR_MS` goes from `90 * 1000` to `15 * 1000`. In the sweep, a helper whose boss is missing is still removed at once; a helper whose boss is `done` with `endedAt` is also removed at once (the boss itself leaves at 10 s). |
| G6 | **Tests.** Extend `lib/hook-bridge.test.mjs` (plan 10's file) with the cases in the acceptance checklist; keep all five existing tests green. Export nothing new except what a test needs (`HELPER_ON_FLOOR_MS`). |
| G7 | **Out of scope.** Runs started from this page (source `claude`) and their helpers, the "Walked in from outside" card of a live session that has not been given a prompt yet, the client (`public/`), the Finished shelf, the 4 and 20 minute quiet/forgotten timers, closed-session timing (`CLOSED_ON_FLOOR_MS`). |

## Status
- [x] 01 — Late-event guard, helper retirement, sweep, tests (gated by orchestrator: node --test lib/*.test.mjs 36/36, node --check, diff vs Scope; no verify-slice.sh in this repo)
- [x] 02 — Acceptance (rows 1–5 PASS, row 6 MANUAL; see Known issues)

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | none | Sonnet | `lib/hook-bridge.js`, `lib/hook-bridge.test.mjs` |
| 02 | 01 | none | Haiku | `docs/plans/15-finished-agents-leave-floor/**` |

**Rules for every slice:** do not edit anything under `public/`, `server.js` or `lib/room.js`; keep plan 10's behaviour (10 s sweep, notification guard, 45 s native errors).

## Acceptance checklist
- [x] `node --test lib/hook-bridge.test.mjs` passes and includes: after `Stop`, a `SubagentStop`, a `PostToolUse` and a helper hand-back `UserPromptSubmit` each leave the session `done` with the same `endedAt`, and `reapStaleHooks` removes it after 10 s.
  - Evidence: 10/10 pass; test 'late events after Stop keep done and the same endedAt, and are swept' (line 62) ran — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/01-late-events-stay-done.txt
- [x] Test: after `Stop` then `PreToolUse`, the session is `working` with `endedAt` null and is not swept.
  - Evidence: test 'new work after Stop revives the session and it is not swept' (line 80) passes — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/02-new-work-revives.txt
- [x] Test: a `Task` `PreToolUse` seats a helper; `Stop` marks it `done`; it is removed by the sweep once older than `HELPER_ON_FLOOR_MS`, and at once when its boss is swept. A helper whose `PostToolUse` never arrives is covered by this.
  - Evidence: tests 'Stop ends helpers and they leave 15 s later' (105) and 'helper goes in the same pass as its swept boss' (118) pass; the test uses tool_name `Agent`, so a probe confirmed `Task` seating and the 15 s age threshold with a live boss — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/03-helpers-stop-sweep.txt, /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/03b-helper-probe.txt
- [x] Test: two helpers with different `agent_type`; `SubagentStop` for one ends only that one.
  - Evidence: test 'SubagentStop ends only the matching helper' (line 127) passes — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/04-subagentstop-one-helper.txt
- [x] `node --test lib/*.test.mjs` all pass; `node --check lib/hook-bridge.js` passes.
  - Evidence: 36/36 pass, exit 0; node --check exit 0 — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/05-all-tests-check.txt
- [ ] MANUAL: restart the server, run a plan with parallel `slice-worker` helpers, and when Claude says it is complete the avatars and cards are gone within about 15 s; the Finished shelf still lists the run.

## Known issues
- MANUAL (acceptance row 6, evidence note /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/06-manual-live-run.txt): live run check.
  1. Restart the server (stop the running `node server.js` and start it again) and open the Office page in a browser.
  2. In a Claude Code session with hooks pointed at this server, run a plan that dispatches two or more parallel `slice-worker` helpers.
  3. Confirm that the helper avatars appear on the floor while the helpers work.
  4. When Claude says the work is complete (the `Stop` event), start a stopwatch.
  5. Within about 15 s, the main session avatar, every `slice-worker` avatar and their cards should be gone, and none should be left on WALKING or THINKING.
  6. Open the Finished shelf and check that it still lists the run.
- Test-strength note (row 3, not a failure): 'Stop ends helpers and they leave 15 s later' sets the boss `done`, so the helper is removed by the boss-done rule, not by its age. The `HELPER_ON_FLOOR_MS` age path and `Task` (rather than `Agent`) seating are covered only by the acceptance probe /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/03b-helper-probe.txt, not by the test file.
