# 04/03 — Acceptance

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 04/01, 04/02 · Parallel with: none

## Decisions you need
All acceptance rows — see `## Acceptance checklist` in `00-README.md`.

## Read first
`00-README.md` (Acceptance checklist), `lib/images.test.mjs`, `lib/asks.test.mjs`.

## Scope (files you own)
`docs/plans/04-attach-images-to-answers/00-README.md` (tick boxes only), evidence files outside the repo.

## Tasks
1. Run the three test files and cite test names per row. Then end to end on `PORT=4198` with a temp `HOME` (never the real `~/.claude/settings.json`), as in `docs/plans/03-answer-questions-in-browser/02-acceptance.md` task 2: SSE client, `SessionEnd`-free fake session, arm it, post an `AskUserQuestion` hook in the background, read the ask id from `/api/state`.
2. Upload a real PNG (generate a 1×1 with node) to `/api/ask-image`; show the 200, the file under `$TMPDIR/claude-office-images` and `stat` mode 600. Show 400 for a text file named `x.png`, 400 for >5 MB, 404 for an unknown askId, 400 on the 13th image. Answer with `images` and show the held hook's `updatedInput.answers` containing `[image: /…png]`; image-only → `See the attached image:`; 4th image on a question ignored. Stop the server and SSE client.
3. Browser rows (button/paste/drag thumbnails, ×, Send gating) and the real-session row stay MANUAL with numbered steps.

## Done when
Every row has PASS / FAIL / MANUAL and an evidence path. Append `## Result`.

## Result
- Status: DONE. 5 PASS, 2 MANUAL, 0 FAIL.
- Unit tests: `node --test` on lib/images.test.mjs, lib/asks.test.mjs and lib/hook-install.test.mjs gives 18/18 pass (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/01-unit-tests.txt`).
- Row 1, PNG upload returns `imageId` and the file has mode 0600: PASS. 200, the file is `-rw-------` in a 0700 dir under `$TMPDIR/claude-office-images`, byte-identical to the source (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/02-e2e.txt`).
- Row 2, text `x.png` / over 5 MB / unknown askId: PASS. They returned 400, 400 and 404 (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/02-e2e.txt`).
- Row 3, `[image: …]` in the held hook's answers and the image-only "See the attached image:": PASS (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/02-e2e.txt`).
- Row 4, 4th image on a question ignored and 13th on an ask refused: PASS. 3 of 4 paths were kept; the 13th upload got 400 (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/02-e2e.txt`).
- Row 5, `sweep()` removes files over 24 h old: PASS. Test `sweep removes day-old files only` passes (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/03-sweep-unit.txt`).
- Extra: a 60 000-byte `/api/hook` POST returns HTTP 413 `that request is too big` with `Connection: close` (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/02-e2e.txt`).
- Row 6, browser attach UI: MANUAL (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/04-manual-attach-ui.txt`).
- Row 7, a real Claude session describes the image: MANUAL (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/05-manual-real-session.txt`).
- Cleanup: the server (pid 43252) and SSE curl (pid 43268) were stopped by PID, port 4198 is free, and port 4173 was untouched. A temp HOME and TMPDIR were used. The mtime of the real ~/.claude/settings.json is unchanged.
