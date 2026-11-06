# 06/02 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 06/01 · Parallel with: none

## Decisions you need
K1–K5 — run `grep -E '^\| (K1|K2|K3|K4|K5) ' 00-README.md`.

## Read first
- `00-README.md` `## Acceptance checklist`.
- `05-clearer-crew-cards/02-acceptance.md` as the format for evidence and known issues.

## Scope (files you own)
`docs/plans/06-clear-rewrite-button/00-README.md` (tick boxes, add evidence), `docs/plans/06-clear-rewrite-button/02-acceptance.md`.

## Tasks
1. Run every row of the README acceptance checklist; save raw output to the scratchpad and cite its absolute path under each row.
2. Mark each row PASS / FAIL / MANUAL; list failures and manual steps under `## Known issues`. Do not edit code.

## Done when
Every checklist row has a mark and evidence. Append `## Result`.

## Result
- Status: DONE (3 PASS, 1 MANUAL)
- Evidence dir: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence6/`
- Row 1 served index.html label + K2 note, old strings gone — PASS — 01-served-index.txt
- Row 2 no "Sharpen prompt"/"Sharpening" in client.js — PASS — 02-grep-sharpen.txt
- Row 3 setRewriteUi harness shows exact K3 strings — PASS — 03-setRewriteUi-harness.txt
- Row 4 note wraps at ~300px, readable — MANUAL — 04-manual-wrap-steps.txt
- Server on 4199 (temp HOME) stopped by PID 4192 — 05-server-stopped.txt. No code was edited.
