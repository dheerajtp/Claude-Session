# 12/02 — History tab and pane (web)

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: 12/01 (disjoint: this slice owns `public/index.html`, `public/workbench.js`, `public/styles.css`) and plan 11

## Decisions you need
H3 (the data you fetch), H4, H5, H6, H7 — run `grep -E '^\| (H3|H4|H5|H6|H7) ' 00-README.md`.

## Read first
- `public/index.html`: the workbench header tabs (~lines 175–179) and `#wbUsage` section (~331–340) as the model for a pane and its `.rootbar`/`.rootacts`.
- `public/workbench.js`: `api()` (~34), `openSheet` (~75–86), `showTab`/`wireTabs` (~92–110), `loadSessions`/`renderSessions` (~512–600) for list card style, `openLaunchForm` (~654), `state` (~13), `say`/`note` (~403–415), `loadUsage` (~783) as the loader pattern.
- `public/styles.css`: `.sesslist` (~465), `.wbpane`, `.rootbar`, `.rootacts`, `.mini`, `.accent`.

## Scope (files you own)
`public/index.html`, `public/workbench.js`, `public/styles.css`.

## Tasks
1. **Tab and pane markup (H4, H5).** Add `<button class="tab" id="wbTabHistory" type="button">History</button>` between Sessions and Claude & usage; add the `#wbHistory` section with `.rootbar` (`#wbHistLine`, `.rootacts` with `<button class="mini" id="wbHistRefresh">Refresh</button>`), the controls row (search, two selects, Pinned only checkbox) and `<ul id="wbHistList" class="sesslist"></ul>` plus `<p id="wbHistEmpty" class="empty" hidden>`.
2. **Tab wiring (H4).** Extend `showTab` (add `['wbTabHistory','history']` and `$('wbHistory').hidden`), `wireTabs` (click → `showTab(sheetTab='history'); loadHistory()`), and `openSheet` for `tab === 'history'`.
3. **`loadHistory()` and `renderHistory()` (H5, H6).** Fetch `/api/history/all`, keep the array in `state.history`, fill the folder select from distinct `folder` values, and render cards per H6 with the exact wording there. Export nothing new; put the pure filtering in one function `filterHistory(items, {q, outcome, folder, pinnedOnly})` that also sorts pinned-first then newest, so it can be tested.
4. **Buttons (H6, H7).** Pin/Unpin posts to `/api/history/pin` then reloads the list; Follow up and Run again follow H7 exactly (never send). Disabled buttons carry the H6 titles.
5. **Empty states.** No runs: `Nothing has finished yet. Runs show up here after they finish.`; filters hide everything: `Nothing matches. Clear the search or the filters.`
6. **CSS.** Reuse `.sesslist`/card classes; add only what the controls row and chips need, and make it one column under 600px with no horizontal scroll.
7. Do not edit `public/client.js`, `public/notify.js`, `server.js` or `lib/`.

## Done when
`node --check public/workbench.js`; a node harness extracts `filterHistory` (read the source, `new Function`) and shows: search matches `ask`/`report`/`name`; outcome and folder filters; pinned-only; pinned first then newest; `grep -n "wbTabHistory\|wbHistory\|wbHistSearch\|wbHistOutcome\|wbHistFolder" public/index.html` finds them; `PORT=4198 node server.js` (temp HOME) serves `/` containing `History` (stop by PID). Append `## Result`.

## Result
- Status: DONE
- Files changed: public/index.html, public/workbench.js, public/styles.css
- Checks: node --check public/workbench.js → PASS; filterHistory harness (search name/ask/report, outcome, folder, pinned-only, pinned-first then newest) → PASS; grep of ids in index.html → PASS; temp-copy server on PORT=4198 served / with History, stopped by PID → PASS
- Notes: "N things done" uses todoDone. Run again disabled title when canRunAgain is false but folder is inside root: "This run has no recorded request to repeat." (my wording). Pin/follow flows untested against real routes (12/01 in parallel).
- Follow-up: histFacts "N things done" now uses i.toolCalls (was i.todoDone), matching the main shelf count in public/client.js; singular/plural kept.
