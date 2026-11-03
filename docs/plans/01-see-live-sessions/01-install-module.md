# 01/01 — Shared hook-install module, status in /api/state, install routes

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: none

## Decisions you need
V1, V2, V3 — run `grep -E '^\| (V1|V2|V3) ' 00-README.md`.

## Read first
- `hooks/install-hooks.mjs` (whole file, 87 lines): the merge/uninstall logic to extract.
- `server.js` lines 186–200 (`/api/state`, `hookStats()` usage) and the `if (p === '/api/hook')` block (~line 318) for route style (`readBody`, `send`).
- `lib/hook-bridge.js` `hookStats` (~line 429) — do not modify.

## Scope (files you own)
`lib/hook-install.js` (new), `hooks/install-hooks.mjs`, `server.js` (only the state field + two routes + one import), `lib/hook-install.test.mjs` (new, runs with `node --test`).

## Tasks
1. **Module.** `lib/hook-install.js` exports `EVENTS`, `BRIDGE` (abs path to `hooks/claude-office-bridge.sh`), `hookStatus({settingsPath})`, `installHooks({settingsPath})`, `uninstallHooks({settingsPath})`. `settingsPath` defaults to `~/.claude/settings.json`. Functions return data, never `process.exit`/`console.log`.
   - `hookStatus` → `{installed, missing, settingsPath, bridgePath, jq, curl}`. Missing/unreadable/invalid file → `installed:false`, never throws. `jq`/`curl` via `spawnSync('which', [name])`.
   - `installHooks` → same merge as the CLI (idempotent, other keys and hooks untouched, `.agent-office.bak` once, atomic temp+rename keeping file mode, `chmod 755` bridge). Throws `Error` with `.code` = `'NO_SETTINGS'` (file absent), `'BAD_JSON'`, `'NO_TOOLS'` (jq or curl missing), `'NO_BRIDGE'`. Returns `{added, status}`.
   - `uninstallHooks` → same as the CLI `--uninstall`; returns `{removed, status}`.
2. **CLI.** Rewrite `hooks/install-hooks.mjs` as a thin wrapper over the module; keep its flags and its printed lines.
3. **Server.** Add `hookSetup: hookStatus()` to the `/api/state` object. Add `POST /api/hooks/install` and `POST /api/hooks/uninstall`: 200 `{ok:true,status}`; `NO_SETTINGS`/`BAD_JSON` → 409 `{error}` in plain words; `NO_TOOLS` → 503; `NO_BRIDGE` → 500. Do not log file contents.
4. **Tests** (`node --test lib/hook-install.test.mjs`, temp dir settings only): fresh install adds 11 events and keeps `theme`; second install adds 0 and creates no duplicate; existing foreign hook on `Notification` survives install and uninstall; invalid JSON → `BAD_JSON` and file bytes unchanged; absent file → `NO_SETTINGS`; backup created once.

## Done when
`node --test lib/hook-install.test.mjs` passes; `node server.js` starts and `curl -s 127.0.0.1:4173/api/state | jq .hookSetup` shows the status; `node hooks/install-hooks.mjs --help`-free run against a temp HOME behaves as before. Never touch the real `~/.claude/settings.json`. Append `## Result`.

## Result
- Status: DONE
- Files changed: lib/hook-install.js, lib/hook-install.test.mjs, hooks/install-hooks.mjs, server.js
- Checks: node --test lib/hook-install.test.mjs → PASS (6/6); node --check on changed files → PASS; CLI install/uninstall against temp HOME → PASS; /api/state hookSetup on PORT=4199 → PASS
- Notes: port 4173 was already held by another running server (old code), so I verified on PORT=4199. Install/uninstall routes were not curl-tested (would hit the real settings.json); only the module was tested. Routes sit before /api/inventory in server.js.
