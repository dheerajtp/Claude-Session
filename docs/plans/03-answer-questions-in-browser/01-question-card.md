# 03/01 — Rich question card, longer typed answers, question alert text

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: none

## Decisions you need
X1, X3, X4, X5 — run `grep -E '^\| (X1|X3|X4|X5) ' 00-README.md`.

## Read first
- `lib/asks.js`: `readQuestions()` (~line 256: each question is `{index, question, header, multiSelect, options:[{label, hint}]}` — `hint` is the option's description), `readAnswers()` (~line 277), `answer()` (~line 117), `settle()`/`updatedInput` (~line 207).
- `public/client.js`: `askRow()` (~line 435, the `ask.kind === 'question'` branch), `answerAsk()` (~line 490), `tickCountdown()`, the `ask:open` branch in `connect()` (~line 123).
- `public/notify.js`: `announceNeedsYou()` (~line 92).
- `public/styles.css`: `.askitem`, `.askbtns`, `.askdetail`, `.mini` rules (~lines 244–260, 309).

## Scope (files you own)
`lib/asks.js`, `lib/asks.test.mjs` (new, `node --test`), `public/client.js`, `public/styles.css`, `public/notify.js`, `README.md`.

## Tasks
1. **Answer length (X3).** In `readAnswers()` raise the per-value cut from `words(…, 80)` to 300. Keep ≤4 questions, ≤4 values per question, keys = question text clipped to 240.
2. **Card (X4).** Rewrite only the question branch of `askRow()`. For each `q` of `ask.questions`: a small `chip` showing `q.header` (skip if empty) — NOTE the class `chip` is shared; use a new class `qhead` for it; the question text in a `div.qtext`; one `div.qopts` per question holding, for every option, a `<label class="qopt">` with an `<input type="radio" name="q<ask.id>-<index>">` (or `type="checkbox"` when `q.multiSelect`), the label text in `<b>` and `o.hint` (if any) in `<span class="qhint">`; and a `<input type="text" class="qother" maxlength="300" placeholder="Or type your own answer">`. Typing in `.qother` unchecks that question's options; checking an option clears `.qother`.
   - Keep state in the DOM; a helper `collect(li, ask)` returns `{[q.question]: string | string[]}` using checked labels (array for multiSelect) or the trimmed typed text; `null` if any question has no answer.
   - One `<button class="mini answer allow">Send answers</button>` disabled until `collect()` is non-null (re-check on every `change`/`input`); click → `answerAsk(ask.id, {decision:'allow', answers})`. Keep the **Answer in the terminal** button (`{decision:'allow'}`).
   - The approval (non-question) branch and the countdown line stay exactly as they are.
2b. **Styles.** Add `.qhead`, `.qtext`, `.qopts`, `.qopt`, `.qhint`, `.qother` rules to `styles.css` beside the `.ask*` rules: stacked, readable at the panel width, options as full-width tappable rows (padding 6px 8px, border-radius 8px, subtle border, `:has(input:checked)` highlight in `var(--teal)`), `.qhint` muted 11px on its own line, `.qother` full width matching the page's inputs. No horizontal overflow.
3. **Alert text (X5).** `announceNeedsYou(say, ask)` in `notify.js`: when `ask?.kind === 'question'` and it has a first question, title = `Claude asks: ` + that question cut at a word boundary to 80 chars (add `…` if cut), body `Answer it on the Agent Office page.`; otherwise today's text. In `client.js` call `announceNeedsYou(banner, msg.ask)`.
4. **README.** In "Answer a permission prompt from the page", replace the sentence about AskUserQuestion buttons with: the card shows every question with its options (checkboxes for pick-many), a box to type your own answer, and one Send answers button; **Answer in the terminal** still hands it back.
5. **Tests (`lib/asks.test.mjs`).** Using `new Asks({clients:new Set([1]), touch(){}, syncAgent(){}, broadcast(){}})` stub room and a fake agent `{id:'a',name:'a',sessionId:'s'}`: (a) armed session + `AskUserQuestion` → `needs()` returns `'question'`; unarmed → `null`; unarmed `Bash` → `null`. (b) `hold()` then `answer(id,{decision:'allow',answers:{[q]:'x'.repeat(250)}})` resolves with `hookSpecificOutput.updatedInput.answers[q].length === 250`; 400 chars → 300; a multiSelect array of 2 labels is kept as an array. Read `settle()`/`answer()` first to see the exact resolved shape.

## Done when
`node --test lib/asks.test.mjs` and `node --test lib/hook-install.test.mjs` pass; `node --check lib/asks.js public/client.js public/notify.js` pass; `PORT=4198 node server.js` serves `/` (stop it afterwards). You cannot run a browser: state that in `## Result`. Append `## Result`.

## Result
- Status: DONE
- Files changed: lib/asks.js, lib/asks.test.mjs (new), public/client.js, public/styles.css, public/notify.js, README.md
- Checks: node --test asks+hook-install tests → PASS (9); node --check asks/client/notify → PASS; PORT=4198 server GET / → 200 PASS (stopped)
- Notes: Not tested in a browser (cannot run one). Plan-02 edits left intact. README ask paragraph rewritten.
