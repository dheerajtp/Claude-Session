# Agent Office

An isometric cutaway office where **real Claude Code sessions appear as avatars** — they
walk in, sit at a desk, run tools, and show plain-English progress. Nothing is simulated:
every state change on the floor comes from a live Claude session on this machine.

Three things it does beyond watching: **answer Claude Code's permission prompts from the page**
instead of the terminal, **keep a Finished shelf** of what each session completed after it has
closed and left the floor, and — behind the `+` button — **run your projects**: pick the folder
they live in, choose a branch, and send an agent into it without leaving the page.

Zero dependencies. No build step, no `node_modules`, no framework.

```bash
npm start          # node server.js  →  http://127.0.0.1:4173
npm run dev        # node --watch server.js
```

Requires Node 20+ and the `claude` CLI on PATH (or set `CLAUDE_BIN`). The server binds
`127.0.0.1` only.

---

## The two rooms, and the workbench

| Surface | What it shows |
| --- | --- |
| **Office floor** | Sessions that are running right now. One avatar per session, at a desk, with a speech bubble. |
| **Dormitory** | The standby roster — every subagent and skill available here — sleeping in beds. A bed wakes up (`ON SHIFT`) when a session actually calls it. |
| **Workbench** (the `+`) | Your projects on disk, their branches, and what Claude reports about itself: who is signed in, which sessions are open, what this office measured. |

The dorm is filled from the computer the office runs on. Before any session has spoken, it
reads your own agents and skills (`~/.claude/agents`, `~/.claude/skills`) and this project's
`.claude` folder — never a plugin marketplace's `.bak`/`.staging` copies, which the CLI does
not load. The first real session to report its `system/init` roster replaces that scan with
exactly what the session had available, and the cache in `data/inventory.json` stays on that
machine.

---

## How data reaches the floor

There are two independent paths, and both write to the same in-memory `Room`.

### 1. Native runs — started from the page

`POST /api/run` spawns the CLI directly:

```
claude -p <prompt> --output-format stream-json --verbose --max-turns N --permission-mode <mode> [--model X]
```

[lib/claude-runner.js](lib/claude-runner.js) parses the NDJSON stream and maps each message
to a room update: model, tools, turns, per-tool timings, token and cost totals, `TodoWrite`
task lists, skills used, and subagents launched. The prompt is passed as **argv, never
through a shell**.

### 2. External sessions — started in VS Code or a terminal

A session you start elsewhere knows nothing about the office, so it is reported through
**Claude Code hooks**. [hooks/claude-office-bridge.sh](hooks/claude-office-bridge.sh) posts
each hook event to `POST /api/hook`, and [lib/hook-bridge.js](lib/hook-bridge.js) turns it
into a room update.

```
VS Code / terminal claude
        │  hook fires, JSON on stdin
        ▼
claude-office-bridge.sh   (jq trims → curl, ~10ms, always exits 0)
        │  POST /api/hook
        ▼
lib/hook-bridge.js ──► Room ──► SSE ──► your browser
```

Events handled: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `PreCompact`, `Notification`,
`Stop`, `SessionEnd`.

Avatars are named after the folder the session is working in. They leave the floor on
`SessionEnd`; a session that dies without one (closed window, Ctrl-C) is reaped after
4 minutes of silence and forgotten after 20.

### Both paths write the same sentences

The plain-English activity line is produced by `humanTool()` / `humanResult()` in
[lib/claude-runner.js](lib/claude-runner.js), which the hook bridge imports — so an editor
session says `Reading public/dorm.js to see what is inside` exactly the way an
office-launched one does. Every event carries two strings: a terse technical `text` for the
per-agent log, and a `human` sentence for the ticker and the avatar bubble.

---

## Answer a permission prompt from the page

Claude Code stops and asks "allow this command?" in the terminal. You can now answer that
question in the office instead — for sessions you started in the page *and* for ones already
running in VS Code.

Nothing is held unless you ask for it. Approval routing is **opt-in, per session**:

- A run started from the page: tick **"Ask me here before anything that writes or runs a
  command"**.
- A session from your editor or terminal: press **"Route approvals here"** on its crew row.
  The button turns green while it is armed; press it again to hand the prompts back.

When an armed session wants to act, the office holds its `PreToolUse` hook and a rose card
appears under **Needs your answer**, with a live countdown:

| Button | What Claude Code receives |
| --- | --- |
| **Yes, do it** | `permissionDecision: "allow"` — the tool runs |
| **Yes, and stop asking about `Bash`** | the same, and later calls of that tool are never held again |
| **No** | `permissionDecision: "deny"` plus your reason, which the model reads and obeys |
| *(nobody answers within 50s)* | the hook prints nothing and exits — the terminal asks you as usual |

Three safety rules:

- **Only tools that can change something are held** — `Bash`, `Write`, `Edit`, `MultiEdit`,
  `NotebookEdit`, `WebFetch`, `WebSearch`, `KillShell`, `BashOutput`, `Restart`,
  `ExitPlanMode` and any `mcp__*` tool. Reads, searches and task lists pass through.
- **The office never strands a session.** If no page is connected, if the queue is already at
  12 cards, or if the 50-second window runs out, the prompt falls back to the terminal.
- **50s < the hook's own 60s timeout**, so the answer always arrives before Claude Code gives
  up on the hook.
- **The command on a card is shown exactly as it will run** — no shortening, no reformatting.
  Deciding on a command you cannot read is not a decision.

AskUserQuestion prompts get their own card, with one button per option. Choosing an option
replies with `allow` and injects your answer into the tool input; this is best-effort — if
Claude Code ignores the injected answer, use **Answer in the terminal**, which allows the call
untouched so the dialog appears as it always did.

---

## Everything on screen is a sentence

Claude Code's harness wraps parts of what it feeds the model in XML frames — a sub-agent's
hand-back, a background job's notification, the editor's selection. Shown as-is, the page
prints `<agent-message from="a547034…">` where a person expects to read what happened. Three
rules keep the office readable:

1. **Machine text is rewritten once, at the door.** [lib/plain.js](lib/plain.js) turns a
   harness frame into a sentence (`a helper finished and reported: STATUS: DONE. …`) and
   strips tags, `toolu_…` ids and 24-hex hashes. The hook bridge, the stream parser and the
   Finished shelf all run what they store through it, so raw markup is never saved and never
   painted. The client scrubs a second time for rows written by an older build.
2. **Nothing is cut in the middle of a word.** `words()` truncates on a space and adds an
   ellipsis; the avatar bubble wraps onto two lines and the DOM clamps long text instead of
   overflowing it.
3. **No jargon on the page.** Not "turn", "tool call", "session closed" or "cwd" — a crew row
   says *did 30 things · 1 round of work · took 3 minutes*, and a shelf row says *It finished
   its work in the web-crawler-app folder and closed*. Numbers the feed cannot measure are
   left out rather than shown as a misleading zero.

### Helpers get an avatar of their own

When a session calls the `Task`/`Agent` tool, the office seats its sub-agent as a second
avatar: named after the agent type, holding the one-line job it was given as its activity and
the full instruction under **the job it was given**, and tagged *helper working for
&lt;boss&gt;* on its crew row. It retires when the answer comes back (or fails) and leaves the
floor 90 seconds later, so a run that hires sixteen slice workers does not lock the room at
its 14-avatar cap. This now works for editor and terminal sessions too: the bridge seats them
from the parent's `PreToolUse`, the same way the stream parser seats its own.

## The Finished shelf

A session that ends used to disappear from the page along with what it accomplished. Now every
finished run is written to **`data/history.json`** and stays on the **Finished** shelf in the
right panel — through a reload, and through a restart of the office.

One row per session (a session that comes back for another turn updates its row and increments
its visit count), holding: the prompt, the folder, the outcome, wall-clock duration, turns, tool
calls, cost, which helpers and skills it used, and the closing report.

Outcomes are `finished the job`, `session closed`, `stopped with a problem`, `you stopped it`
and `went quiet`. A closed session keeps sitting at its desk for six minutes first, so you can
see how it ended, then leaves the floor and lives only on the shelf. The 60 most recent rows are
kept.

The report is honest about its limits: a native run's own result text is captured, while a
hooked (editor) session only ever reports what it *did*, never what it said — so its row says
"Its reply stayed in your terminal" instead of inventing a summary.

---

## The workbench — the `+` button

The floor shows what is happening. The workbench is where you *start* something: a floating
`+` in the bottom-right fans open into two actions, and both open the same full-page sheet
with two tabs.

**Projects.** One folder is your projects root, remembered in `data/settings.json`. The list
shows only folders, git repos first, each labelled with what it is (`git repo, node project`)
and how much is in it. Opening one shows the branch it is on, its other branches, the last
thing saved, and every file changed since then. From there:

- **Work in this folder** — fills the path into the ask form's folder box, closes the sheet,
  and puts your cursor in the prompt. Nothing else happens until you press Run.
- **Create a new branch** — `git switch -c <name>`, which carries your uncommitted files with
  you.
- **Move onto a branch** — `git switch <name>`.
- **New folder** — makes a directory inside the root, optionally with `git init -b main`.

**Claude & usage.** `claude auth status --json` for who is signed in and on what plan,
`claude agents --json` for every session open on this machine (pid, folder, idle or working,
how long, and whether it is standing on the office floor), plus the totals this office
measured itself: finished runs, tokens, dollars, things done, time, and the per-tool and
per-model ledgers.

### What the workbench is allowed to do to your files

The rule is **create and switch, never destroy**. It can name a branch and move between
branches. It cannot stash, reset, discard, clean or force — there is no code path that does
that. When a move would overwrite something you changed, git itself refuses, the page returns
`409`, and the message leads with the relief:

> `It did not move, and nothing changed. You are still on feature/gx-ai. … 7 files here are
> saved but not committed, and git will not overwrite them.`

Two authorities, deliberately different. **Browse** is read-only and reaches anywhere under
your home folder — you need that to pick a root — and it lists directory names only. **Work**
is confined to the chosen root: every path is `realpath`-resolved and rejected if it escapes,
if any segment is `.git`, or if it is under `~/.claude`, which holds your login and every
session transcript and is never opened by this app.

---

## Installing the hook bridge

```bash
node hooks/install-hooks.mjs              # merge into ~/.claude/settings.json
node hooks/install-hooks.mjs --uninstall  # remove only these entries
```

It **merges, never replaces**: your other settings (`env`, `permissions`, `model`) and any
existing hooks are left untouched, and a one-time backup is written to
`~/.claude/settings.json.agent-office.bak`.

**Hooks load when a session starts.** A Claude session that was already open when you
install will not report until you start a new one or reload the editor. This is the single
most common reason the floor looks empty.

Four rules the bridge never breaks:

- **Two speeds, one job.** Every event except an armed `PreToolUse` is fire-and-forget:
  `curl --max-time 1`, output discarded, exit `0`, stdout stays empty. Only a `PreToolUse`
  from a session you armed may wait — up to 50 seconds — and it prints *only* the verdict the
  office returned, nothing else. An unarmed session never waits and never prints, so Claude
  Code's own terminal prompt is untouched.
- **Cannot leak file contents.** `jq` truncates every string and replaces `tool_response`
  with a word count and a 200-character preview before posting.
- **Cannot double-seat the office's own runs.** Native children are spawned with
  `CLAUDE_OFFICE_OWNER` set, and the bridge exits immediately when it sees it — except for an
  armed `PreToolUse`, which the owner's own office still needs to hold.
- **Cannot hang the editor** if the office is down: a failed `curl` prints nothing and exits
  `0`, and the hook's own 60s timeout outlasts the office's 50s window.

Disable per-shell with `CLAUDE_OFFICE_DISABLED=1`, or point it elsewhere with
`CLAUDE_OFFICE_URL`.

---

## HTTP API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/state` | GET | Full snapshot: agents, recent events, health, dorm inventory, hook counters, open approvals, Finished shelf |
| `/api/stream` | GET | SSE feed (`hello`, `agent:update`, `agent:remove`, `ticker`, `inventory:update`, `run:finished`, `ask:open`, `ask:resolved`, `asks:update`, `projects:root`) |
| `/api/health` | GET | CLI detection, bind address, pid, uptime |
| `/api/inventory` | GET | Standby roster and usage ledger |
| `/api/history` | GET | The Finished shelf, as persisted on disk |
| `/api/run` | POST | Start a native Claude run (`approvalsHere: true` routes its prompts here) |
| `/api/stop` | POST | SIGTERM, then SIGKILL after 4s |
| `/api/sharpen` | POST | Rewrite a rough prompt into goal · scope · output format (max 2 at a time) |
| `/api/hook` | POST | Receive a Claude Code hook event. The only route that may answer slowly — an armed `PreToolUse` waits for you, everything else is answered immediately |
| `/api/ask` | POST | Answer a held prompt: `{askId, decision: allow\|deny\|fallthrough, remember?, reason?, answers?}` |
| `/api/arming` | POST | Route or un-route one session's approvals here; `409` if that session already ended |
| `/api/feed` | POST | Push an arbitrary agent update (any other app) |
| `/api/dismiss` | POST | Remove an avatar; hooked sessions get a 10-minute cooldown |
| `/api/projects?path=` | GET | One level of the projects root (relative path), folders first |
| `/api/project?path=` | GET | One folder's git detail: branch, branches, uncommitted files, last save |
| `/api/browse?path=` | GET | Read-only folder walk, confined to your home; used only to choose the root |
| `/api/usage` | GET | `claude auth status` + `claude agents` + this office's own totals (`?fresh=1` skips the cache) |
| `/api/projects/root` | POST | Choose the projects root |
| `/api/projects/folder` | POST | Create a folder inside the root (`git: false` skips `git init`) |
| `/api/project/branch` | POST | `{path, name, create}` — `git switch -c` / `git switch`; `409` with the uncommitted list if git refuses |

Agent states: `booting`, `walking`, `idle`, `thinking`, `working`, `blocked`, `error`,
`done`, `coffee`, `leaving`.

---

## Files

```
server.js              HTTP server, routes, static file serving
lib/room.js            In-memory state: agents, event ring (300), SSE broadcast
lib/plain.js           Machine text → one readable sentence; word-safe truncation
lib/claude-runner.js   Spawns claude -p, parses stream-json, owns the sentence wording
lib/hook-bridge.js     Hook events → room updates, lazy adoption, stale-session reaper
lib/asks.js            The approval desk: holds an armed PreToolUse, prints Claude's verdict
lib/history.js         The Finished shelf, one row per session, persisted to data/history.json
lib/inventory.js       Standby roster + usage ledger, cached to data/inventory.json
lib/projects.js        Folder browser, project detail, and the create-and-switch branch actions
lib/usage.js           claude auth status + claude agents + this office's own measured totals
public/iso.js          Isometric projection maths (tile 128×64, depth-sorted painter)
public/furniture.js    Desk, sofa, cooler, server rack, plants, boards
public/world.js        Office scene, avatar walking/animation, speech bubbles
public/dorm.js         Dormitory scene, beds, nameplate layout pass
public/client.js       SSE client, crew cards, approval cards, Finished shelf, activity stream
public/workbench.js    The + button and the page behind it: projects, branches, session & usage
public/styles.css      Layout and the two-column HUD
data/*.json            Machine-local, git-ignored: roster cache, Finished shelf, projects root
hooks/                 The bridge script and its installer
```

Rendering is hand-written Canvas 2D, not sprites. Because furniture is depth-sorted by
`gx + gy`, a label drawn with its own bed gets buried under the frame of the bed in front —
so both rooms collect label anchors during the scene pass and paint them in a **second
pass**, sorted by screen `y`, with greedy collision nudging and leader lines. The office
uses the same two-pass trick for speech bubbles: they stack upward, and when the ceiling is
reached they slide sideways into the margin instead of overlapping.

---

## What is deliberately not shown

- **Token and cost figures for hooked sessions.** Claude Code hooks do not report usage, so
  those fields are left out rather than displayed as `0` — a zero reads as a broken meter,
  not as "not measured".
- **A closing summary for hooked sessions.** Hooks report what a session *did*, never what it
  said back to you, so its Finished row says `Its reply stayed in your terminal` instead of
  passing your own prompt off as the report. Only runs started from the page have a real
  result to show.
- **Anything from `~/.claude/.credentials.json` or `~/.claude.json`.** The app uses the
  `claude` CLI's own existing login and never reads, prints, or stores credentials.
- **Invented activity.** If a session has not reported something, the office shows
  `no plan yet` rather than guessing at progress.
- **A tool count before a session reports one.** The installed roster is read from disk, which
  knows agents and skills but not the tools a session will expose, so that number appears only
  after a real session reports it.
- **A quota or usage-limit bar.** Claude Code publishes no endpoint for "62% of your weekly
  limit used", so the workbench states its plan and its measured totals and leaves the limit
  out, rather than drawing a gauge that would have to be invented.

---

## Troubleshooting

**The floor is empty but I'm working.**
Check `GET /api/state` → `hooks.arrived`. If it is not climbing, the session predates the
install: start a new one. If it is climbing but no avatar appears, read `hooks.dropped` —
it names the reason (`room full or dismissed`, `native`, `unhandled event`).

**The page looks like an old build.** The tab may be from before your last change.
Hard-reload with Ctrl+Shift+R.

**Restarting the server.** Never `pkill -f "node server.js"`. Read the `pid` from
`/api/health` and kill that. Sessions that were already running are re-adopted on their
next tool call, so a restart costs you a few seconds of visibility, not the session.

**An avatar will not go away.** Either it is a live session still reporting, or it has not
hit the 4-minute quiet threshold yet. `POST /api/dismiss` removes it now.
