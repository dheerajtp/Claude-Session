# 01 — See live Claude sessions on the floor

Master plan: none yet (this repo has no `docs/PLAN.md`) · Builds on: README "How data reaches the floor"

## Goal
- The person starts Claude in VS Code or a terminal and sees an avatar walk in. Today the floor stays at 0 because `~/.claude/settings.json` has no office hook (verified: only `theme`), so nothing posts to `/api/hook`.
- When nothing is arriving, the page says why in plain words and offers a one-click fix, not a generic "start one in VS Code".
- After the fix, the person is told exactly what to do next (sessions already open must be restarted).

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| V1 | **Cause.** Hooks are opt-in via `node hooks/install-hooks.mjs`; the page never checks or mentions it. Fix is detection + install from the page, not a change to the bridge script or `lib/hook-bridge.js`. |
| V2 | **Detection.** New `lib/hook-install.js` exports `hookStatus()` returning `{installed: bool, missing: string[], settingsPath, bridgePath, jq: bool, curl: bool}`; reads `~/.claude/settings.json` (absent file = not installed, never throws). Installed means every event in `EVENTS` has a group whose command contains the bridge path. `GET /api/state` gains `hookSetup: hookStatus()`. |
| V3 | **Install from page.** `POST /api/hooks/install` and `POST /api/hooks/uninstall` (localhost only, like every route) call the same merge logic as `hooks/install-hooks.mjs`, refactored so the CLI and the server share one function in `lib/hook-install.js`. Merge-only, one-time `.agent-office.bak` backup, atomic write, 200 `{ok, status}`; 409 `{error}` if settings.json is missing or not valid JSON (never overwrite it); 503 if `jq` or `curl` is missing. |
| V4 | **Page copy.** Empty-state and the Crew panel show a card when `hookSetup.installed === false`: "Sessions from VS Code and your terminal can't reach this office yet." + button **Connect my sessions**. After install: "Connected. Sessions that were already open need to be restarted — new ones will walk in." Plain words only (README rule 3: no "hook", "settings.json" in headline text; the path appears in a details line). |
| V5 | **First signal.** Once installed and the first `/api/hook` event arrives, the card disappears. If installed but no event for the session start, nothing extra is shown. |
| V6 | **Out of scope.** Auto-installing on `npm start` without a click, changing the bridge, Windows support, plugin-based hook distribution. |

## Status
- [x] 01 — Shared install module, status in `/api/state`, install/uninstall routes
- [x] 02 — Page: setup card, button, restart notice; README update
- [x] 03 — Acceptance

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | none | Sonnet | `lib/hook-install.js`, `hooks/install-hooks.mjs`, `server.js` |
| 02 | 01 | none | Sonnet | `public/index.html`, `public/client.js`, `public/styles.css`, `README.md` |
| 03 | 02 | none | Haiku | `docs/plans/01-see-live-sessions/` |

**Rules for every slice:** zero dependencies, no build step. Never write to `~/.claude/settings.json` in tests — point the module at a temp path via an `HOME`/`settingsPath` argument.

## Acceptance checklist
- [ ] With hooks absent, the page shows "can't reach this office yet" and **Connect my sessions**.
- [x] Pressing it adds the 11 events to `~/.claude/settings.json`, keeps the other keys, creates `.agent-office.bak` once.
  - Evidence: POST /api/hooks/install on temp HOME -> ok, 11 events, theme kept, one .bak = {"theme":"dark"} (02-install-button.txt)
- [ ] The card then says to restart open sessions; a new `claude` session in a terminal walks onto the floor.
- [x] Running the CLI installer and the button twice produces no duplicate groups.
  - Evidence: 2nd POST + 2 CLI runs -> 1 group per event, settings and .bak sha unchanged (04-no-duplicates.txt)
- [x] A malformed settings.json returns 409 and is left byte-for-byte unchanged.
  - Evidence: install and uninstall both HTTP 409, shasum acfa8b25... before and after (05-malformed-409.txt)
- [ ] `node hooks/install-hooks.mjs --uninstall` still works and the card reappears.

## Known issues
- MANUAL (row 1): the card's look in a browser was not checked. The served HTML has `#setup` with "can't reach this office yet" and **Connect my sessions**, and `/api/state.hookSetup.installed` is false when hooks are absent. Steps: (1) Start the server with a temp HOME whose `.claude/settings.json` is `{"theme":"dark"}`. (2) Open the page with no agents running. (3) Check that the Crew panel shows the card and button.
- MANUAL (row 3): the restart notice was checked in code only (client.js:62). Steps: (1) Click **Connect my sessions**. (2) Check that the card says sessions already open need to be restarted. (3) Open a new terminal and run `claude`. (4) Check that an avatar walks onto the floor and the card disappears (V5). This needs the person's real `~/.claude/settings.json`, so the person should do it on purpose.
- MANUAL (row 6, visual part): `node hooks/install-hooks.mjs --uninstall` works: it exits 0, leaves only `theme`, and `/api/state.hookSetup.installed` goes back to false (06-cli-uninstall.txt). Not checked: that the card reappears. Steps: (1) After step 6, reload the page. (2) Check that the card is visible again.
- Evidence was saved outside the repo, in the session scratchpad `evidence/` folder, as the dispatch asked, not in `docs/plans/01-see-live-sessions/evidence/`.
- Port 4199 was held by a leftover test server from an earlier slice (pid 28220, temp HOME `scratchpad/home`). It was left running, and acceptance used port 4198.
