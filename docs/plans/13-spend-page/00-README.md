# 13 — Spend page

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../12-history-page/00-README.md`](../12-history-page/00-README.md) (the ledger and the workbench tabs) and [`../11-alerts-you-can-trust/00-README.md`](../11-alerts-you-can-trust/00-README.md) (alerts) · **Run after plans 11 and 12** (shared files: `lib/history.js`, `server.js`, `public/workbench.js`, `public/index.html`, `public/styles.css`, `public/client.js`)

## Goal
- A new **Spend** tab in the workbench shows what Claude actually cost: today, the last 7 days, this month, the last 30 days day by day, which folders and which models it went on.
- An optional daily limit warns the person (banner, chime, pop-up) the first time a day's spend passes it. The main office screen gets no new controls.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| S1 | **Ledger.** New `lib/spend.js`: `class Spend { constructor({file}) }` (file defaults to `data/spend.json`; tests pass a temp file). Stored shape: `{dailyLimitUsd: number\|null, limitFiredOn: 'YYYY-MM-DD'\|null, last: {key: {costUsd, tokens}}, days: {'YYYY-MM-DD': {costUsd, tokens, runs, byFolder: {name: usd}, byModel: {name: usd}}}}`. Day = the server's local calendar date of `at` (`new Date(at).toLocaleDateString('en-CA')`). `add({key, folder, model, costUsd, tokens, at})` books only the **delta** since `last[key]`: `delta = cost >= prev ? cost - prev : cost` (a resumed session starts counting from zero again), same rule for tokens; zero deltas return without writing. Prune days older than 400 days and keep at most 2000 `last` keys (oldest inserted dropped). Writes are async and atomic enough (write temp file then rename). |
| S2 | **Hook into the ledger.** `History.record()` (`lib/history.js`) calls `this.spend?.add({key, folder: item.folder, model: item.model \|\| 'unknown', costUsd: item.costUsd, tokens: item.tokens, at: item.finishedAt})`; `server.js` creates one `Spend` and sets `room.history.spend = spend`. Only runs that report a cost count (runs started from this page); the page says so (S4). |
| S3 | **Limit.** `Spend.setLimit(usd)` accepts a finite number 0–10000 or `null`. `add()` returns `{crossed: true}` when, after booking, today's `costUsd` is above `dailyLimitUsd` and `limitFiredOn !== today` (then sets `limitFiredOn = today`); `History.record` then calls `this.room?.broadcast('spend:limit', {today, limit})`. Raising or removing the limit resets `limitFiredOn` to `null`. |
| S4 | **Routes** (`server.js`). `GET /api/spend` → `{today, last7, thisMonth, kept, days, byFolder, byModel, dailyLimitUsd, note}`: the first four are USD numbers rounded to 4 decimals; `days` is the last 30 calendar days oldest→newest `[{date, costUsd, tokens}]` including zero days; `byFolder` and `byModel` are `[{name, costUsd}]` over those 30 days, largest first, folders capped at 10; `note` is exactly `Counts runs started from this page. Sessions from your editor or terminal do not report a cost.` `POST /api/spend/limit` with `{dailyLimitUsd}` → `200 {ok:true, dailyLimitUsd}`; `400 {error:'enter an amount between 0 and 10000, or leave it empty to turn warnings off'}` for anything else. |
| S5 | **Tab.** Workbench tab `#wbTabSpend` labelled **Spend**, placed after History and before Claude & usage; pane `<section id="wbSpend" class="wbpane" hidden>`. Content: a `.rootbar` line `Today $X · last 7 days $Y · this month $Z` with a **Refresh** button; a 30-day bar chart (`<div class="spendbars">` of `<i>` bars sized to the largest day, each with `title="Nov 3: $1.20"`, first and last date labels, and a visually hidden `<table>` of the same numbers); **By folder** and **By model** lists with a thin share bar; the S4 note as a hint; the limit form: `<input id="wbSpendLimit" type="number" min="0" step="0.01">`, **Save limit**, **Remove limit**, hint `Warn me when a day's spend passes this amount. Leave it empty if you don't want warnings.` |
| S6 | **Money words.** `$0.00` format with 2 decimals; any positive amount under one cent shows `less than $0.01`; no spend at all shows `$0.00`. Empty state when `kept === 0`: `No cost has been recorded yet. It appears after a run started from this page finishes.` |
| S7 | **Warning on the page.** `public/client.js` handles `msg.kind === 'spend:limit'` in `connect()` by calling the existing alert helper from `notify.js` (import it under another name than `alert`): title `Daily spend limit passed`, body `Today's spend is $X, over your $Y limit.`, kind `bad`, `say` = the banner. |
| S8 | **Out of scope.** Estimating a cost for editor or terminal sessions, plan-percentage limits (the Claude & usage tab already shows them), per-folder budgets, export. |

## Assumptions (not yet approved)
- The daily limit is off until the person sets one.
- Days follow the computer's local time.

## Status
- [ ] 01 — Spend ledger, hook, routes, tests (server)
- [ ] 02 — Spend tab and limit warning (web)
- [ ] 03 — Acceptance

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | plans 11 and 12 done | 13/02 (disjoint) | Sonnet | `lib/spend.js` (new), `lib/spend.test.mjs` (new), `lib/history.js`, `server.js` |
| 02 | plans 11 and 12 done | 13/01 (disjoint) | Sonnet | `public/index.html`, `public/workbench.js`, `public/styles.css`, `public/client.js` |
| 03 | 01, 02 | none | Haiku | `docs/plans/13-spend-page/**` |

**Rules for every slice:** tests never touch the real `data/` folder; the main office screen gets no new controls.

## Acceptance checklist
- [ ] `node --test lib/spend.test.mjs` passes on a temp file: delta booking; resumed session (cost goes down) books the new amount; zero delta writes nothing; day buckets by local date; `crossed` fires once per day and resets when the limit changes; limit validation; 400-day prune.
- [ ] `node --test lib/*.test.mjs` all pass (history tests included).
- [ ] With a copy of the project in a temp dir on `PORT=4199`: `GET /api/spend` returns the S4 shape with 30 `days`; `POST /api/spend/limit` accepts `5` and `null` and rejects `-1` and `"abc"` with the S4 error.
- [ ] Served page has `#wbTabSpend`, `#wbSpend`, `#wbSpendLimit`; `node --check` passes on `public/workbench.js` and `public/client.js`; `grep -n "spend:limit" public/client.js` shows the handler.
- [ ] MANUAL: after a run started from the page finishes, today's amount rises; the bars, folder and model lists show it; setting a limit below today's spend and finishing another run gives the banner, chime and pop-up once; the main office screen has no new controls.
