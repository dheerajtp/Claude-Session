# 15/01 — Late-event guard, helper retirement, sweep, tests

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: none

## Decisions you need
G1 (late-event guard), G2 (new work revives), G3 (Stop ends helpers), G4 (SubagentStop ends one helper), G5 (helper timing and sweep), G6 (tests) — run `grep -E '^\| G[1-6] ' 00-README.md`.

## Read first
- `lib/hook-bridge.js`: `handleHook` (~lines 36–122: how `turn.patch` is merged and `room.upsert` called), `seatHelper` / `retireHelper` / `dropSeats` (~126–180), `TURNS` handlers `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `PreCompact`, `Stop`, `Notification` (the existing guard for ended turns is the model), and `reapStaleHooks` (~478–527).
- `lib/room.js`: `upsert`, `touch`, `remove` (a helper is an agent with `parent` = boss id; for hook sessions the boss id is the session id).
- `server.js` `room.onSubagent` (~line 47): helpers are named `clip(subagent_type, 18)` and start `walking`. Read only; do not edit.
- `lib/hook-bridge.test.mjs`: the `ev`, `get`, `age`, `finished` helpers and the five existing tests.

## Scope (files you own)
`lib/hook-bridge.js`, `lib/hook-bridge.test.mjs`.

## Tasks
1. **Late-event guard (G1).** In `handleHook`, after `const turn = TURNS[event]?.(...)` and before building `patch`, if `agent && agent.state === 'done' && agent.endedAt` and `event` is one of `SubagentStart`, `SubagentStop`, `PostToolUse`, `PostToolUseFailure`, `PreCompact`, or (`UserPromptSubmit` and the handler classed the prompt as non-`plain`), delete `state`, `activity` and `endedAt` from `turn.patch`. Notes, logs, counters stay. For the `UserPromptSubmit` case, add an explicit marker on the returned turn (e.g. `turn.handback = true` in the `kind !== 'plain'` branch) instead of re-deriving it. Do not guard `SessionStart`, `Stop`, `SessionEnd`, a plain prompt or `PreToolUse`.
2. **New work revives (G2).** In the `PreToolUse` handler patch add `endedAt: null`; confirm the `plain` `UserPromptSubmit` patch already clears it (add `endedAt: null` if it does not).
3. **endHelpers (G3).** Add `endHelpers(room, sid, activity)`: for every agent with `parent === sid` and no `endedAt`, `room.touch(id, { state:'done', activity, endedAt: Date.now() })`; delete every `helperSeats` entry whose key starts with `sid + '\u0000'`. Make `dropSeats` call it (activity `'Finished when its session closed'`) so there is one path. Call `endHelpers(room, sid, 'Finished when its boss finished')` from `handleHook` when `event === 'Stop'` (after the upsert, hook sessions only).
4. **SubagentStop (G4).** In `handleHook` when `event === 'SubagentStop'`: `name = clip(String(body.agent_type || ''), 18)`; find the oldest (lowest `startedAt`) child of `sid` with no `endedAt` and `name === name`; if found, `room.touch` it to `done` with `activity:'Finished the job it was given'` and `endedAt: Date.now()`, and delete its `helperSeats` entry (search values for its id). No match: do nothing.
5. **Sweep (G5).** `HELPER_ON_FLOOR_MS = 15 * 1000`; export it. In the `a.parent` branch of `reapStaleHooks` also remove the helper when `boss.state === 'done' && boss.endedAt`. Keep the rest of the sweep untouched.
6. **Tests (G6)** in `lib/hook-bridge.test.mjs`, using the existing helpers (extend `ev` only if you need a second session):
   - after `finished()`, each of `SubagentStop`, `PostToolUse`, and a helper hand-back `UserPromptSubmit` (prompt text that `humanize` classes as `helper`; read `lib/plain.js` for the exact shape) leaves state `done` with the same `endedAt`, and `age(room, 11_000)` + `reapStaleHooks` removes it;
   - `Stop` then `PreToolUse` → state `working`, `endedAt` null, `age` does nothing, not swept;
   - `PreToolUse` with `tool_name:'Agent'`, `tool_use_id:'t1'`, `tool_input:{subagent_type:'slice-worker', description:'x'}` needs `room.onSubagent`; set `room.onSubagent` in the test to a small stub that upserts a `walking` child with `parent`, `source:'claude-hook'`, name `slice-worker`, and returns its id. Then `Stop` → child `done`; `age` the child's `endedAt` by `HELPER_ON_FLOOR_MS + 1000` → swept; and a second case where the boss is swept first → child gone in the same pass;
   - two helpers (`slice-worker`, `Explore`): `SubagentStop` with `agent_type:'Explore'` ends only the `Explore` one.

## Done when
`node --test lib/hook-bridge.test.mjs` passes with the original five tests unchanged plus the new ones; `node --test lib/*.test.mjs` passes; `node --check lib/hook-bridge.js`. No file outside Scope changed (`git status --short`). Append `## Result`.

## Result
- Status: DONE
- Files changed: lib/hook-bridge.js, lib/hook-bridge.test.mjs
- Checks: node --test lib/*.test.mjs → PASS (36/36); node --check lib/hook-bridge.js → PASS; git status shows only the two Scope files
- Notes: PostToolUse handler shadowed `words()` with a local number (would throw); renamed local to `nWords`. endHelpers/SubagentStop run after the upsert in handleHook; handback marker is `turn.handback`.
