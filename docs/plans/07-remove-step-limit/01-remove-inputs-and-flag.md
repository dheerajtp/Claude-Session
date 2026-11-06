# 07/01 — Remove the inputs and the flag

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: none

## Decisions you need
T1–T4 — run `grep -E '^\| (T1|T2|T3|T4) ' 00-README.md`.

## Read first
- `public/index.html`: the run form rows (~lines 45–58) and the workbench "Name this session" row (~lines 289–296).
- `public/client.js` ~lines 200–212 (`runForm` submit payload); `public/workbench.js` ~lines 698–710.
- `lib/claude-runner.js` lines 18 and 62–72 (constructor field, args array).
- `server.js` ~lines 310–317 and ~478–486 (the two `ClaudeRun` constructions); line ~100 is `sharpenPrompt`, leave it.

## Scope (files you own)
`public/index.html`, `public/client.js`, `public/workbench.js`, `lib/claude-runner.js`, `server.js`, `README.md`.

## Tasks
1. **HTML (T1).** Remove the Step limit `<div class="row">…</div>` block from the run form. In the workbench row keep `Name this session` and remove only the `Most steps it may take` label.
2. **Payloads (T1).** Delete the `maxTurns:` line in `client.js` and in `workbench.js`.
3. **Runner and server (T2).** Remove `this.maxTurns` and the `'--max-turns', String(this.maxTurns),` pair from `claude-runner.js`; remove both `maxTurns: body.maxTurns || 25,` lines in `server.js`.
4. **Docs (T4).** Edit `README.md` line ~50 as stated.
5. Do not touch T3 items. Leave `.fieldnote` CSS (the Model note uses it).

## Done when
`node --check` passes for the four JS files; `grep -rn "maxTurns\|wbSessTurns\|id=\"turns\"\|Step limit\|Most steps" public lib README.md server.js` finds nothing; `grep -n "max-turns" server.js lib/claude-runner.js` shows only the `sharpenPrompt` line; `grep -c "rounds of work" public/client.js` is still at least 2; `PORT=4199 node server.js` serves `/` (stop it by PID). Append `## Result`.

## Result
- Status: DONE
- Files changed: public/index.html, public/client.js, public/workbench.js, lib/claude-runner.js, server.js, README.md
- Checks: node --check x4 PASS; grep for maxTurns/wbSessTurns/etc. PASS (empty); max-turns only server.js:100 PASS; PORT=4199 serves / (200) PASS; "rounds of work" count FAIL-as-written (1, was 1 at HEAD; untouched)
- Notes: the "at least 2" expectation was wrong; other "rounds of work" strings use different wording.
