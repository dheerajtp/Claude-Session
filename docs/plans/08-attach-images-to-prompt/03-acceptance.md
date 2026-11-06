# 08/03 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 08/01, 08/02 · Parallel with: none

## Decisions you need
P1–P8 — run `grep -E '^\| P[0-9] ' 00-README.md`.

## Read first
- `00-README.md` `## Acceptance checklist`.

## Scope (files you own)
`docs/plans/08-attach-images-to-prompt/00-README.md` (tick rows, add evidence), `docs/plans/08-attach-images-to-prompt/03-acceptance.md`.

## Tasks
1. Run each checklist row. Use `PORT=4199`, a temp HOME, and stop the server by PID. Create a real PNG for the upload test. Save raw output under the scratchpad and cite absolute paths.
2. Mark PASS / FAIL / MANUAL; list manual steps under `## Known issues`. Do not edit code.

## Done when
Every row has a mark and evidence. Append `## Result`.

## Result
- Status: DONE (4 PASS, 1 MANUAL, 0 FAIL)
- Row 1 unit tests — PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence8/01-unit-tests.txt
- Row 2 live routes (incl. /api/sessions/start bad id and >5 MB upload) — PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence8/02-live-routes.txt
- Row 3 served mount points + node --check x5 — PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence8/03-served-and-check.txt
- Row 4 payload harness — PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence8/04-payload-harness.txt
- Row 5 browser check — MANUAL — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence8/05-manual-browser.txt (steps in README Known issues)
- Notes: server ran with temp HOME on PORT=4199; it had already exited when stopped by PID (port confirmed free). Draft images are stored under os.tmpdir()/claude-office-images, not HOME. No code edited.
