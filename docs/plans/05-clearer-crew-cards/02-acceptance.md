# 05/02 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 05/01 · Parallel with: none

## Decisions you need
All acceptance rows — see `## Acceptance checklist` in `00-README.md`.

## Read first
`00-README.md` (Acceptance checklist), `row()` and `render()` in `public/client.js`, the Crew section of `public/index.html`.

## Scope (files you own)
`docs/plans/05-clearer-crew-cards/00-README.md` (tick boxes only), evidence files outside the repo.

## Tasks
1. Static checks with grep/sed on the served files (`PORT=4198 node server.js`, temp `HOME`, stop it by PID; never touch port 4173 or the real `~/.claude/settings.json`): `row()` has no "It has not made a plan yet." text and builds `.facts`; the switch label text "Ask me here, not in the terminal" and both state sentences are in `client.js`; buttons "Hide card" and "Stop run" exist and the titles match R3; no "Route approvals" or "Dismiss" label remains; `#crewHint` is in `index.html`.
2. Behaviour in node: copy the group-rank sort from `render()` into a tiny harness and show that `blocked` < working states < `idle` < `done/error/leaving`, ties by `startedAt`, and that helpers are ranked like any agent.
3. Live check of the arming call: post a `SessionStart` hook for a fake session, `POST /api/arming {agentId, on:true}` then `/api/state` shows it in `asks.armed`; `on:false` removes it (this is what the switch calls).
4. Everything visual (chip/activity hierarchy, switch look and On/Off words, group labels, red Stop run, no horizontal overflow at ~300px) is MANUAL: give the person numbered steps.

## Done when
Every row has PASS / FAIL / MANUAL and an evidence path. Append `## Result`.

## Result
- Status: FAIL — 1 row failed
- Evidence dir: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence5/`
- Row 1 activity biggest line, no plan text in row() — PASS — 01-activity-biggest.txt, 04b-row-harness.txt
- Row 2 switch label + On/Off words + /api/arming — PASS — 02-switch.txt, 06-arming-live.txt (live: armed [] -> [sid] -> [])
- Row 3 Hide card / Stop run (rose) + R3 titles — MANUAL — 03-buttons.txt (labels and titles match, no "Route approvals"/"Dismiss" left; Stop uses class `stop` not `danger`, colour needs a browser)
- Row 4 helpers same layout, "helper working for …", only Hide card — FAIL — 04-helpers.txt, 04b-row-harness.txt (helper of a page-started run inherits source `claude` and also gets Stop run)
- Row 5 group order — PASS — 05-groups-order.txt
- Row 6 Crew hint — PASS — 07-hint.txt
- Extra: `.meta` rules still in styles.css (used 7x in client.js); 13.5px/ink only under `.roster .act` — PASS — 08-extra-meta-act-css.txt
- Visual (hierarchy, switch look/focus, group labels, red Stop, ~300px no overflow) — MANUAL — 10-manual-visual-steps.txt
- Server on 4198 (temp HOME) stopped by PID 47210 — 09-server-stopped.txt. No code was edited.
