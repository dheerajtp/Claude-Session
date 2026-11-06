# 12/03 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 12/01, 12/02 · Parallel with: none

## Decisions you need
H1–H8 — run `grep -E '^\| H[0-9] ' 00-README.md`.

## Read first
- `00-README.md` `## Acceptance checklist`.

## Scope (files you own)
`docs/plans/12-history-page/00-README.md` (tick rows, add evidence), `docs/plans/12-history-page/03-acceptance.md`.

## Tasks
1. Run each checklist row, save raw output under the scratchpad and cite absolute paths. Never start the server against the real `data/` folder: copy the repo's `lib`, `public`, `server.js`, `hooks` and a sample `data/history.json` into a temp dir, run there on `PORT=4199`, stop by PID. Do not touch the user's running server.
2. Mark PASS / FAIL / MANUAL; list manual steps under `## Known issues`. Do not edit code.

## Done when
Every row has a mark and evidence. Append `## Result`.

## Result
- Status: DONE with one MANUAL row (no FAIL). Rows 1–4 PASS, row 5 MANUAL. Every row has a mark and evidence.
- Row 1 PASS: `node --test lib/history.test.mjs` 5/5 — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence12/01-history-unit-tests.txt`
- Row 2 PASS: temp copy on PORT=4199 (temp HOME, sample data; real `data/` untouched); `/api/history/all` fields present; pin 200 / unknown 404 / non-string 400; pin visible in next list — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence12/02-routes-live.txt`
- Row 3 PASS: served `/` has all five ids (plus wbHistLine, wbHistList, wbHistPinned, wbHistRefresh); `node --check public/workbench.js` ok; `node --test lib/*.test.mjs` 31/31 — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence12/03b-served-page.txt`, `.../03a-workbench-check.txt`, `.../02-all-lib-tests.txt`
- Row 4 PASS: node harness extracted from `public/workbench.js` (no DOM): 20/20 — search, outcome, folder, pinned-only, combined filters, pinned-first then newest, facts line "N things done" from toolCalls — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence12/04-pane-filter-harness.txt`
- Row 5 MANUAL: browser steps (tab, search/filters, pin after reload, follow up and run again prefill without sending, no new controls on main screen) — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence12/05-manual-steps.txt`
- Notes: the harness fixture was first built from the temp data file, which the row-2 pin had already changed; corrected to the pre-pin fixture. No code, config or real-data edits. Temp server stopped by PID (21235 and 21661), nothing listening on 4199.
