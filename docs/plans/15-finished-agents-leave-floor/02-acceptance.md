# 15/02 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 15/01 · Parallel with: none

## Decisions you need
G1–G7 — run `grep -E '^\| G[0-9] ' 00-README.md`.

## Read first
- `00-README.md` `## Acceptance checklist`.

## Scope (files you own)
`docs/plans/15-finished-agents-leave-floor/00-README.md` (tick rows, add evidence), `docs/plans/15-finished-agents-leave-floor/02-acceptance.md`.

## Tasks
1. Run each checklist row; save raw output under the scratchpad and cite absolute paths. List the test names that ran for rows 1–4.
2. Mark PASS / FAIL / MANUAL; list manual steps under `## Known issues` in the README. Do not edit code.

## Done when
Every row has a mark and evidence. Append `## Result`.

## Result
- Status: DONE (5 PASS, 1 MANUAL, 0 FAIL)
- Tests that ran (lib/hook-bridge.test.mjs, 10/10 pass): the five plan-10 tests, plus 'late events after Stop keep done and the same endedAt, and are swept', 'new work after Stop revives the session and it is not swept', 'Stop ends helpers and they leave 15 s later', 'helper goes in the same pass as its swept boss' and 'SubagentStop ends only the matching helper'.
- Rows:
  1. Late events keep done → PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/01-late-events-stay-done.txt
  2. PreToolUse revives → PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/02-new-work-revives.txt
  3. Helper seated, ended by Stop, swept → PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/03-helpers-stop-sweep.txt, plus probe /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/03b-helper-probe.txt (Task tool_name, 15 s age path)
  4. SubagentStop ends one helper → PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/04-subagentstop-one-helper.txt
  5. node --test lib/*.test.mjs 36/36 and node --check pass → PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/05-all-tests-check.txt
  6. Live run → MANUAL — steps under README `## Known issues`
- Raw run: /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/311ea3e5-1a3b-4e04-9e99-eef448446e1b/scratchpad/evidence15/run-hook-bridge.txt
- Files changed: 00-README.md, 02-acceptance.md (no code edits)
