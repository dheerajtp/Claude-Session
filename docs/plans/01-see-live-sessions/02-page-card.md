# 01/02 — Page: setup card, Connect button, restart notice

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 01/01 · Parallel with: none

## Decisions you need
V4, V5 — run `grep -E '^\| (V4|V5) ' 00-README.md`. State shape from slice 01: `/api/state.hookSetup = {installed, missing, settingsPath, bridgePath, jq, curl}`; `POST /api/hooks/install` → 200 `{ok,status}` or `{error}` (409/503/500).

## Read first
- `public/index.html` lines 74–84 (Crew panel, `#empty` paragraph).
- `public/client.js`: initial load (~line 35), refresh (~103, ~118), `render()` (~line 310, the `$('empty').hidden` line).
- `public/styles.css`: the `.empty`, `.badge` and button styles to reuse.
- `README.md` section "Installing the hook bridge".

## Scope (files you own)
`public/index.html`, `public/client.js`, `public/styles.css`, `README.md`.

## Tasks
1. **Keep status.** Store `hookSetup` from every `/api/state` response in a module variable.
2. **Card.** Add `<div id="setup" hidden>` above `#empty` containing headline "Sessions from VS Code and your terminal can't reach this office yet.", one line "Connect them and a new session will walk in here.", a **Connect my sessions** button, and a small details line with `settingsPath`. Show it when `hookSetup && !hookSetup.installed`. If `jq` or `curl` is false, replace the button with "Install jq and curl first, then reload." (no button).
3. **Click.** POST `/api/hooks/install`; disable the button while pending; on success replace the card text with "Connected. Sessions that were already open need to be restarted — new ones will walk in." (keep it visible until the first agent appears or page reload); on `{error}` show the error text in the card and re-enable the button.
4. **Empty text.** When `hookSetup.installed` is true, keep the existing `#empty` text; when false, shorten it to "Nobody is in the room yet." so the card carries the explanation.
5. **README.** Add under "Installing the hook bridge": "Or press **Connect my sessions** on the page when it offers it."
6. Plain words only on the page (no "hook", "settings.json" outside the details line); no new dependencies.

## Done when
With `hookSetup.installed=false` (use a temp HOME: `HOME=$(mktemp -d)` with a minimal `.claude/settings.json`, run `node server.js`, open the page) the card and button appear; clicking installs, shows the restart notice, and `/api/state` then reports `installed:true`. With hooks installed the card is hidden. Do not click Connect against the real home settings. Append `## Result`.

## Result
- Status: DONE
- Files changed: public/index.html, public/client.js, public/styles.css, README.md
- Checks: node --check public/client.js PASS; temp-HOME server on 4199: installed=false -> POST install ok -> installed=true PASS; card visibility logic not browser-tested (no browser).
- Notes: Card hides on first agent after connect (V5); copy tweaks via renderSetup(). INCIDENT: an early test run mistakenly hit the real ~/.claude/settings.json (HOME override failed in that run); I reverted with `hooks/install-hooks.mjs --uninstall`, file is back to original {"theme":"dark"} and I deleted the .bak I created. Re-run later with HOME in the scratchpad worked correctly.
