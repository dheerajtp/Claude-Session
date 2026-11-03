# 04/02 — Attach UI on the question card

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none (04/01 only for end-to-end) · Parallel with: 04/01 (disjoint files; follows the Y2/Y6 contract exactly)

## Decisions you need
Y2 (upload route), Y5 (limits), Y6 (answer payload), Y7 (send gating), Y8 (card UI), Y9 (words) — run `grep -E '^\| (Y2|Y5|Y6|Y7|Y8|Y9) ' 00-README.md`.

## Read first
- `public/client.js`: `askRow()` (~line 443; the question branch builds `.qopts` per question with a `.qother` text input at ~line 478 and a **Send answers** button), `collect(li, ask)` (~line 521), `answerAsk()` (~line 549), and `renderAsks()` with `askKey` (the card is only rebuilt when the open-ask set changes, so state kept in the DOM survives).
- `public/styles.css`: `.qopts`, `.qopt`, `.qother` rules (~lines 259–265).

## Scope (files you own)
`public/client.js`, `public/styles.css`.

## Tasks
1. **Per-question attachments.** In the question branch of `askRow()`, below each question's `.qother` input add `div.qpics` containing: a `<button type="button" class="mini ghost">Attach image</button> + hidden `<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple>`, a muted hint "Pictures must be PNG, JPEG, GIF or WebP, up to 5 MB, 3 per question" and a `div.qthumbs`. State lives on the question block (`block._pics = [{imageId, name, url}]`, `block._busy = 0`).
2. **Ways to add.** Button/file input; **paste** (a `paste` listener on the card `li`: any clipboard item whose type starts with `image/` goes to the question whose block contains the focused element, else the first question); **drag-and-drop** onto the question block (`dragover` preventDefault + highlight class `drop`, `drop` reads `dataTransfer.files`). Show "Drop a picture here" as the hint while dragging. Ignore non-image files with the inline message "That is not a picture". Stop adding at 3 per question (message "3 pictures at most for one question").
3. **Upload (Y2).** For each file: `FileReader.readAsDataURL` → strip the `data:…;base64,` prefix → `fetch('/api/ask-image', post({askId: ask.id, name: file.name, data}))`. While in flight increment `block._busy` and show "Uploading…" on a placeholder thumbnail; on `200` push `{imageId, name, url: URL.createObjectURL(file)}` and draw the thumbnail (60px square, `object-fit: cover`, file name below, a **×** button that removes it from `_pics` and revokes the object URL); on error show `j.error` (or the status) in a `p.qerr` under that question and add no thumbnail.
4. **Gating and payload (Y7, Y6).** Extend the existing re-check so **Send answers** is disabled while any block has `_busy > 0`, and a question counts as answered when it has a pick, typed text, or at least one picture. Update `collect()` accordingly (a question with only pictures contributes no answer text; keep the function returning `null` while a question is unanswered) and make the Send click post `{askId, decision:'allow', answers, images: {[q.question]: [imageId, …]}}` (omit questions without pictures; omit `images` if none). The "Answer in the terminal" button sends neither.
5. **Styles.** `.qpics`, `.qthumbs` (flex-wrap, gap 6px), `.qthumb` (relative; 60px image; small × button top-right), `.qpics .drop` (teal dashed border), `.qerr` (rose, 11.5px). No horizontal overflow at the panel width.
6. Plain words only (Y9). Don't touch `renderAsks()`' rebuild rule, approvals, or anything outside the question branch.

## Done when
`node --check public/client.js` passes; with `PORT=4198 node server.js` (stop it) `/` returns 200; and you list in `## Result` that the thumbnails, paste and drag-and-drop were not run in a browser. Append `## Result`.

## Result
- Status: DONE
- Files changed: public/client.js, public/styles.css
- Checks: node --check public/client.js → PASS; PORT=4198 node server.js, GET / → 200 (server stopped) → PASS
- Notes: Thumbnails, paste and drag-and-drop were NOT run in a browser. The `.qopts` div is the "question block" (holds _pics/_busy); drop class is on `.qpics` (`.qpics.drop`). collect() now returns {} possibly empty-text for picture-only questions; Send is enabled via a truthy object, and the server (Y6) supplies the "See the attached image" text.
