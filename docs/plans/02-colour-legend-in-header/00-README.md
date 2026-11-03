# 02 — Colour legend in the header, and a quieter activity feed

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../01-see-live-sessions/00-README.md`](../01-see-live-sessions/00-README.md) (same page, no shared decisions)

## Goal
- Anyone looking at the page sees what each avatar colour means without scrolling the left panel (today the legend is the last card, below the fold in your screenshot).
- The legend always matches the colours actually drawn on avatars.
- "What is happening, as it happens" stops repeating the same agent name on every line when it adds nothing.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| W1 | **Placement.** A slim always-visible strip `<div id="legendBar" class="legendbar" role="list">` directly after `</header>` and before `#banner` in `public/index.html`; full width, one row on desktop. No collapse or hide toggle. |
| W2 | **Chips.** Each chip is `<span role="listitem" tabindex="0" class="chip" title="<full sentence>">` holding a 10px coloured dot and a short label. The full sentence is also the chip's `aria-label`. Order and wording (state → label → title): `working` → "working" → "It is doing something right now"; `thinking` → "thinking" → "It is deciding what to do next"; `walking` → "walking in" → "It just arrived at a desk"; `blocked` → "needs you" → "It stopped and is waiting for an answer"; `done` → "finished" → "It wrote its report"; `idle` → "standing by" → "No news for a while — it is waiting for you to do something"; `error` → "problem" → "It stopped with a problem". The old "on a break" row is dropped (the `coffee` state is not what a quiet session shows). |
| W3 | **One source of colour.** Export `stateColor` is already in `public/iso.js`; the chips are built by a new `public/legend.js` (`export function renderLegend(host)`) that reads colours with `stateColor(state)`, so the hard-coded hex values in `index.html` disappear. `client.js` imports it and calls `renderLegend($('legendBar'))` once in `init()`. |
| W4 | **Left card.** In `index.html` the `<section class="card legend">` keeps only its `<p class="hint">` (the "Sprinting…" and "bar under each name" explanation), retitled `<h2>Reading the floor</h2>`; the colour `<ul>` is removed. The `.legend ul/li/i` rules in `styles.css` are replaced by the `.legendbar`/`.chip` rules. |
| W5 | **Look and responsiveness.** `.legendbar { display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center }`, chips 11.5px, `color: var(--muted)`, dot `border-radius:3px`, a leading label "Colours:" in `var(--dim)`. Wraps onto more lines at narrow widths; never causes horizontal page scroll. Chip gets a visible focus outline. |
| W7 | **Feed names.** In `renderFeed()` (`public/client.js`, ~line 730) the `.head` row with the agent name is rendered only when it adds information: (a) if every item in the rendered slice (first 70) has the same `agentName` (or none), no item gets a name row at all; (b) otherwise an item gets a name row only when its `agentName` differs from the item above it in the list (the first item always gets one), so a run of lines from one agent shows the name once. Items without a name row get class `cont` (`.feed li.cont { padding-top: 4px }`, no top border change). The text, colour and ordering of items are unchanged; nothing about what is stored or broadcast changes. |
| W6 | **Out of scope.** Dorm bed colours ("on shift"), an in-canvas legend, hiding the strip, translations, timestamps in the feed, filtering the feed by agent. |

## Status
- [x] 01 — Header legend strip, `legend.js`, left-card trim, feed name grouping, README note
- [x] 02 — Acceptance (3 PASS, 3 MANUAL; see Known issues)

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | none | Sonnet | `public/index.html`, `public/legend.js`, `public/client.js`, `public/styles.css`, `README.md` |
| 02 | 01 | none | Haiku | `docs/plans/02-colour-legend-in-header/` |

**Rules for every slice:** zero dependencies, no build step, plain words on the page (no "state", "hook", "session" in chip labels or titles).

## Acceptance checklist
- [ ] The strip with seven chips is visible under the header on load, with no scrolling, and no hex colours remain in `index.html`.
- [x] Each chip's dot colour equals `stateColor(<its state>)` for that state.
  - Evidence: node harness rendered renderLegend() with a fake DOM; all 7 dots MATCH stateColor (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence2/02-chip-colours.txt`).
- [ ] Hovering or focusing a chip shows its full sentence.
- [x] The left panel no longer lists colours but still explains "sprinting" and the progress bar.
  - Evidence: served card is `<h2>Reading the floor</h2>` + hint only, 0 `<ul>/<li>`, "Sprinting" and "bar under each name" present (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence2/04-left-card.txt`).
- [ ] At 800px width the strip wraps and the page has no horizontal scroll.
- [x] With one agent on the page the activity feed shows no agent names; with two agents the name appears once per run of lines.
  - Evidence: harness of the renderFeed rule: 5x A -> no name rows; A,A,B,B,A -> name rows at [0,2,4] (`/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence2/06-feed-grouping.txt`).

## Known issues
- MANUAL (row 1, strip visible on load): automated part passes (one `#legendBar` between `</header>` and `#banner`, no hex colours in `index.html`, `/legend.js` 200, `renderLegend` called in `init()`). Steps: 1. `PORT=4198 node server.js`. 2. Open http://127.0.0.1:4198/ in a desktop-size window. 3. Without scrolling, confirm a "Colours:" strip with seven chips (working, thinking, walking in, needs you, finished, standing by, problem) sits under the header.
- MANUAL (row 3, tooltips): attributes verified (title = aria-label = W2 sentence, tabIndex 0, `.chip:focus-visible` outline). Steps: 1. Hover each chip and confirm the native tooltip shows its full sentence. 2. Press Tab until a chip is focused; confirm a visible outline and (with a screen reader, e.g. VoiceOver Cmd+F5) that the full sentence is read.
- MANUAL (row 5, wrap at 800px): Steps: 1. Open the page, set the viewport to 800px wide (DevTools device toolbar). 2. Confirm the strip wraps onto 2+ lines. 3. In the console run `document.documentElement.scrollWidth <= innerWidth`; expect `true`.
- Observed, affects rows 1/5 look: the new `.chip` rule in `public/styles.css` (line 221) is unscoped and shares its class name with the existing pill `.chip` (line 135, used by ask cards and client.js lines 441/545/619). Result: legend chips also pick up `font: 700 10.5px` and the `#ffffff0d` pill background (W5 asks for 11.5px muted), and the existing pills lose their 4px 8px padding / 999px radius. Check both during the manual steps; a fix would scope the rules (e.g. `.legendbar .chip`).

