# 02/02 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 02/01 · Parallel with: none

## Decisions you need
All acceptance rows — see `## Acceptance checklist` in `00-README.md`.

## Read first
`00-README.md` (Acceptance checklist), `public/legend.js`, `public/index.html`, `renderFeed()` in `public/client.js`.

## Scope (files you own)
`docs/plans/02-colour-legend-in-header/00-README.md` (tick boxes only), evidence files outside the repo.

## Tasks
1. Start the server with `PORT=4198 node server.js` (port 4173 may hold an older server; don't touch it). Never touch `~/.claude/settings.json`.
2. Rows checkable without a browser: `curl -s 127.0.0.1:4198/ | grep -c 'id="legendBar"'` is 1 and the old hard-coded colour list is gone; `legend.js` lists the seven states and imports `stateColor`; `curl /legend.js` is 200; extract `renderFeed` logic by reading it and confirm the single-agent and two-agent cases (a tiny node harness copying the grouping rule is fine).
3. Visual rows (strip visible without scrolling, tooltips, wrap at 800px, no horizontal scroll) are MANUAL: list them as numbered steps for the person.

## Done when
Each row marked PASS / FAIL / MANUAL with an evidence file path. Stop the server. Append `## Result`.

## Result
- Status: DONE (3 PASS, 3 MANUAL, 0 FAIL)
- Row 1 strip visible + no hex — MANUAL (automated parts pass) — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence2/01-strip-and-no-hex.txt
- Row 2 dot colour = stateColor — PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence2/02-chip-colours.txt
- Row 3 hover/focus sentence — MANUAL — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence2/03-tooltips.txt
- Row 4 left card — PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence2/04-left-card.txt
- Row 5 wrap at 800px — MANUAL — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence2/05-wrap-800.txt
- Row 6 feed names — PASS — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence2/06-feed-grouping.txt
- Notes: server ran on PORT=4198 and was stopped (port 4173 untouched). Unscoped `.chip` CSS clash logged under Known issues in 00-README.md.
