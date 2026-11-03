# 02/01 — Header legend strip, left-card trim, feed name grouping

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: none

## Decisions you need
W1–W5 (legend strip and card), W7 (feed names) — run `grep -E '^\| (W1|W2|W3|W4|W5|W7) ' 00-README.md`.

## Read first
- `public/index.html` lines 10–30 (header, `#banner`) and 94–106 (`<section class="card legend">`).
- `public/iso.js` lines 34–49 (`STATE_COLORS`, `stateColor`).
- `public/client.js`: `init()` (~line 80, add one call), `renderFeed()` (~line 730) and `el()` helper (top of file).
- `public/styles.css`: `.legend ...` rules (~lines 219–221), `.feed ...` rules (~lines 184–193), media query `@media (max-width: 820px)` (~line 232), the `--muted`/`--dim` variables.

## Scope (files you own)
`public/index.html`, `public/legend.js` (new), `public/client.js`, `public/styles.css`, `README.md`.

## Tasks
1. **Legend module.** `public/legend.js` exports `renderLegend(host)`. It has a const list of `{state, label, title}` in the order in W2 and builds, for each, `<span class="chip" role="listitem" tabindex="0" title=… aria-label=…>` with `<i>` (inline `background: stateColor(state)`) and the label. A leading `<span class="legendlead">Colours:</span>`. Import `stateColor` from `./iso.js`.
2. **Strip.** In `index.html` add `<div id="legendBar" class="legendbar" role="list" aria-label="What the colours mean"></div>` right after `</header>`. In `client.js` import `renderLegend` and call `renderLegend($('legendBar'))` at the start of `init()`.
3. **Left card.** In `index.html` remove the `<ul>` of six coloured `<li>`, change the `<h2>` to "Reading the floor", keep the `<p class="hint">`. In `styles.css` delete the `.legend ul/.legend li/.legend i` rules (keep `.legend` card spacing if any) and add `.legendbar`, `.legendlead`, `.chip`, `.chip i`, `.chip:focus-visible` per W5.
4. **Feed names.** Edit `renderFeed()` per W7. Compute `const items = feedItems.slice(0, 70)`, `const names = new Set(items.map((f) => f.agentName || ''))`, `const single = names.size <= 1`, and for item index `i` show the head row only when `!single && (i === 0 || (f.agentName || '') !== (items[i - 1].agentName || ''))`. Keep the colour of `who`. Add class `cont` to items with no head row and the `.feed li.cont` rule.
5. **README.** In the section about the page's panels, add one sentence: the colour legend lives under the header; the feed shows an agent's name once per run of lines.

## Done when
`node --check public/legend.js public/client.js` passes; `node server.js` on `PORT=4198` serves `/`, `/legend.js` (200) and the HTML contains `id="legendBar"` and no `style="background:#` colour list; a small node check importing `legend.js` is not required (browser-only). Do not start a browser. Existing `node --test lib/hook-install.test.mjs` still passes. Append `## Result`.

## Result
- Status: DONE
- Files changed: public/legend.js (new), public/index.html, public/client.js, public/styles.css, README.md
- Checks: node --check legend.js/client.js PASS; PORT=4198 serves / and /legend.js 200, legendBar present, no inline colour list PASS; node --test lib/hook-install.test.mjs 6/6 PASS
- Notes: README sentence placed at top of "Everything on screen is a sentence". Server on 4198 stopped.
