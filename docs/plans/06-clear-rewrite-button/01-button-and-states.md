# 06/01 — Button, states and helper text

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: none

## Decisions you need
K1–K5 — run `grep -E '^\| (K1|K2|K3|K4|K5) ' 00-README.md`.

## Read first
- `public/index.html` lines 41–44 (the `.promptbar` with `#sharpenBtn` and `#sharpenNote`).
- `public/client.js`: `sharpenComposer()` (~line 281–309) whole function; the listener at ~line 232 (`$('sharpenBtn').addEventListener`); `sharpenPrompt()` (~274) is read-only, do not edit.
- `public/styles.css`: `.promptbar` (~196), `.hintline` (~197), `button.mini` (~114).

## Scope (files you own)
`public/index.html`, `public/client.js`, `public/styles.css`.

## Tasks
1. **HTML (K1, K2).** Button text `Rewrite my request`, add the K1 `title`. Set `#sharpenNote` initial text to the K2 idle sentence. Keep both ids.
2. **`setRewriteUi(state, detail)` (K3, K4).** Add it above `sharpenComposer()`. States: `idle`, `empty`, `working`, `done`, `undone`, `error`. It sets `#sharpenBtn` text/disabled and `#sharpenNote` text using the exact K3 strings (`error` appends `detail`). Store the idle sentence in one constant, reused by `idle`.
3. **Rewire `sharpenComposer()`.** Replace every direct `btn.textContent` / `note.textContent` assignment with `setRewriteUi`. The undo branch (`box.dataset.sharpened === current`) → `undone`. Remove the `finally` label reset to "Sharpen prompt"; `done`/`error` set the label themselves.
4. **Reset on edit.** Add an `input` listener on `#prompt`: if `box.value.trim() !== box.dataset.sharpened`, clear `dataset.sharpened` and call `setRewriteUi('idle')` (skip while `working`).
5. **CSS (K2).** `.promptbar { flex-wrap: wrap; }`; `.hintline` becomes `font: 11px/1.45 system-ui, sans-serif; letter-spacing: 0; text-transform: none; flex-basis: 100%;` so the note sits on its own line. Check no other element uses `.hintline` (`grep -n hintline public/*`) and keep them looking right.
6. **Plain words (K5).** After editing, `grep -n -i "sharpen" public/index.html` must find only ids; no visible text contains "sharpen", "prompt" or "ask" as a noun in this control.

## Done when
`node --check public/client.js` passes; `grep -n "Sharpen prompt\|Sharpening\|Make my ask clearer\|how far to go" public/index.html public/client.js` finds nothing; a small node harness (stub `$` with fake elements) calls `setRewriteUi` for each state and prints the K3 strings exactly; `PORT=4199 node server.js` serves `/` containing `Rewrite my request` (stop it by PID). Root typecheck and lint, if the repo has them, pass. Append `## Result`.

## Result
- Status: DONE
- Files changed: public/index.html, public/client.js, public/styles.css
- Checks: node --check PASS; forbidden-string grep PASS (none); node harness prints K3 strings exactly PASS; PORT=4199 server serves "Rewrite my request" PASS
- Notes: Scoped the CSS as `.promptbar .hintline` because `#wbSessFileNote` elsewhere also uses `.hintline` and should keep its mono look. Input-reset listener skips while button is disabled (working). That other note still says "your ask" (outside this control).
