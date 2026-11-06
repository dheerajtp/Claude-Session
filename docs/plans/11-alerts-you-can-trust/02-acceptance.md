# 11/02 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 11/01 · Parallel with: none

## Decisions you need
L1–L6 — run `grep -E '^\| L[0-9] ' 00-README.md`.

## Read first
- `00-README.md` `## Acceptance checklist`.

## Scope (files you own)
`docs/plans/11-alerts-you-can-trust/00-README.md` (tick rows, add evidence), `docs/plans/11-alerts-you-can-trust/02-acceptance.md`.

## Tasks
1. Run each checklist row, save raw output under the scratchpad and cite absolute paths. Show test names and pass counts. Do not start, stop or restart any server.
2. Mark PASS / FAIL / MANUAL; list manual steps under `## Known issues`. Do not edit code.

## Done when
Every row has a mark and evidence. Append `## Result`.

## Result
- Status: DONE with one MANUAL row (verifier run 2026-11-03)
- Row 1 PASS — `node --test public/notify.test.mjs`: 7 tests, 7 pass, 0 fail. Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence11/01-notify-tests.txt`
- Row 2 PASS — `node --check` on `public/notify.js` and `public/client.js`, both exit 0. Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence11/02-node-check.txt`
- Row 3 PASS — `catchUp` at `public/client.js:119` and `popupState` banner at lines 120-122, inside the `hello` branch. Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence11/03-client-wiring-grep.txt`
- Row 4 MANUAL — steps in `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence11/04-manual-steps.txt` and under `## Known issues` in the README.
- No code, config or server changes. No servers started, stopped or restarted.
- Note: `## Status` in the README still shows `02 — Acceptance` unticked. Left for the orchestrator.
