# 08/02 — Web: pictures.js, both forms, send gating

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: 08/01 (disjoint files: this slice owns `public/`, 08/01 owns `server.js` and `lib/`)

## Decisions you need
P2 (upload contract), P3 (payload field), P5 (helper), P6 (placement and gating), P7 (page words) — run `grep -E '^\| (P2|P3|P5|P6|P7) ' 00-README.md`.

## Read first
- `public/client.js`: `PIC_TYPES`/`PIC_HINT` and `picsBox()` (~lines 590–665) as the model for look, classes and the FileReader upload; the `runForm` submit handler (~lines 199–225).
- `public/workbench.js`: the session start call (~lines 690–712) and how `wbSessForm` is shown/reset (`closeLaunchForm`).
- `public/index.html`: `#prompt` block (~lines 38–45) and `#wbSessPrompt` block (~lines 274–281).
- `public/styles.css`: `.qpics`, `.qthumbs`, `.qthumb`, `.qx`, `.qname`, `.qerr`, `.drop` (~lines 492–500).

## Scope (files you own)
`public/pictures.js` (new), `public/index.html`, `public/client.js`, `public/workbench.js`, `public/styles.css`.

## Tasks
1. **`public/pictures.js` (P5).** Export `mountPictures(root, {max = 5, onChange = () => {}} = {})` returning `{ids, busy, clear}`. Build the P5 UI inside `root` using the existing class names; upload each file with `fetch('/api/prompt-image', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({name, data})})` (`data` = base64 without data-URL prefix, via FileReader as in `picsBox`); only accept the four image types (`That is not a picture`); refuse past `max` (`5 pictures at most`); show server `error` text on failure. Remove × revokes the object URL and drops the id. Call `onChange` after every state change. Page words exactly as P7.
2. **Paste and drop (P5).** `mountPictures` takes an optional `{textarea}`: on `paste`, take image files from `clipboardData.items` and upload them (do not block pasting text); on `dragover`/`drop` on the textarea accept image files and toggle the `drop` class on `root` like `picsBox` does.
3. **Run form (P6).** In `index.html` add `<div id="picsRun"></div>` right under the `#prompt` label (above `.promptbar`). In `client.js` mount it once in `wire()` with `{textarea: $('prompt'), onChange}`, where onChange sets `$('runBtn').disabled = busy || !health || !health.claude.found`. Add `images: pics.ids()` to the run payload only when non-empty; call `pics.clear()` on success only.
4. **Workbench (P6).** Same under `#wbSessPrompt`: `<div id="picsSess"></div>`, a second `mountPictures`, `images` in the `/api/sessions/start` body when non-empty, disable the send button while busy, `clear()` on success and in the form's reset/close path.
5. **CSS.** Only add rules if the new containers need spacing (e.g. `#picsRun, #picsSess { margin: -2px 0 10px; }`); reuse the existing picture classes.
6. Plain words (P7): no "path", "base64" or "attachment id" in visible text. Do not edit `picsBox` or any ask-card code.

## Done when
`node --check public/pictures.js public/client.js public/workbench.js`; a node harness importing `mountPictures` with a minimal fake DOM (or reading the source) confirms: wrong type gives `That is not a picture`, a 6th file gives `5 pictures at most`, `ids()` is empty after `clear()`; `grep -n "picsRun\|picsSess" public/index.html public/client.js public/workbench.js` finds the mount points and the payload `images` lines; `PORT=4199 node server.js` serves `/` and `/pictures.js` (stop by PID). Append `## Result`.

## Result
- Status: DONE
- Files changed: public/pictures.js (new), public/index.html, public/client.js, public/workbench.js, public/styles.css
- Checks: node --check (3 files) PASS; fake-DOM harness (wrong type, 6th file, clear) PASS; grep mount points and images lines PASS; PORT=4199 serves / and /pictures.js (200/200) PASS
- Notes: /api/prompt-image not exercised (08/01). Workbench send button re-enabled via busy() in the finally block; run button likewise.
