# 09/02 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 09/01 · Parallel with: none

## Decisions you need
B1–B5 — run `grep -E '^\| B[0-9] ' 00-README.md`.

## Read first
- `00-README.md` `## Acceptance checklist`.

## Scope (files you own)
`docs/plans/09-tidy-action-buttons/00-README.md` (tick rows, add evidence), `docs/plans/09-tidy-action-buttons/02-acceptance.md`.

## Tasks
1. Run each checklist row (`PORT=4199`, temp HOME, stop the server by PID); save raw output under the scratchpad and cite absolute paths.
2. Mark PASS / FAIL / MANUAL; list manual steps under `## Known issues`. Do not edit code.

## Done when
Every row has a mark and evidence. Append `## Result`.

## Result
- Status: DONE (3 rows PASS, 1 row MANUAL; no FAIL rows)
- Server: `HOME=<mktemp> PORT=4199 node server.js`, PID 11118, stopped by PID and confirmed gone (HTTP 000). Log: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence9/server-log.txt`, stop check: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence9/05-server-stop.txt`.
- Checks:
  - Row 1 (served labels and titles) → PASS. Served `/` identical to `public/index.html`; lines 270–271 have New session / Refresh and the B1 titles. Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence9/01-served-labels.txt`.
  - Row 2 (styles.css rules) → PASS. Served `/styles.css` identical to disk; all listed rules present at lines 115–116 and 378–383. Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence9/02-styles-rules.txt`.
  - Row 3 (git diff --stat) → PASS. Output: `public/index.html | 4`, `public/styles.css | 10`, 2 files changed. Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence9/03-git-diff-stat.txt`.
  - Row 4 (visual check) → MANUAL. Steps are in `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence9/04-manual-context.txt` and in README Known issues.
- Notes: the lowercase "new session" hit at line 88 of index.html is setup prose, not a button label. Projects and Usage buttons still have lowercase source labels (B5 scope, not changed). `tools/verify-slice.sh` and root lint not run (not present). No code edited.
