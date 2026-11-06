# 14/02 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 14/01 · Parallel with: none

## Decisions you need
C1–C6 — run `grep -E '^\| C[0-9] ' 00-README.md`.

## Read first
- `00-README.md` `## Acceptance checklist`.

## Scope (files you own)
`docs/plans/14-workbench-controls-tidy/00-README.md` (tick rows, add evidence), `docs/plans/14-workbench-controls-tidy/02-acceptance.md`.

## Tasks
1. Run each row, save raw output under the scratchpad and cite absolute paths. Run any server only from a temp copy of the project on `PORT=4199`, with a stub `claude` binary (a shell script that sleeps) if you need a running run; stop everything by PID. Do not touch the user's running server.
2. Mark PASS / FAIL / MANUAL; list manual steps under `## Known issues`. Do not edit code.

## Done when
Every row has a mark and evidence. Append `## Result`.
