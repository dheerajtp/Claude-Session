# 07 — Remove the step limit

Master plan: none yet (no `docs/PLAN.md`) · Builds on: [`../06-clear-rewrite-button/00-README.md`](../06-clear-rewrite-button/00-README.md) (same form; its uncommitted-then-added `.fieldnote` rule stays)

## Goal
- The page no longer asks for a step limit anywhere; runs started from the page go until Claude finishes.
- The read-only "N rounds of work" stats stay exactly as they are.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| T1 | **Remove both inputs.** Delete `<label class="grow">Step limit …</label>` and its `<div class="row">` (id `turns`, with its `.fieldnote`) in the "Send an agent to a desk" form, and delete `<label>Most steps it may take` (id `wbSessTurns`) from the workbench session form row in `public/index.html` (the "Name this session" row stays, minus that label). Delete the `maxTurns:` payload line at `public/client.js:206` and at `public/workbench.js:704`. |
| T2 | **No limit at all (user choice).** `lib/claude-runner.js` drops `this.maxTurns` and the `'--max-turns', String(this.maxTurns)` args pair, so the CLI is spawned without `--max-turns`. `server.js` drops the `maxTurns: body.maxTurns \|\| 25,` line at both `ClaudeRun` constructions (~315 and ~483). A `maxTurns` key in a request body is ignored. |
| T3 | **Keep.** The rewrite helper `sharpenPrompt()` in `server.js` (~line 100) keeps its internal `--max-turns 1` (it is not a user setting). Keep every "N rounds of work" stat: `client.js` ~787, ~901, ~978 and `server.js` ~407 (`turns` counter). |
| T4 | **Docs.** `README.md` line 50: remove ` --max-turns N` from the command line shown. |

## Status
- [x] 01 — Remove the inputs and the flag (gated by orchestrator: diff vs Scope, node --check x4, greps, stat lines intact; no verify-slice.sh or root lint in this repo)
- [x] 02 — Acceptance (3 PASS, 1 MANUAL)

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | none | Sonnet | `public/index.html`, `public/client.js`, `public/workbench.js`, `lib/claude-runner.js`, `server.js`, `README.md` |
| 02 | 01 | none | Haiku | `docs/plans/07-remove-step-limit/**` |

**Rules for every slice:** do not touch the `turns` stat code (T3) or `sharpenPrompt()`.

## Acceptance checklist
- [x] `grep -rn "maxTurns\|wbSessTurns\|id=\"turns\"\|Step limit\|Most steps" public lib README.md` finds nothing; `grep -n "max-turns" server.js lib/claude-runner.js README.md` finds only the `sharpenPrompt` line.
  - Evidence: first grep empty (exit 1); max-turns only at server.js:100 inside sharpenPrompt() — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence7/01-greps.txt
- [x] A harness builds `new ClaudeRun(...)` args (or reads the args array) and shows no `--max-turns`; `node --check` passes on `server.js`, `lib/claude-runner.js`, `public/client.js`, `public/workbench.js`.
  - Evidence: spawn-stubbed harness with maxTurns:25 in opts printed args without --max-turns, run.maxTurns undefined; node --check x4 exit 0 — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence7/02-args-and-check.txt
- [x] `grep -n "of work" public/client.js` still finds the three stat lines (~786, ~900, ~977), and `git diff public/client.js` shows only the deleted `maxTurns:` line.
  - Evidence: stat lines at 786, 900, 977; diff is 1 deletion (the maxTurns line) — /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence7/03-stats-and-diff.txt
- [ ] MANUAL: reload the page; the form shows Model, then "What it is allowed to do", with no step box in the run form or the workbench session form, and Run agent still starts a run.

## Known issues
- MANUAL (checklist row 4): confirm the form in a browser. Served HTML on PORT=4199 already shows Model (line 46) followed by "What it is allowed to do" (line 52) and no step inputs; see /private/tmp/claude-502/-Users-corivance-Documents-Projects-Claude-Session/ba210e62-d664-446f-ba17-7d05cfe10235/scratchpad/evidence7/04-manual-support-html.txt. Steps:
  1. Run `node server.js` and open the page (reload it if it is already open).
  2. In "Send an agent to a desk", check that the fields are Model and then "What it is allowed to do", with no step-limit box.
  3. Open the workbench session form and check that "Name this session" is there and "Most steps it may take" is gone.
  4. Enter a short prompt and click Run agent. Check that an agent starts (it appears and begins working) and that the server log shows no error.
