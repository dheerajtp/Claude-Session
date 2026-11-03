# 04/01 — Image storage, upload route and answer merging (server)

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: 04/02 (disjoint files; contract fixed by Y2/Y6)

## Decisions you need
Y1–Y6, Y10 — run `grep -E '^\| (Y1|Y2|Y3|Y4|Y5|Y6|Y10) ' 00-README.md`.

## Read first
- `server.js`: `readBody(req, limit)` (~line 147, rejects with `Error('payload too large')`), the `/api/ask` handler (~line 343), how errors are mapped to `send(res, status, body)`, and where `asks = new Asks(room)` is created.
- `lib/asks.js`: `answer(id, body)` (~line 117), `readAnswers()` and `answerText()` (~line 277–300; answer values are cut at 300 chars), `card()` (ask ids are `randomUUID().slice(0, 8)`), `settle()` for how `patch.answers` reaches `updatedInput.answers` (~line 207).
- `lib/asks.test.mjs`: stub room and helper style to copy.

## Scope (files you own)
`lib/images.js` (new), `lib/images.test.mjs` (new), `lib/asks.js`, `lib/asks.test.mjs`, `server.js`, `README.md`.

## Tasks
1. **`lib/images.js` (Y3, Y4, Y5).** `export class Images { constructor({dir = path.join(os.tmpdir(), 'claude-office-images'), now = Date.now} = {}) }`. `save(askId, buf)` → `{imageId, path, bytes}` or `{error}`: reject `buf.length > 5 * 1024 * 1024` and any buffer whose magic bytes are not PNG (`89 50 4E 47`), JPEG (`FF D8 FF`), GIF (`GIF87a`/`GIF89a`) or WebP (`RIFF`….`WEBP` at bytes 8–11) with `"that is not a PNG, JPEG, GIF or WebP picture"`; extension from the detected type (`png jpg gif webp`); `mkdirSync(dir, {recursive:true, mode:0o700})`; file `<askId sanitised to [A-Za-z0-9_-]>-<8 random hex>.<ext>` written with mode `0o600`; `imageId` = base name. `pathFor(imageId)` → absolute path only if the id matches `^[A-Za-z0-9_-]+-[0-9a-f]{8}\.(png|jpg|gif|webp)$` and the file exists, else `null` (never path traversal). `sweep()` deletes files whose mtime is older than 24 h by `now()`; returns how many. `server.js` creates one `Images`, calls `sweep()` at start and every hour with `setInterval(...).unref()`.
2. **Upload route (Y2).** `POST /api/ask-image`: `readBody(req, 8 * 1024 * 1024)`; body `{askId, name, data}`. 404 `{error}` if no open ask with that id or it is not `kind === 'question'` (add `asks.getOpen(id)` returning the ask or null); 400 `{error}` for non-string/invalid base64 (use a strict base64 regex before `Buffer.from`), `Images.save` errors, or the ask already holding 12 images (track `ask.imageIds` array on the open ask; push on success). 200 `{ok:true, imageId, name, bytes}` (`name` cut to 80 chars, display only). A `payload too large` error from `readBody` must give 413 `{error: "that picture is too big (5 MB at most)"}`; check how the existing catch block maps errors and add only this case.
3. **Answer merging (Y6).** `asks.answer(id, body, images)`; `readAnswers(raw, imagesByQuestion, askId, images)`. For each question key with `imagesByQuestion[key]` (array): keep the first 3 ids that start with `askId + '-'` and resolve via `images.pathFor`; ignore the rest. Append after the 300-char cut: string answer → `"<text> [image: /abs/path]"` (one per image); array answer → push `"[image: /abs/path]"` per image; no text and no option (key absent or empty) with images → `"See the attached image: /p1, /p2"`. A question with only images must still count as answered (it adds the key). `server.js` passes the `Images` instance and `body.images` through.
4. **Tests.** `lib/images.test.mjs` (temp dir): real 1×1 PNG buffer saves with mode 0600 in a 0700 dir and `pathFor` finds it; a text buffer named x.png → error; 5 MB + 1 byte → error; `../x` and an id with another ask prefix are not resolved by `pathFor`; `sweep()` with an injected `now` 25 h later removes the file and keeps a fresh one. `lib/asks.test.mjs`: string answer + 1 image → ends with ` [image: <path>]`; array answer + image → extra element; image only → `See the attached image: …`; 4 images on one question → 3 paths; an id from another ask ignored.
5. **README.** Under the question-card paragraph add: pictures can be attached to a question; they are saved in the system temp folder for 24 hours and Claude is given their file paths.

## Done when
`node --test lib/images.test.mjs lib/asks.test.mjs lib/hook-install.test.mjs` pass; `node --check` on `lib/images.js lib/asks.js server.js`; on `PORT=4198` (stop it afterwards) `curl -s -X POST 127.0.0.1:4198/api/ask-image -d '{"askId":"nope","name":"a.png","data":"AA=="}'` returns 404. Do not touch `public/`. Append `## Result`.

## Result
- Status: DONE
- Files changed: lib/images.js, lib/images.test.mjs, lib/asks.js, lib/asks.test.mjs, server.js, README.md
- Checks: node --test (18 pass), node --check, curl 404 on PORT=4198 -> PASS
- Notes: array answers with only images get the "See the attached image" string; oversize payload maps to 413 in the global catch.

## Result (readBody overflow fix)
- Status: DONE
- Files changed: server.js
- Checks: `node --check server.js` → PASS; `PORT=4198 node server.js` then `curl -s -i -X POST 127.0.0.1:4198/api/hook -d <60000 bytes>` → PASS (HTTP/1.1 413, body `"that request is too big"`, Connection: close); POST /api/ask-image with 8 MB+10 base64 JSON → PASS (413, `that picture is too big (5 MB at most)`); small POST /api/ask-image askId nope → PASS (404); server stopped afterwards.
- Notes: readBody no longer destroys the request; overflow sets a flag, clears chunks, discards the rest and rejects once. The 413 send now passes `{ Connection: 'close' }`. The send helper pretty-prints JSON, so the body is multi-line, not one line as in the brief. 4173 untouched.
