# 06 — Clear "rewrite my request" button

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../05-clearer-crew-cards/00-README.md`](../05-clearer-crew-cards/00-README.md) (same plain-words rule)

## Goal
- A person reading the button under "What to ask for" knows what it does and what will happen to their text, before clicking.
- Every state (empty box, working, done, undone, error) says so in plain words, and the button's own label always matches the state.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| K1 | **Label.** `#sharpenBtn` reads **Rewrite my request** (was "Make my ask clearer"). Its `title` is `Claude rewrites what you typed into a fuller request. Nothing is run and your original is kept so you can undo it.` |
| K2 | **Visible explanation.** `#sharpenNote` (class `hintline`) is wrapped plain text, not uppercase-spaced mono, 11px `var(--dim)`, shown on its own line under the button. Idle text: `Claude rewrites what you typed so the agent knows the goal, what to touch, and what answer to give. You can undo it.` |
| K3 | **States (exact strings).** Empty box on click → `Type what you want first, then click this.` · Working → button `Rewriting…` (disabled), note `Claude is rewriting your request. It only reads, nothing is changed.` · Done → button **Undo rewrite**, note `Rewritten by Claude. Edit it freely, or click Undo rewrite to get your own words back.` · After undo → button **Rewrite my request**, note `Back to your own words.` · Error → button **Rewrite my request**, note `Could not rewrite it: <server message>. Your text is unchanged.` |
| K4 | **One label source.** All button/note text changes go through one function `setRewriteUi(state, detail)` in `public/client.js`. Fixes the current bug: the `finally` block resets the label to "Sharpen prompt", which is not what the page ships. Editing the textbox after a rewrite resets to the idle state (clears `dataset.sharpened`). |
| K5 | **Plain words.** The visible strings "sharpen", "prompt", "ask" (as a noun) must not appear. Ids, function names, `/api/sharpen` and `server.js` are unchanged; no server change. |

## Status
- [x] 01 — Button, states and helper text (gated by orchestrator: node --check, forbidden-string grep, diff vs Scope; no verify-slice.sh or root lint in this repo)
- [x] 02 — Acceptance (3 PASS, 1 MANUAL)

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | none | Sonnet | `public/index.html`, `public/client.js`, `public/styles.css` |
| 02 | 01 | none | Haiku | `docs/plans/06-clear-rewrite-button/**` |

**Rules for every slice:** do not touch `server.js`, `sharpenPrompt()` in `client.js` (the fetch helper) or the crew-card sharpen code near `client.js:1020`.

## Acceptance checklist
- [x] Served `index.html` has the button text `Rewrite my request` and the K2 idle note; the old strings "Make my ask clearer" and "how far to go" are gone.
  - Evidence: PORT=4199 served page has label, K1 title and K2 note; old strings count 0 — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence6/01-served-index.txt`
- [x] `grep -n "Sharpen prompt\|Sharpening" public/client.js` finds nothing.
  - Evidence: no matches, grep exit=1 — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence6/02-grep-sharpen.txt`
- [x] A node/jsdom-style harness of `setRewriteUi` shows the exact K3 strings for each state.
  - Evidence: all 6 states (idle/empty/working/done/undone/error) match K3, working disabled=true — `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence6/03-setRewriteUi-harness.txt`
- [ ] MANUAL: in the browser the note wraps under the button without horizontal overflow at ~300px and is readable.

## Known issues
- MANUAL: note wrapping under the button with no horizontal overflow at ~300px, and readability, needs a real browser. Steps: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence6/04-manual-wrap-steps.txt`.
