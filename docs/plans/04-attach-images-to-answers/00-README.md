# 04 — Attach images to answers on the browser question card

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../03-answer-questions-in-browser/00-README.md`](../03-answer-questions-in-browser/00-README.md) (`lib/asks.js`, `askRow()` in `public/client.js`)

## Goal
- When answering Claude's question on the Agent Office page, the person can attach screenshots or pictures to any question, by button, paste or drag-and-drop.
- Claude receives each image as a file path inside that question's answer and opens it with its own Read tool.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| Y1 | **Delivery.** Hook answers are text only, so images are saved to disk and the answer carries the file path. `readAnswers()` output keeps its shape (`string \| string[]`). No change to `hooks/claude-office-bridge.sh`, the 50s window or the fall-through. |
| Y2 | **Upload route.** New `POST /api/ask-image` with JSON `{askId, name, data}` (`data` = base64, no data-URL prefix); body limit 8 MB (`readBody(req, 8 * 1024 * 1024)`). Replies `200 {ok:true, imageId, name, bytes}`. Errors: `404` if `askId` is not an open question ask, `400 {error}` for bad base64, over 5 MB decoded, an unsupported type, or the ask already holding 12 images. Only question asks accept images. |
| Y3 | **Type check.** Type is decided by magic bytes, never by name or client type: PNG, JPEG, GIF, WebP only. Stored extension comes from the detected type (`png jpg gif webp`). Anything else is `400 "that is not a PNG, JPEG, GIF or WebP picture"`. |
| Y4 | **Storage.** Folder `path.join(os.tmpdir(), 'claude-office-images')` (mode 0700), file `<askId>-<8 random hex>.<ext>` (mode 0600), `askId` sanitised to `[A-Za-z0-9_-]`. `imageId` is the file's base name. Files older than 24 h are deleted at server start and then hourly (`unref`'d timer). Nothing is deleted when an ask settles (Claude reads the file after the hook returns). New module `lib/images.js` exports `class Images { constructor({dir, now}); save(askId, buf) -> {imageId, path, bytes} \| {error}; pathFor(imageId) -> string \| null; sweep() }`. |
| Y5 | **Limits.** 5 MB per image, 3 images per question, 12 per ask. The per-question cap is enforced when the answer is read (extras ignored). |
| Y6 | **Answer shape.** `POST /api/ask` accepts an extra `images: {[questionText]: [imageId, ...]}`. For a question with images, each resolved absolute path is added to that question's answer: a string answer becomes `"<text> [image: /abs/path]"` (one ` [image: …]` per image, appended after the 300-char cut so paths are never clipped); an array answer gets one extra element `"[image: /abs/path]"` per image. With images but no text and no option, the answer is `"See the attached image: /abs/path"` (several: paths joined with `, `). Unknown `imageId`s, or ones not prefixed with this `askId`, are ignored. |
| Y7 | **Send gating.** An image alone counts as an answer for its question, so **Send answers** enables when every question has a pick, typed text or at least one image. |
| Y8 | **Card UI.** Under each question's typed-answer box: an **Attach image** button (file input `accept="image/png,image/jpeg,image/gif,image/webp"`, multiple), paste (image on the clipboard while the card is focused) and drag-and-drop onto the question block. Each attached image shows a thumbnail (object URL) with its file name and a remove **×**. Upload starts at once (Y2); a failed upload shows the server's `error` under that question and adds no thumbnail. **Send answers** stays disabled while any upload is in flight. Removing a thumbnail drops it from the payload (the file stays on disk until swept). |
| Y9 | **Plain words.** Page text: "Attach image", "Drop a picture here", "Pictures must be PNG, JPEG, GIF or WebP, up to 5 MB, 3 per question", "Uploading…". |
| Y10 | **Out of scope.** Images on permission prompts, other file types, cropping/editing, remembering images, non-local access, keeping files longer than 24 h. |

## Assumptions (not yet approved)
The run that drafted this plan could not ask questions, so it chose these. Say so and I will change them before the slices run:
- Images only on question cards, not permission prompts (Y10).
- Delivered as file paths Claude reads itself, since hook answers are text only (Y1).
- Limits 5 MB / 3 per question / 12 per ask, kept 24 h (Y4, Y5).

## Status
- [x] 01 — Image storage, upload route and answer merging (server)
- [x] 02 — Attach UI on the question card
- [x] 03 — Acceptance (5 PASS, 2 MANUAL)

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | 02 (contract fixed by Y2/Y6) | Sonnet | `lib/images.js`, `lib/images.test.mjs`, `lib/asks.js`, `lib/asks.test.mjs`, `server.js`, `README.md` |
| 02 | none (needs 01 only for end-to-end testing) | 01 | Sonnet | `public/client.js`, `public/styles.css` |
| 03 | 01, 02 | none | Opus + Haiku | `docs/plans/04-attach-images-to-answers/` |

**Rules for every slice:** zero dependencies, no build step, plain words on the page. Never touch the real `~/.claude/settings.json`; tests use temp dirs and a spare port (4198), not 4173. Slice 02 follows the Y2/Y6 contract exactly even if 01 has not landed.

## Acceptance checklist
- [x] Uploading a real PNG to `/api/ask-image` for an open question ask returns `imageId`, and the file exists under `claude-office-images` with mode 0600 (`02-e2e.txt`).
  - Evidence: HTTP 200 `imageId 4e55cc15-4cb1ec02.png`, file `-rw------- 600`, dir 700, identical to source (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/02-e2e.txt`).
- [x] A text file named `x.png`, an image over 5 MB, and an upload for an unknown `askId` are refused with 400, 400 and 404.
  - Evidence: HTTP 400 "not a PNG…", 400 "too big (5 MB at most)" for 5 MB+1, 404 for `nope-unknown` (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/02-e2e.txt`).
- [x] Answering with `images` makes the held hook return `updatedInput.answers` whose value contains `[image: /…/claude-office-images/…png]`; an image-only answer returns "See the attached image: …".
  - Evidence: `"Which colour?": "Blue [image: /…/claude-office-images/4e55cc15-4cb1ec02.png] …"`, `"Which extras?": "See the attached image: /…png"` (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/02-e2e.txt`).
- [x] A 4th image on one question is ignored; a 13th on one ask is refused (`02-e2e.txt`).
  - Evidence: 4 ids sent, 3 `[image:` in answer (4th id absent); uploads 1-12 → 200, 13th → 400 "already has 12 pictures" (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/02-e2e.txt`).
- [x] Files older than 24 h are removed by `sweep()` (unit test).
  - Evidence: test `sweep removes day-old files only` passes; 18/18 across the three test files (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/03-sweep-unit.txt`, `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/01-unit-tests.txt`).
- [ ] MANUAL — Attach by button, paste and drag-and-drop each show a thumbnail; × removes it; Send answers is disabled during upload and enabled for an image-only answer.
- [ ] MANUAL — A real Claude session receives the path and describes the image.

## Known issues
- MANUAL (not verified): attaching by button, paste and drag-and-drop, thumbnails, the × remove, and Send gating during upload and for an image-only answer. These need a browser. Steps: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/04-manual-attach-ui.txt`.
- MANUAL (not verified): a real Claude session receives the image path and describes the image. Steps: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence4/05-manual-real-session.txt`.
