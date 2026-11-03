# 03/02 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 03/01 · Parallel with: none

## Decisions you need
All acceptance rows — see `## Acceptance checklist` in `00-README.md`.

## Read first
`00-README.md` (Acceptance checklist), `lib/asks.test.mjs`, the question branch of `askRow()` in `public/client.js`.

## Scope (files you own)
`docs/plans/03-answer-questions-in-browser/00-README.md` (tick boxes only), evidence files outside the repo.

## Tasks
1. Run `node --test lib/asks.test.mjs` and cite the test names that cover each server row.
2. End to end on a spare port: `PORT=4198 node server.js`; open an SSE client (`curl -N 127.0.0.1:4198/api/stream` in the background so a page is "connected"); `POST /api/arming {agentId, on:true}` after seating a fake session with a `SessionStart` hook post; post an `AskUserQuestion` `PreToolUse` hook with two questions (one `multiSelect`) in the background; read `/api/state` `.asks.open` to get the ask id; `POST /api/ask` with answers including a 250-char and a 400-char typed answer; show the hook response's `updatedInput.answers` (lengths 250 and 300). Also post the same hook for an unarmed session and a `Bash` hook and show they return immediately with no `hookSpecificOutput`. Stop the server and the SSE client. Never touch `~/.claude/settings.json`.
3. Card rows (several questions, pick-many, typed answer, Send disabled until complete, alert names the question) need a browser: mark MANUAL with numbered steps for the person.

## Done when
Every row is PASS / FAIL / MANUAL with an evidence path. Append `## Result`.

## Result
- Status: DONE. 5 PASS, 1 MANUAL, 0 FAIL. The README has no `## Acceptance checklist`, so these rows come from this slice's Tasks and nothing was ticked (see Known issues).
- Server: `needs()` asks only for armed sessions. Test `needs() only asks for armed sessions`: PASS (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence3/01-unit-tests.txt`).
- Server: typed answers keep up to 300 chars. Test `typed answers keep up to 300 chars`: PASS (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence3/01-unit-tests.txt`).
- Server: multiSelect arrays stay arrays. Test `multiSelect arrays stay arrays`: PASS (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence3/01-unit-tests.txt`). The hook-install tests (6/6) and `node --check` on asks/client/notify also pass.
- E2E on PORT=4198 with a temp HOME and an SSE client connected: an armed `AskUserQuestion` with 2 questions (1 multiSelect) was held and appeared in `asks.open`. `POST /api/ask` returned `updatedInput.answers` lengths of 250 and [1, 300], and in a second ask 250 and 300 (a 400-char sentence): PASS (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence3/02-e2e.txt`, `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence3/02-held-response.json`).
- E2E: an unarmed `AskUserQuestion` and an unarmed `Bash` hook returned in about 0.025s with no `hookSpecificOutput`: PASS (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence3/02-e2e.txt`). Note that an armed `Bash` is held by the existing approval flow. That is expected under X2, and my first run showed it.
- Card rows (several questions, pick-many, typed answer, Send disabled until complete, alert names the question): MANUAL. Steps are in `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence3/04-manual-card-rows.txt`.
- Cleanup: the server and SSE curl were stopped, port 4198 is free, port 4173 was not touched, and the real ~/.claude/settings.json was not touched.
