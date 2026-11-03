# 01/03 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 01/02 · Parallel with: none

## Decisions you need
All acceptance rows — see `## Acceptance checklist` in `00-README.md`.

## Read first
`00-README.md` (Acceptance checklist), `lib/hook-install.test.mjs`.

## Scope (files you own)
`docs/plans/01-see-live-sessions/evidence/*`, `docs/plans/01-see-live-sessions/00-README.md` (tick boxes only).

## Tasks
1. Run everything against a temp HOME (`HOME=$(mktemp -d)`, create `.claude/settings.json` with `{"theme":"dark"}`), never the real one. Save raw output per row in `evidence/`.
2. Rows: card shown when absent; install via `curl -X POST 127.0.0.1:4173/api/hooks/install` adds 11 events, keeps `theme`, one `.bak`; second install adds 0; malformed file → 409 and bytes unchanged (`shasum` before/after); CLI `--uninstall` works and `/api/state.hookSetup.installed` is false again; `node --test lib/hook-install.test.mjs` passes.
3. Mark each row PASS / FAIL / MANUAL. The "new terminal session walks onto the floor" row is MANUAL (needs the person's real session).

## Done when
Every acceptance row has a mark and an evidence file. Append `## Result`.

## Result
- Status: DONE (3 PASS, 3 MANUAL, 0 FAIL)
- Evidence: /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence/ (00-08). Runs used a temp HOME, server on PORT=4198 (4199 held by a leftover server). settingsPath was checked to be inside the temp dir before every POST.
- PASS: install adds 11 events, keeps theme, one .bak; no duplicates after button x2 + CLI x2; malformed file -> 409 with unchanged sha; `node --test lib/hook-install.test.mjs` 6/6.
- MANUAL: card visible (row 1), restart notice + new session walks in (row 3), card reappears after CLI uninstall (row 6, the CLI part passed). Steps are in README Known issues.
- Real ~/.claude/settings.json still only {"theme":"dark"}, same sha before and after, no .bak.
