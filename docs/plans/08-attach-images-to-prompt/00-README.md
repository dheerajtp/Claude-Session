# 08 — Attach images to the prompt

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../04-attach-images-to-answers/00-README.md`](../04-attach-images-to-answers/00-README.md) (reuses `lib/images.js`, its type check, 5 MB limit and 24 h sweep) · [`../06-clear-rewrite-button/00-README.md`](../06-clear-rewrite-button/00-README.md)

## Goal
- A person can attach pictures (button, paste or drag-and-drop) to "What to ask for" in **Send an agent to a desk** and in the workbench **session** prompt, and the agent receives them.
- Claude gets each picture as a file path it opens with its own Read tool, the same way plan 04 does for answers.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| P1 | **Delivery.** Pictures are saved to disk and the *server* appends their paths to the prompt before spawning the CLI; the page never sends paths. Appended text, exactly: `\n\nReference pictures — open each one with your Read tool before you start:\n- /abs/path1\n- /abs/path2`. Added after trimming the user's text, so the "You asked" card text still starts with the user's own words. Text is still required (an image alone is not a request). |
| P2 | **Upload route.** New `POST /api/prompt-image` with JSON `{name, data}` (`data` = base64, no prefix); body limit 8 MB (`readBody(req, 8 * 1024 * 1024)`). Saves with `images.save('draft', buf)`. Replies `200 {ok:true, imageId, name, bytes}`; `400 {error}` for bad base64 (same check and message as `/api/ask-image`) or anything `images.save` rejects (type by magic bytes, 5 MB). The existing too-big message mapping at `server.js` ~526 must also cover this route. |
| P3 | **Run payloads.** `POST /api/run` and `POST /api/sessions/start` accept `images: string[]` (imageIds from P2). Rules: at most 5 (`400 {error:"5 pictures at most"}`); every id must start with `draft-` and resolve with `images.pathFor` (else `400 {error:"a picture is no longer available, attach it again"}`); the check runs before the CLI is spawned. Missing or empty `images` behaves exactly as today. |
| P4 | **Helper.** `lib/images.js` gains `composePrompt(prompt, imageIds, images) -> {prompt} \| {error}` implementing P1 and P3 so both routes share it. The existing `Images` class and `ID_PATTERN` do not change. |
| P5 | **Web helper.** New `public/pictures.js` (ES module) exports `mountPictures(root, {max = 5, onChange})` returning `{ ids(): string[], busy(): boolean, clear() }`. It renders inside `root`: an **Attach image** button with a hidden multiple file input (`accept="image/png,image/jpeg,image/gif,image/webp"`), a hint, an error line and thumbnails (object URL, file name, remove **×**), reusing the CSS classes `qpics qthumbs qthumb qx qname qerr` (look and class names from plan 04). Uploads start at once to `/api/prompt-image`. Also wires paste (image on the clipboard while the prompt textarea has focus) and drag-and-drop onto the textarea; both go through the same upload path. Plan 04's ask-card code in `client.js` is **not** refactored. |
| P6 | **Where it appears.** Run form: directly under `#prompt`, above the `.promptbar` (Rewrite button). Workbench: directly under `#wbSessPrompt`, above its `.promptbar`. Each form gets its own `mountPictures` instance. **Run agent** and the workbench send button are disabled while `busy()` is true. On a successful run call `clear()`; on failure keep the thumbnails. The `images` array is added to both payloads (`client.js` run payload ~line 203, `workbench.js` ~line 698). |
| P7 | **Plain words (page text).** Button `Attach image`; hint `PNG, JPEG, GIF or WebP, up to 5 MB, 5 per request. You can also paste or drop a picture on the box.`; while uploading `Uploading…`; wrong type `That is not a picture`; over the cap `5 pictures at most`. No "path", "base64" or "attachment id" in visible text. |
| P8 | **Out of scope.** Other file types, image-only requests, the Rewrite button (it still rewrites only the text and leaves the pictures attached), permission prompts, keeping files longer than 24 h, editing or cropping. |

## Status
- [x] 01 — Server: upload route, `composePrompt`, `images` on both run routes (gated by orchestrator: diff vs Scope, `node --test lib/images.test.mjs` 7/7, node --check; no verify-slice.sh or root lint in this repo)
- [x] 02 — Web: `pictures.js`, both forms, send gating (gated by orchestrator: diff vs Scope, node --check x3, mount-point and payload greps)
- [x] 03 — Acceptance (4 PASS, 1 MANUAL)

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | 08/02 (disjoint: server vs public) | Sonnet | `server.js`, `lib/images.js`, `lib/images.test.mjs` |
| 02 | none (contract is fixed by P2/P3) | 08/01 | Sonnet | `public/pictures.js`, `public/index.html`, `public/client.js`, `public/workbench.js`, `public/styles.css` |
| 03 | 01, 02 | none | Haiku | `docs/plans/08-attach-images-to-prompt/**` |

**Rules for every slice:** do not change plan 04's ask-image code (`/api/ask-image`, the `picsBox` function in `client.js`, `Images` internals). Slice 02 does not edit `server.js` or `lib/`; slice 01 does not edit `public/`.

## Acceptance checklist
- [x] `node lib/images.test.mjs` (or the repo's way to run it) passes, including new `composePrompt` cases: no images unchanged; two ids give the exact P1 block; an unknown id, a non-`draft-` id and a 6th id each return the P3 error.
  - Evidence: `node --test lib/images.test.mjs` 7/7 pass, 3 composePrompt tests cover all cases — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence8/01-unit-tests.txt
- [x] With the server on `PORT=4199`: `POST /api/prompt-image` with a real PNG returns `{ok:true,imageId:"draft-…png"}`; with text bytes returns 400 "that is not a PNG, JPEG, GIF or WebP picture"; `POST /api/run` with `images:["draft-deadbeef.png"]` returns 400 "a picture is no longer available, attach it again" and starts no agent.
  - Evidence: live PORT=4199: PNG 200 draft-14350fea.png, text 400, /api/run and /api/sessions/start bad id 400, no child process, agent count unchanged; 5.5 MB 400 / 7 MB 413 "too big" — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence8/02-live-routes.txt
- [x] Served `index.html`/`pictures.js` contain `Attach image` under both prompt boxes' mount points; `node --check` passes on `public/pictures.js`, `public/client.js`, `public/workbench.js`, `server.js`, `lib/images.js`.
  - Evidence: #picsRun under #prompt, #picsSess under #wbSessPrompt, served pictures.js has 'Attach image'; node --check OK x5 — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence8/03-served-and-check.txt
- [x] A node harness over `composePrompt` and the payload builders shows `images` is sent only when non-empty.
  - Evidence: harness runs the real client.js/workbench.js image lines; `images` absent for [] and present for 1-2 ids — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence8/04-payload-harness.txt
- [ ] MANUAL: in the browser attach a screenshot by button, by paste and by drag on both forms; thumbnails show with ×; Run agent stays disabled while "Uploading…"; the started agent's first message shows it opened the picture.

## Known issues
- MANUAL (acceptance row 5): browser check of button, paste and drag on both forms, thumbnails with ×, Run agent disabled while "Uploading…", and the agent opening the picture. Steps in /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence8/05-manual-browser.txt:
  1. Start `PORT=4199 node server.js`, open http://127.0.0.1:4199/.
  2. Send an agent to a desk: type a prompt, click **Attach image**, pick a PNG. A thumbnail with name and × shows under the box, above the Rewrite bar.
  3. Copy a screenshot, focus the prompt box, press Cmd+V. A second thumbnail shows.
  4. Drag an image from Finder onto the prompt box. A third thumbnail shows.
  5. With a large image or DevTools throttling, check **Run agent** is disabled while "Uploading…" shows.
  6. Click × to remove one; try a .txt ("That is not a picture"); try a 6th ("5 pictures at most").
  7. Click Run agent: thumbnails clear; the agent's first steps Read each picture path.
  8. Repeat 2-7 in the workbench New session form with its send button.
- Note (not a failure): a request body over 8 MB to `/api/prompt-image` replies HTTP 413 with the same "that picture is too big (5 MB at most)" message; a 5-8 MB body replies 400. Both show the P2 message.
