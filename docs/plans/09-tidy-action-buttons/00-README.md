# 09 — Tidy the workbench action buttons

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../05-clearer-crew-cards/00-README.md`](../05-clearer-crew-cards/00-README.md) (same plain-words rule)

## Goal
- On the workbench panes (Projects, Sessions, Claude & usage) the buttons next to the project picker look like one tidy set: same height as the picker, one line of text, readable sentence-case words, and one clear main action.
- Nothing in the screenshot reads as cramped: today "NEW SESSION" and "READ AGAIN" wrap onto two lines in tiny letter-spaced capitals, sitting beside a taller picker.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| B1 | **Labels.** In `public/index.html`: `#wbSessNew` → **New session** with `title="Start a fresh Claude conversation in the selected project"`; `#wbSessRefresh` → **Refresh** with `title="Read the list of conversations again"`. Ids and click handlers in `workbench.js` do not change. |
| B2 | **Look of the action group.** All buttons inside `.rootacts` (all three panes: `wbProjects`, `wbSessions`, `wbUsage`) get: `text-transform: none; letter-spacing: 0; font-size: 13px; white-space: nowrap; min-height: 40px; padding: 0 14px;`. The `select` in `.rootacts` gets `min-height: 40px` and `margin-top: 0` (the global `select` rule adds `margin-top: 5px`, which would sit it lower than the buttons), and `.rootacts` gets `align-items: center`, so every control in the row is the same height and on one line. Rule lives in `public/styles.css` next to `.rootacts` (~line 376) and must beat `button.mini` (specificity: use `.rootacts button.mini`). |
| B3 | **One main action.** New class `button.accent` (teal gradient like `button.primary`: `background: linear-gradient(180deg,#4de1c1,#2fbfa3); color:#04211b; border-color:#57f0d0;` but NOT `width:100%` and normal padding). Apply it only to `#wbSessNew` (class `mini accent`). Everything else in `.rootacts` stays neutral. |
| B4 | **Narrow screens.** Under 600px: `.rootacts { flex-wrap: wrap; width: 100%; }` and `.rootacts select { flex: 1 1 100%; }` so the picker takes its own line and the buttons sit below it, no horizontal scroll. |
| B5 | **Out of scope.** The top tab buttons (Projects / Sessions / Claude & usage / Close), button labels elsewhere in the app, the Sessions line text beside the picker, and any behaviour change. |

## Assumptions (not yet approved)
- "The button design issue" means the cramped, wrapped NEW SESSION / READ AGAIN buttons in the screenshot; the same group style is applied to the other two panes for consistency (B2).

## Status
- [x] 01 — Labels and button group styling (gated by orchestrator: diff vs Scope, CSS/HTML greps; plus a follow-up for picker alignment, `margin-top: 0` and `align-items: center`; no verify-slice.sh or root lint in this repo)
- [ ] 02 — Acceptance

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | none | Haiku | `public/index.html`, `public/styles.css` |
| 02 | 01 | none | Haiku | `docs/plans/09-tidy-action-buttons/**` |

**Rules for every slice:** change CSS and the two labels only; do not edit any `.js` file.

## Acceptance checklist
- [x] Served `index.html` has `New session` and `Refresh` for `#wbSessNew` / `#wbSessRefresh` and the B1 titles; "new session", "read again" lowercase labels are gone.
  - Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence9/01-served-labels.txt` (served on PORT=4199 at line 270–271, identical to disk; no button still reads "new session" or "read again". The only lowercase hit is prose on line 88, "a new session will walk in here".)
- [x] `styles.css` contains `.rootacts button.mini` with `white-space: nowrap`, `min-height: 40px`, `text-transform: none`; `.rootacts select` with `min-height: 40px` and `margin-top: 0`; `.rootacts` with `align-items: center`; `button.accent`; and a `max-width: 600px` media rule for `.rootacts`.
  - Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence9/02-styles-rules.txt` (served styles.css identical to disk; lines 115, 116, 378–383).
- [x] `git diff --stat` shows only `public/index.html` and `public/styles.css` (plus plan docs).
  - Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence9/03-git-diff-stat.txt` (2 files changed, 11 insertions, 3 deletions; untracked plan folder only).
- [ ] MANUAL: open the Sessions pane; both buttons are one line, same height as the picker, New session is teal, Refresh is neutral; check the Projects and Usage panes look consistent and nothing overflows at ~400px wide.

## Known issues
- [ ] MANUAL (checklist row 4, not automated; evidence and steps: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence9/04-manual-context.txt`): in a real browser, confirm on the Sessions pane that both buttons are one line, 40px tall like the picker, New session teal and Refresh neutral; check the Projects and Claude & usage panes look consistent; and check nothing overflows at ~400px wide. Full numbered steps are in that file.
- [ ] Note (not a failure, B5 scope): the buttons in the Projects pane (`choose folder`, `go up`, `new folder`) and the Claude & usage pane (`ask Claude again`) still have lowercase source labels. Their text now renders lowercase because `text-transform: none` applies. The plan only renames the two Sessions buttons.
- [ ] Note: the global `textarea, input, select` rule in `public/styles.css` (line 93) still sets `margin-top: 5px`. `.rootacts select` overrides this to 0 (line 380), so no change is needed, but the rendered picker height is unconfirmed until the MANUAL check runs.
