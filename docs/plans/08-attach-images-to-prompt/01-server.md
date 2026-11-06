# 08/01 — Server: upload route, composePrompt, images on both run routes

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: 08/02 (disjoint files: this slice owns `server.js` and `lib/`, 08/02 owns `public/`)

## Decisions you need
P1 (appended text), P2 (upload route), P3 (payload rules), P4 (helper) — run `grep -E '^\| (P1|P2|P3|P4) ' 00-README.md`.

## Read first
- `lib/images.js`: `Images.save`, `Images.pathFor`, `ID_PATTERN`, `NOT_A_PICTURE` (whole file is ~70 lines).
- `lib/images.test.mjs`: how tests build an `Images` on a temp dir (copy that setup).
- `server.js`: the `/api/ask-image` block (~lines 355–367, copy its base64 check and error messages), `/api/run` (~303–325), `/api/sessions/start` (~452–490), the too-big mapping at ~526 (`p === '/api/ask-image' ? … `).

## Scope (files you own)
`server.js`, `lib/images.js`, `lib/images.test.mjs`.

## Tasks
1. **`composePrompt` (P4).** Export `composePrompt(prompt, imageIds, images)` from `lib/images.js`. No/empty ids → `{prompt}` unchanged. Otherwise: more than 5 → `{error:'5 pictures at most'}`; any id not a string starting `draft-` or with `images.pathFor(id)` null → `{error:'a picture is no longer available, attach it again'}`; else `{prompt: prompt + '\n\nReference pictures — open each one with your Read tool before you start:\n' + paths.map(p => '- ' + p).join('\n')}`.
2. **Upload route (P2).** Add `if (p === '/api/prompt-image')` next to `/api/ask-image`: `readBody(req, 8 * 1024 * 1024)`, same base64 validation and message as ask-image, `images.save('draft', Buffer.from(body.data,'base64'))`, errors → 400, success → `200 {ok:true, imageId, name: String(body.name||'picture').slice(0,80), bytes}`. Extend the too-big mapping at ~526 so `/api/prompt-image` also gives `that picture is too big (5 MB at most)`.
3. **Both run routes (P3).** In `/api/run` and `/api/sessions/start`, after the `prompt required` check and before spawning: `const composed = composePrompt(prompt, body.images, images); if (composed.error) return send(res, 400, {error: composed.error});` then pass `composed.prompt` to `ClaudeRun` instead of `prompt`. Nothing else changes when `body.images` is absent.
4. **Tests.** Add cases to `lib/images.test.mjs`: no ids unchanged; two saved `draft` ids produce the exact P1 block with their absolute paths; unknown id, an id like `ask1-abcd1234.png` (not `draft-`), and six ids each give the P3 error.

## Done when
The images test file passes (run it the way it is run today, e.g. `node --test lib/images.test.mjs`); `node --check server.js lib/images.js`; with `PORT=4199 node server.js` (temp HOME, stop by PID): a real PNG to `/api/prompt-image` returns 200 with a `draft-…png` id, text bytes return 400 `that is not a PNG, JPEG, GIF or WebP picture`, and `POST /api/run` with `{prompt:"x",images:["draft-deadbeef.png"]}` returns 400 `a picture is no longer available, attach it again`. `/api/ask-image` still passes its existing tests. Append `## Result`.

## Result
- Status: DONE
- Files changed: server.js, lib/images.js, lib/images.test.mjs
- Checks: node --test lib/images.test.mjs → PASS (7/7); node --check → PASS; live PORT=4197: PNG upload 200 draft-…png, text 400 not-a-picture, /api/run bad id 400 "no longer available" → PASS
- Notes: in /api/sessions/start the image check runs before closePrevious stops runs (no side effects on 400). Server check used port 4197.
