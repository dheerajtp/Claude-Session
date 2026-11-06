# 10/02 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 10/01 · Parallel with: none

## Decisions you need
F1–F5 — run `grep -E '^\| F[0-9] ' 00-README.md`.

## Read first
- `00-README.md` `## Acceptance checklist`.

## Scope (files you own)
`docs/plans/10-finished-leaves-floor/00-README.md` (tick rows, add evidence), `docs/plans/10-finished-leaves-floor/02-acceptance.md`.

## Tasks
1. Run each checklist row; save raw output under the scratchpad and cite absolute paths. Show the test names that ran.
2. Mark PASS / FAIL / MANUAL; list manual steps under `## Known issues`. Do not edit code.

## Done when
Every row has a mark and evidence. Append `## Result`.

## Result
- Status: DONE (every row has a mark; row 4 is MANUAL)
- Row 1 (hook-bridge tests): PASS — 5/5 pass, names and exports in `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence10/00-test-names-and-exports.txt` and `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence10/01-hook-bridge-tests.txt`; idle_prompt sweep checked ad hoc in `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence10/04-idle-prompt-sweep-adhoc.txt`.
- Row 2 (images/asks/hook-install tests): PASS — 21/21, `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence10/02-other-tests.txt`.
- Row 3 (interval 5_000, node --check): PASS — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence10/03-interval-and-syntax.txt`.
- Row 4 (manual restart and watch): MANUAL — steps in `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence10/05-manual-row4-steps.txt` and `## Known issues` of `00-README.md`.
- Notes: no verify-slice.sh or root lint in this repo; no code, config or server changes; no server started, stopped or restarted. The 45 s error boundary is asserted as 20 s stays and 46 s removed, not at the exact boundary. The `## Status` line for 02 in 00-README.md is left unticked until row 4 is done by a person.
