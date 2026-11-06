# 09/01 — Labels and button group styling

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: none · Parallel with: none

## Decisions you need
B1–B4 — run `grep -E '^\| (B1|B2|B3|B4) ' 00-README.md`.

## Read first
- `public/index.html`: the three `.rootacts` groups (~lines 187–192, 268–272, 334–336).
- `public/styles.css`: `button` (~105), `button.mini` (~115), `.mini` (~117), `button.primary` (~112), `.rootbar`/`.rootline`/`.rootacts` (~374–376). Also check `grep -n "select" public/styles.css | head` for the base select padding.

## Scope (files you own)
`public/index.html`, `public/styles.css`.

## Tasks
1. **Labels (B1).** Change the text and add the `title` on `#wbSessNew` and `#wbSessRefresh`. Add class `accent` to `#wbSessNew` (`class="mini accent"`).
2. **Group style (B2).** After `.rootacts` (~line 376) add `.rootacts button.mini { text-transform: none; letter-spacing: 0; font-size: 13px; white-space: nowrap; min-height: 40px; padding: 0 14px; }` and `.rootacts select { min-height: 40px; }`. If `.mini { display:flex }` makes text wrap oddly, also set `display: inline-flex; align-items: center; justify-content: center;` on `.rootacts button.mini`.
3. **Accent (B3).** Add `button.accent` (teal gradient, dark text, teal border, hover `filter: brightness(1.07)`), not full width.
4. **Narrow (B4).** Add `@media (max-width: 600px) { .rootacts { flex-wrap: wrap; width: 100%; } .rootacts select { flex: 1 1 100%; } }` after the rules above.
5. Do not touch other buttons, the top tab buttons, or any `.js` file.

## Done when
`grep -n "New session\|Refresh" public/index.html` shows the two buttons with titles; `grep -n "rootacts button.mini\|button.accent\|max-width: 600px" public/styles.css` finds the new rules; `git diff --stat` lists only `public/index.html` and `public/styles.css`; `PORT=4199 node server.js` serves `/` containing `New session` (stop by PID). Append `## Result`.

## Result
- Status: DONE
- Files changed: public/index.html, public/styles.css
- Checks:
  - `grep -n "New session\|Refresh" public/index.html` → PASS (both buttons carry titles, lines 270–271)
  - `grep -n "rootacts button.mini\|button.accent\|max-width: 600px" public/styles.css` → PASS (lines 115, 116, 379, 381)
  - `git diff --stat` → PASS (only public/index.html and public/styles.css, 2 files)
  - `HOME=<tmp> PORT=4199 node server.js` then `curl /` contains `New session` → PASS (count 1; server stopped by PID)
- Notes: The `accent` class sits on `#wbSessNew` only, `button.mini` sets no background or colour, so `button.accent` is not overridden. No `.js` touched. `tools/verify-slice.sh` not run (not present in repo). The global `select` rule still carries `margin-top: 5px`, which may leave the select slightly offset from the 40px buttons; not changed because the slice did not name it.
- Follow-up: `.rootacts` gained `align-items: center;` and `.rootacts select` now sets `margin-top: 0` (public/styles.css only).
