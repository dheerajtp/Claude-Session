# 13/02 — Spend tab and limit warning (web)

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: plans 11 and 12 done · Parallel with: 13/01 (disjoint: this slice owns `public/`)

## Decisions you need
S4 (the data you fetch), S5, S6, S7 — run `grep -E '^\| (S4|S5|S6|S7) ' 00-README.md`.

## Read first
- `public/index.html`: the workbench tab buttons and the `#wbHistory` / `#wbUsage` panes (from plan 12) as the model.
- `public/workbench.js`: `api()`, `showTab`/`wireTabs`/`openSheet`, `loadHistory` (plan 12), `loadUsage` (~783) and its renderer for list/bar styling, `say`/`note`.
- `public/client.js`: imports (line 5) and `connect()` message handlers (~lines 103–130); `banner()`.
- `public/notify.js`: the exported `alert(title, body, {kind, say})` helper.
- `public/styles.css`: `.rootbar`, `.rootacts`, `.sesslist`, any existing bar/meter classes (`grep -n "meter\|bar" public/styles.css | head`).

## Scope (files you own)
`public/index.html`, `public/workbench.js`, `public/styles.css`, `public/client.js`.

## Tasks
1. **Tab and pane (S5).** Add `#wbTabSpend` after History and the `#wbSpend` section with the rootbar line + Refresh, `.spendbars`, the visually-hidden table, `#wbSpendFolders`, `#wbSpendModels`, the note hint, and the limit form (`#wbSpendLimit`, **Save limit**, **Remove limit**, hint text exactly as S5).
2. **Wiring.** Extend `showTab`, `wireTabs`, `openSheet` for `'spend'`; opening it calls `loadSpend()`.
3. **`loadSpend()` / `renderSpend(d)` (S5, S6).** Fetch `/api/spend`; write the line, bars (height = day cost / max day cost, minimum 2px for non-zero days, `title` per bar), the two share lists (name, `$`, share bar), the `note` text from the response, and the limit input value. Put the money formatting in one function `money(n)` implementing S6 so it can be tested. Empty state per S6 when `kept === 0`.
4. **Limit form.** Save posts `{dailyLimitUsd: Number(value)}`; Remove posts `{dailyLimitUsd: null}`; show the server's error text in the hint line on 400; reload after success.
5. **Warning (S7).** In `client.js` import the alert helper as `sendAlert` and add `if (msg.kind === 'spend:limit') { sendAlert('Daily spend limit passed', `Today's spend is ${money}, over your ${money} limit.`, { kind: 'bad', say: banner }); return; }` inside `onmessage`; format money inline with `toFixed(2)` (do not import from `workbench.js`).
6. **CSS.** Bars as flex children aligned to the bottom, height set by inline style; one column under 600px; no horizontal scroll. Do not add anything to the main office layout.

## Done when
`node --check public/workbench.js public/client.js`; a node harness extracts `money()` (read the source, `new Function`) and prints `$0.00`, `less than $0.01`, `$1.20`, `$12.35` for 0, 0.004, 1.2, 12.345; `grep -n "wbTabSpend\|wbSpend\b\|wbSpendLimit" public/index.html` and `grep -n "spend:limit" public/client.js` find the markup and handler; `PORT=4198 node server.js` (temp HOME) serves `/` containing `Spend` (stop by PID). Append `## Result`.
