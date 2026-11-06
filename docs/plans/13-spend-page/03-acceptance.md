# 13/03 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 13/01, 13/02 · Parallel with: none

## Decisions you need
S1–S8 — run `grep -E '^\| S[0-9] ' 00-README.md`.

## Read first
- `00-README.md` `## Acceptance checklist`.

## Scope (files you own)
`docs/plans/13-spend-page/00-README.md` (tick rows, add evidence), `docs/plans/13-spend-page/03-acceptance.md`.

## Tasks
1. Run each row; save raw output under the scratchpad and cite absolute paths. Run any server only from a temp copy of the project (never against the real `data/`) on `PORT=4199` and stop it by PID. Do not touch the user's running server.
2. Mark PASS / FAIL / MANUAL; list manual steps under `## Known issues`. Do not edit code.

## Done when
Every row has a mark and evidence. Append `## Result`.
