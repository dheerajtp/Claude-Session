# 03 — Answer Claude's questions from the browser

Master plan: none yet (no `docs/PLAN.md`) · Builds on: README "Answer a permission prompt from the page" (`lib/asks.js`, `askRow()` in `public/client.js`)

## Goal
- When Claude asks a multiple-choice question (`AskUserQuestion`) in a session the person armed with **Route approvals here**, they answer it on the Agent Office page without switching windows.
- The page card supports everything the terminal dialog does: several questions, pick-many questions, and typing your own answer.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| X1 | **What already exists.** `lib/asks.js` holds a session's `PreToolUse` for `AskUserQuestion` only when that session is armed (`Asks.needs()`), shows a card in `#askList`, and returns `permissionDecision: "allow"` with `updatedInput.answers` (`readAnswers()`, `settle()`). No change to `hooks/claude-office-bridge.sh`, the 50s window (`ANSWER_WINDOW_MS`) or the fall-through to the terminal (no page connected, queue full, timeout). |
| X2 | **Opt-in stays.** Questions are held only for sessions the person armed with **Route approvals here** (`Asks.needs()` is unchanged). No default-on, no global preference, no new routes. |
| X3 | **Server limits.** `readAnswers()` keeps max 4 questions and 4 values per question but allows 300 chars per value (was 80) so typed answers are not cut. Values stay strings; keys stay the question text. |
| X4 | **Rich question card.** In `askRow()` for `ask.kind === 'question'`, render per question: its `header` as a small chip, the question text, then options. Single-select: option buttons that toggle a selected state (one at a time). `multiSelect`: checkboxes. Every question also has a text input "Or type your own answer" (max 300 chars); typing clears the option selection and vice versa. One **Send answers** button, disabled until every question has an answer; it posts `{askId, decision:'allow', answers:{[question]: string | string[]}}`. **Answer in the terminal** (`decision:'allow'`, no answers) stays. Option `description` shows as a muted line under its label. |
| X5 | **Alert text.** `announceNeedsYou(say, ask)` in `public/notify.js` takes the card: title "Claude asks: " + first question (cut to 80 chars, whole words), body "Answer it on the Agent Office page." Called from the `ask:open` branch in `public/client.js` with `msg.ask` for questions; approvals keep today's text. |
| X6 | **Out of scope.** Default-on question routing, a header toggle, longer than 50s answer windows, plan-mode (`ExitPlanMode`) handling, mobile push, remembering answers. |

## Status
- [x] 01 — Rich question card, longer typed answers, question alert text, README
- [x] 02 — Acceptance (3 PASS, 2 MANUAL)

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | none | Sonnet | `lib/asks.js`, `lib/asks.test.mjs`, `public/client.js`, `public/styles.css`, `public/notify.js`, `README.md` |
| 02 | 01 | none | Haiku | `docs/plans/03-answer-questions-in-browser/` |

**Rules for every slice:** zero dependencies, no build step, plain words on the page. Never touch the real `~/.claude/settings.json`; tests use temp files and a spare port (4198), not 4173.

## Acceptance checklist
- [x] For an armed session, an `AskUserQuestion` hook posted to `/api/hook` opens a card and the held request returns `updatedInput.answers` after the card is answered (evidence: `02-e2e.txt`).
- [x] An unarmed session's `AskUserQuestion` and `Bash` calls are still not held (`02-e2e.txt`).
- [x] A typed answer of 250 characters arrives intact; one of 400 is cut at 300 with an ellipsis (`02-e2e.txt`, test `typed answers keep up to 300 chars`).
- [ ] MANUAL — The card shows several questions, a pick-many question and a typed answer, and Send answers stays disabled until all are answered.
- [ ] MANUAL — The alert for a question names the question.

## Known issues
- No `## Acceptance checklist` section exists in this README, so there were no boxes to tick. Slice 02 checked the rows listed in its own Tasks; 02 stays unticked under Status until a checklist is added. Results are in `02-acceptance.md` under `## Result`. Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence3/`.
- MANUAL (card rows: several questions, pick-many, typed answer, Send disabled until complete, alert names the question). This needs a browser. The numbered steps are in `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence3/04-manual-card-rows.txt`. Short version: 1. Start `HOME=$(mktemp -d) PORT=4198 node server.js` and open http://127.0.0.1:4198. 2. Seat `s-armed` with a `SessionStart` hook post, then `POST /api/arming {agentId:"s-armed",on:true}`. 3. Post an `AskUserQuestion` `PreToolUse` with two questions (one `multiSelect`) and leave it waiting. 4. Confirm the alert title is "Claude asks: <first question>". 5. Confirm the card shows both questions with header chips: radios for the first, checkboxes for the second, and a type-your-own box on each (max 300 chars). Typing clears the picks, and picking clears the typed text. 6. Confirm **Send answers** stays disabled until both questions are answered. Click it, and the waiting curl should print `updatedInput.answers`. 7. Confirm **Answer in the terminal** returns allow with no answers.
- Observed (not a row): `readAnswers()` runs typed answers through `words()`/`stripJunk()`, which removes any token of 24 or more hex characters (`HEX` in `lib/plain.js`). If someone types a full git SHA, it is silently removed. If every answer ends up blank, the hook returns allow with no answers, so the terminal asks again. Evidence: `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence3/03-observation-hex-typed-answers.txt`, `/private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/c6d5fe96-c86a-4b1a-a3f5-4889672d7884/scratchpad/evidence3/02a-held-response.json`.
