# 05/01 — Crew cards, switch, buttons, grouping, subtitle

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: none

## Decisions you need
R1–R7 — run `grep -E '^\| (R1|R2|R3|R4|R5|R6|R7) ' 00-README.md`.

## Read first
- `public/client.js`: `CHIP` and `ORIGIN` (~line 340–351), `render()` (~line 377: the `list` sort at ~379, `$('crewCount')` at ~383, `roster.replaceChildren(...list.map(row))` at ~389), `row(a)` (~line 769, whole function), `plainStats()`, `helperLine()`, `boss(a)` (~line 968), `post()`, `refreshAsks()`.
- `public/index.html` lines 76–90 (the Crew `<section class="card">`: heading, `#roster`, `#empty`, totals footer).
- `public/styles.css`: `.roster li`, `.who`, `.wname`, `.wdot`, `.src`, `.act`, `.meter`, `.steps`, `.meta`, `.ask`, `.helping` (lines ~125–145, 202, 297–311), `button.mini`, `button.stop`, `button.route.armed` (~line 270), `.hint`.

## Scope (files you own)
`public/client.js`, `public/index.html`, `public/styles.css`, `README.md`.

## Tasks
1. **Card content (R1).** Rewrite `row(a)` so, in order, it appends: head (`.who` with dot, `.wname`, state chip — unchanged); `div.act` with `readable(a.activity) || 'no news yet'`; if `a.prompt`, `div.ask` text `You asked: “…”` (same clip, same title); `div.facts` — origin (or `helper working for <boss(a) || 'another agent'>` when `a.parent`) joined with ` · ` to `plainStats(a)` and, for non-helpers with live helpers (`[...agents.values()].filter((x) => x.parent === a.id && !['done','error'].includes(x.state)).length`), ` · N helper(s) working`; the `.meter` + `.steps` block **only when `a.todoTotal > 0`** (drop the unknown bar and the "It has not made a plan yet." text; delete the now-unused `.meter.unknown` rule); `helperLine(a)` only when `!a.parent`. Remove `.src` and `.meta` usage. CSS: `.act` becomes `font-size: 13.5px; color: var(--ink)`; `.facts` is `font: 500 11.5px/1.45 ui-sans-serif, system-ui; color: var(--dim); margin-top: 6px`; keep the line-clamp rules working for `.act` and `.ask`.
2. **Switch (R2).** Replace the `Route approvals here` button with `div.armrow` containing `<button type="button" role="switch" aria-checked="…" class="switch">` (a pill track `<i>` that moves, then the label **Ask me here, not in the terminal**) and below it `p.armstate` with the On/Off sentence from R2 (exact text). The click handler is the existing one (`e.stopPropagation(); fetch('/api/arming', post({agentId: a.id, on: !armed})).then(() => refreshAsks())`). Same visibility rule as today (`!a.parent && ['claude','claude-hook'].includes(a.source) && a.state !== 'done'`). Put the R2 title on the row. CSS: `.switch` track 30×16px, off = `#ffffff22`, on = `var(--teal)`; label 12px `var(--ink)`; `.switch:focus-visible { outline: 2px solid var(--muted); outline-offset: 2px }`; `.armstate` 11.5px `var(--dim)`, and `var(--teal)` text colour when on. Remove the old `button.route.armed` rule.
3. **Buttons (R3).** In the same `actions` row: `Hide card` (class `mini`, title from R3, existing dismiss call) on the left, `Stop run` (class `mini stop`, title from R3, existing stop call and visibility rule) pushed right with `margin-left: auto`. Helpers show Hide card only.
4. **Order and groups (R5).** In `render()` replace the `list` sort with: group rank `blocked`=0; `booting|walking|thinking|working|coffee`=1; `idle`=2; everything else=3; sort by rank then `startedAt`. `office.sync(list)` and `dorm.roster()` still receive this list. Build the roster children by walking the list and inserting `<li class="group">` (text `Needs you` / `Working` / `Standing by` / `Finished`, not clickable, `pointer-events:none`) before the first card of each rank. CSS `.roster li.group`: no border/background, `font: 800 10.5px/1 ui-sans-serif; letter-spacing: .09em; text-transform: uppercase; color: var(--dim); padding: 6px 2px 0`; make sure `.roster li:hover` does not highlight it.
5. **Subtitle (R6).** In `index.html` add `<p class="hint" id="crewHint">Every Claude session and helper on this computer. Click one to see its details.</p>` right under the Crew `cardhead`, and hide it (`hidden`) when there are no agents (set in `render()` next to `$('empty').hidden`).
6. **README.** In the section about the page's panels add one short paragraph: the Crew list groups sessions by who needs you; the "Ask me here, not in the terminal" switch routes that session's questions and permission requests to the page; Hide card only hides, it never stops a session; Stop run is for runs started from this page.
7. Plain words only (R7): the strings "route", "arm", "approvals" must not appear in user-visible text. Do not touch `renderAsks()` or `askRow()`.

## Done when
`node --check public/client.js` passes; `grep -n "Route approvals\|Dismiss'\|It has not made a plan" public/client.js` finds nothing; `grep -c "role=\"switch\"\|'switch'" public/client.js` is at least 1; `PORT=4198 node server.js` (stop it by its PID afterwards) serves `/` and `/client.js` with 200; `node --test lib/*.test.mjs` still passes. State in `## Result` that the layout was not viewed in a browser. Append `## Result`.

## Result
- Status: DONE
- Files changed: public/client.js, public/index.html, public/styles.css, README.md
- Checks: node --check PASS; grep stale strings none PASS; switch grep =1 PASS; PORT=4198 / and /client.js 200 PASS; node --test 18/18 PASS
- Notes: Layout was not viewed in a browser. .act font change also applies to Finished-shelf .finitem .act (shared rule).

## Result (fix pass)
- Status: DONE
- Files changed: public/client.js, public/styles.css
- Checks: node --check public/client.js PASS; grep -n "armswitch" shows client.js:839 and styles.css:270-275 PASS; grep "'switch'" client.js still matches line 841 (role="switch" value, not the class) so the literal check is FAIL as written, class check PASS; node --test lib/*.test.mjs 18/18 PASS
- Notes: Stop run now requires !a.parent (client.js:860). Old .switch, .switch input, .switch.tight rules untouched. Layout not viewed in a browser.
