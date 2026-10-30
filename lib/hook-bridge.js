// Turns Claude Code hook events into room updates, so a session started in VS Code or
// a terminal walks onto the floor next to the office's own runs.
//
// The shell hook posts the raw payload untouched; every readable sentence is produced
// here, so a hooked session says exactly what a stream-json session says.

import { humanTool, humanResult, toolSummary, oneline, clip, short } from './claude-runner.js';
import { humanize, words } from './plain.js';

const MAX_HOOKED_AGENTS = 14;

// Open tool calls, keyed "sessionId + toolUseId". This has to live in the server: each
// hook invocation is a fresh process that cannot remember its own PreToolUse.
const openTools = new Map();
// Helper avatars seated from a hooked session's Task/Agent call, keyed the same way, so
// the matching PostToolUse can retire the right avatar.
const helperSeats = new Map();
const key = (sid, id) => `${sid}\u0000${id}`;
const callKey = (sid, body) => key(sid, String(body.tool_use_id || body.tool_name || 'tool'));

// A window closed or a Ctrl-C never sends SessionEnd, so stale sessions are swept.
const GOING_QUIET_MS = 4 * 60 * 1000;
const FORGOTTEN_MS = 20 * 60 * 1000;
// A closed session stays on the floor long enough to be read before it walks off.
const CLOSED_ON_FLOOR_MS = 6 * 60 * 1000;
// Long enough to read a helper's hand-back, short enough that it never blocks a seat.
const HELPER_ON_FLOOR_MS = 90 * 1000;

// Resolves with the JSON the hook script must print (an approval verdict), or null.
export async function handleHook(room, body, deps = {}) {
  const event = String(body?.hook_event_name || '');
  const sid = String(body?.session_id || '');
  if (!event || !sid) return { ok: false, error: 'hook needs hook_event_name and session_id' };

  const { asks, history } = deps;
  stats.arrived += 1;
  stats.byEvent[event] = (stats.byEvent[event] || 0) + 1;

  // The office's own runs are already reported by the stream-json parser; letting their
  // hooks through too would seat the same session twice. Their PreToolUse calls still
  // route here, because a headless run has no terminal to ask in.
  const native = isNativeRun(room, sid);
  if (native) {
    if (event !== 'PreToolUse' || !asks?.needs(body, sid)) return drop({ ok: true, ignored: 'native' });
    const agent = [...room.agents.values()].find((a) => a.sessionId === sid && a.source === 'claude');
    const verdict = await asks.hold(agent, body, 'approval');
    return { ok: true, native: true, ...(verdict ? { hookSpecificOutput: verdict } : {}) };
  }

  if (event === 'SessionEnd') {
    for (const k of [...openTools.keys()]) if (k.startsWith(`${sid}\u0000`)) openTools.delete(k);
    dropSeats(room, sid);
    const agent = room.agents.get(sid);
    if (agent) {
      const closed = Date.now() - (agent.startedAt || Date.now());
      room.touch(sid, {
        state: agent.state === 'error' ? 'error' : 'done',
        activity: agent.state === 'error' ? 'Ended on a problem' : 'Finished its work and closed',
        endedAt: Date.now(),
        durationMs: closed,
        closedAt: Date.now(),
      });
      record(history, agent, agent.state === 'error' ? 'error' : 'closed', { durationMs: closed });
      asks?.forgetSession(sid);
      room.syncAgent(sid, {
        kind: 'ok',
        text: `session end · ${agent.toolCalls || 0} tools`,
        human: `It closed the session${closed > 3000 ? ` after ${humanDuration(closed)}` : ''} — the summary is on the Finished shelf.`,
      });
    }
    return { ok: true, ended: true };
  }

  let agent = room.agents.get(sid);
  if (!agent && event !== 'SessionStart') {
    agent = adopt(room, sid, body);
    if (!agent) return drop({ ok: true, ignored: 'room full or dismissed' });
  }

  // An armed session stops here until a person answers on the page. The verdict is
  // carried out at the end: the call still has to be counted and logged like any other.
  let verdict = null;
  if (event === 'PreToolUse' && asks) {
    const kind = asks.needs(body, sid);
    if (kind) {
      const held = agent || adopt(room, sid, body);
      if (held) verdict = (await asks.hold(held, body, kind)) || null;
    }
  }

  const turn = TURNS[event]?.(body, agent, sid);
  if (!turn) return drop({ ok: true, ignored: 'unhandled event' });

  const patch = {
    ...turn.patch,
    source: 'claude-hook',
    sessionId: sid,
    name: agent?.name || hookName(room, body.cwd, sid),
    cwd: oneline(body.cwd) || agent?.cwd || null,
    turns: agent?.turns || 0,
    toolCalls: agent?.toolCalls || 0,
  };
  if (turn.countTurns) patch.turns += 1;
  if (turn.countTool) patch.toolCalls += 1;

  room.upsert(sid, patch);
  if (turn.log) room.pushLog(sid, turn.log);
  if (turn.note) room.syncAgent(sid, turn.note);
  else room.syncAgent(sid);
  // A Task/Agent call means a helper is working, so give it an avatar of its own rather
  // than leaving a name inside a list nobody can expand.
  if (event === 'PreToolUse') seatHelper(room, sid, body);
  else if (event === 'PostToolUse') retireHelper(room, sid, body, true);
  else if (event === 'PostToolUseFailure') retireHelper(room, sid, body, false);
  if (turn.finished) record(history, room.agents.get(sid), turn.outcome || 'finished', { durationMs: patch.durationMs, newTurn: true });
  return { ok: true, agentId: sid, state: patch.state || null, ...(verdict ? { hookSpecificOutput: verdict } : {}) };
}

// Only a real finish writes the ledger — a turn that ended with nothing done is noise.
function record(history, agent, outcome, extra) {
  if (!history || !agent) return null;
  if (!agent.toolCalls && !agent.turns && outcome === 'finished') return null;
  return history.record(agent, outcome, extra);
}

// The office seats helper avatars the same way for a hooked session as the stream parser
// does for its own runs; the seat only exists once the parent is on the floor.
function seatHelper(room, sid, body) {
  const name = String(body.tool_name || '');
  if (name !== 'Task' && name !== 'Agent') return;
  const input = body.tool_input || {};
  const parent = room.agents.get(sid);
  if (!parent) return;
  const childId = room.onSubagent?.(parent, {
    subagent_type: input.subagent_type,
    description: input.description,
    prompt: input.prompt,
  });
  if (childId) helperSeats.set(callKey(sid, body), childId);
}

// Its answer came back (or failed), so the helper's shift is over.
function retireHelper(room, sid, body, ok) {
  const seat = helperSeats.get(callKey(sid, body));
  if (!seat) return;
  helperSeats.delete(callKey(sid, body));
  const child = room.agents.get(seat);
  if (!child || child.endedAt) return;
  const ms = Date.now() - (child.startedAt || Date.now());
  room.touch(seat, {
    state: ok ? 'done' : 'error',
    activity: ok ? 'Finished the job it was given' : 'Could not finish the job it was given',
    endedAt: Date.now(),
    durationMs: ms,
  });
  room.syncAgent(seat, {
    kind: ok ? 'ok' : 'error',
    text: `${child.name} ${ok ? 'handback' : 'failed'} · ${humanDuration(ms)}`,
    human: ok
      ? `The ${child.name} helper finished its job in ${humanDuration(ms)} and handed the answer back.`
      : `The ${child.name} helper could not finish the job it was given.`,
  });
}

// A session that is gone can never report its helpers, so end their shifts and let the
// reaper clear the seats — otherwise a closed run would hold avatars on the floor.
function dropSeats(room, sid) {
  for (const [k, seat] of [...helperSeats.entries()]) {
    if (!k.startsWith(`${sid}\u0000`)) continue;
    helperSeats.delete(k);
    const child = room.agents.get(seat);
    if (child && !child.endedAt) {
      room.touch(seat, { state: 'done', activity: 'Finished when its session closed', endedAt: Date.now() });
    }
  }
}

// Every event handler returns { patch, note?, log?, countTurns?, countTool? }.
const TURNS = {
  SessionStart(body) {
    const where = folderName(body.cwd);
    const again = body.source === 'resume' || body.source === 'compact';
    return {
      patch: {
        state: 'walking',
        activity: again ? 'Resumed an old conversation' : 'Walked in from outside',
        todos: [],
        todoDone: 0,
        todoTotal: 0,
        startedAt: Date.now(),
        endedAt: null,
        durationMs: null,
        toolCalls: 0,
        turns: 0,
      },
      note: {
        kind: 'sys',
        text: `${body.permission_mode || 'default'} · ${where}`,
        human: again
          ? `Opened the ${where} folder again and picked the conversation back up.`
          : `${'It'} opened the ${where} folder and sat down at a desk.`,
      },
      log: { kind: 'sys', text: `SessionStart source=${body.source || 'startup'}` },
    };
  },

  UserPromptSubmit(body) {
    const raw = oneline(body.prompt);
    const cleaned = stripContextTags(raw);
    const { text: said, kind } = humanize(cleaned);
    if (!said) {
      // The editor injected context rather than the user typing anything.
      return {
        patch: { state: 'thinking', activity: 'You shared editor context, not a request' },
        note: { kind: 'sys', text: words(raw, 200), human: 'You shared something from the editor rather than typing a request, so it is having a look.' },
        log: { kind: 'sys', text: `editor context · ${words(raw, 160)}` },
      };
    }
    // A helper handing back, or a background job reporting in, is not what the person
    // asked for — it must not overwrite the task the agent is working on.
    if (kind !== 'plain') {
      return {
        patch: { state: 'thinking', activity: words(said, 64), endedAt: null },
        note: { kind: 'sys', text: words(said, 200), human: words(said, 200) },
        log: { kind: kind === 'helper' ? 'cast' : 'sys', text: words(said, 200) },
      };
    }
    return {
      patch: {
        state: 'thinking',
        activity: words(said, 64),
        prompt: words(said, 900),
        endedAt: null,
      },
      note: { kind: 'say', text: words(said, 200), human: saidYou(said) },
      countTurns: true,
      // 'you', not 'say': hooks never see the answer, so the ledger must not mistake
      // what the person typed for what the agent reported back.
      log: { kind: 'you', text: words(said, 200) },
    };
  },

  PreToolUse(body, agent, sid) {
    const name = String(body.tool_name || 'tool');
    const input = body.tool_input || {};
    const id = String(body.tool_use_id || name);
    openTools.set(key(sid, id), { name, at: Date.now() });

    const human = humanTool(name, input);
    const patch = { state: 'working', activity: words(human, 64), lastTool: name };
    if (name === 'TodoWrite' && Array.isArray(input.todos)) Object.assign(patch, todoPatch(input.todos));
    if (name === 'Skill') patch.skillsUsed = appended(agent, 'skillsUsed', clip(String(input.skill || ''), 34));
    if ((name === 'Task' || name === 'Agent') && input.subagent_type) {
      patch.agentsUsed = appended(agent, 'agentsUsed', clip(String(input.subagent_type), 26));
    }
    return {
      patch,
      note: { kind: 'tool', text: toolSummary(name, input), human },
      log: { kind: 'tool', text: toolSummary(name, input) },
      countTool: true,
    };
  },

  PostToolUse(body, agent, sid) {
    const name = String(body.tool_name || 'tool');
    const id = String(body.tool_use_id || name);
    const open = openTools.get(key(sid, id));
    openTools.delete(key(sid, id));
    const ms = open ? Date.now() - open.at : null;
    const words = Number(body.tool_response_words) || 0;
    const human = humanResult(name, ms, words);
    return {
      patch: { state: 'thinking', activity: words(human, 64) },
      note: { kind: 'ok', text: `${name} done in ${ms == null ? '?' : Math.round(ms)}ms`, human },
      log: { kind: 'ok', text: `${name} → ${words(oneline(body.tool_response_preview), 160)}` },
    };
  },

  PostToolUseFailure(body, agent, sid) {
    const name = String(body.tool_name || 'tool');
    openTools.delete(key(sid, String(body.tool_use_id || name)));
    const why = words(oneline(body.error), 120);
    return {
      patch: { state: 'blocked', activity: `That ${name} call failed` },
      note: { kind: 'error', text: `${name} failed: ${why}`, human: `The ${name} call went wrong: ${why}` },
      log: { kind: 'error', text: why },
    };
  },

  Notification(body) {
    const type = String(body.notification_type || oneline(body.message) || 'notice');
    const message = words(oneline(body.message), 160);
    const plain = NOTIF[type] || `It paused to tell you something: ${message}`;
    return {
      patch: { state: 'blocked', activity: words(plain, 64) },
      note: { kind: 'error', text: `Notification ${type}: ${message}`, human: plain },
      log: { kind: 'error', text: `${type} · ${message}` },
    };
  },

  SubagentStart(body) {
    const name = clip(String(body.agent_type || body.agent_id || 'helper'), 22);
    return {
      patch: { state: 'working', activity: `The ${name} helper is helping` },
      note: { kind: 'cast', text: `subagent ${name} started`, human: `The ${name} helper came over to help.` },
    };
  },

  SubagentStop(body) {
    const name = clip(String(body.agent_type || 'helper'), 22);
    return {
      patch: { state: 'thinking', activity: `The ${name} helper went back to its desk` },
      note: { kind: 'cast', text: `subagent ${name} stopped`, human: `The ${name} helper finished its job and went back to its desk.` },
    };
  },

  PreCompact() {
    return {
      patch: { state: 'thinking', activity: 'Shortening the conversation so it can carry on' },
      note: { kind: 'sys', text: 'pre-compact', human: 'It is tidying up its notes so it can keep going.' },
    };
  },

  Stop(body, agent) {
    const tools = agent?.toolCalls || 0;
    const ms = agent?.startedAt ? Date.now() - agent.startedAt : null;
    return {
      patch: {
        state: 'done',
        activity: 'Finished — waiting for you',
        endedAt: Date.now(),
        durationMs: ms,
        hadTools: tools > 0,
      },
      note: {
        kind: 'ok',
        text: `stop · ${tools} calls this visit`,
        human: body?.user_message
          ? `It answered you and is waiting to hear back.`
          : `It finished answering you${ms != null ? ` after ${humanDuration(ms)}` : ''}, doing ${tools} ${tools === 1 ? 'thing' : 'things'} on the way.`,
      },
      log: { kind: 'ok', text: 'Stop' },
      finished: true,
    };
  },
};

const NOTIF = {
  permission_prompt: 'It stopped to ask your permission before it goes any further.',
  idle_prompt: 'It has nothing to do and is waiting for you to say something.',
  auth_success: 'It signed in and is ready to work.',
  elicitation_dialog: 'It stopped to ask you a question.',
};

function saidYou(prompt) {
  const first = prompt.split(/(?<=[.!?])\s/)[0] || '';
  return `You said: “${words(first, 96)}”`;
}

// The IDE integration wraps its own context in tags and prepends it to the prompt.
// None of that is something the user said, and it reads as noise on the floor.
// The editor also inlines pasted blocks and selected ranges, tagged the same way.
// Opening tags carry attributes (`<pasted_content id="fa05">`), so allow them.
const CONTEXT_TAG = /<(ide_opened_file|ide_selection|ide_diagnostics|pasted_content|selected_lines|system-reminder|local-command-stdout|command-name|command-message|command-args)(?:\s[^>]*)?>[\s\S]*?(?:<\/\1>|$)/g;

function stripContextTags(text) {
  return String(text || '').replace(CONTEXT_TAG, ' ').replace(/\s+/g, ' ').trim();
}

function humanDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} seconds`;
  const m = Math.floor(s / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}

function todoPatch(todos) {
  const list = todos.slice(0, 40).map((t) => ({
    content: words(String(t.content ?? t.text ?? ''), 120),
    status: t.status || (t.done ? 'completed' : 'pending'),
  }));
  const done = list.filter((t) => t.status === 'completed').length;
  return { todos: list, todoDone: done, todoTotal: list.length };
}

function appended(agent, field, value) {
  const prev = agent?.[field] || [];
  return [...prev, { name: value, at: Date.now() }].slice(-12);
}

// The hook script counts and truncates the tool response before posting, so the
// office never carries file contents — see hooks/claude-office-bridge.sh.

// A session the office never greeted: it started before the server did, the server was
// restarted under it, or its card was dismissed. Adopt it from whatever this event
// carries — dropping it would hide a working session forever.
function adopt(room, sid, body) {
  if (DISMISSED.has(sid) && Date.now() < DISMISSED.get(sid)) return null;
  if (room.agents.size >= MAX_HOOKED_AGENTS) return null;
  return room.upsert(sid, {
    source: 'claude-hook',
    sessionId: sid,
    name: hookName(room, body.cwd, sid),
    cwd: oneline(body.cwd) || null,
    state: 'working',
    activity: 'Already working when the office noticed',
    startedAt: Date.now(),
    turns: 0,
    toolCalls: 0,
  });
}

// Dismissing a live session should not be undone by its next tool call, but the
// silence must expire — a long editor session outlives any reasonable cooldown.
const DISMISSED = new Map();
const DISMISS_COOLDOWN_MS = 10 * 60 * 1000;

export function noteDismissal(sid) {
  if (!sid) return;
  DISMISSED.set(sid, Date.now() + DISMISS_COOLDOWN_MS);
  if (DISMISSED.size > 200) {
    for (const [k, until] of DISMISSED) if (until < Date.now()) DISMISSED.delete(k);
  }
}

// What actually arrived, so "why is my session missing?" is answerable without guessing.
const stats = { arrived: 0, byEvent: {}, dropped: {} };

export function hookStats() {
  return { arrived: stats.arrived, byEvent: { ...stats.byEvent }, dropped: { ...stats.dropped } };
}

function drop(result) {
  stats.dropped[result.ignored] = (stats.dropped[result.ignored] || 0) + 1;
  return result;
}

function isNativeRun(room, sid) {
  for (const a of room.agents.values()) {
    if (a.sessionId === sid && a.source === 'claude') return true;
  }
  return false;
}

// The folder is the name a person recognises from a session they started elsewhere.
function hookName(room, cwd, sid) {
  const base = folderName(cwd);
  const taken = new Set([...room.agents.values()].filter((a) => a.sessionId !== sid).map((a) => a.name));
  if (!taken.has(base)) return base;
  for (const tag of ['another session', 'one more session', 'yet another session']) {
    const name = `${base} (${tag})`;
    if (!taken.has(name)) return name;
  }
  return `${base} (another session)`;
}

function folderName(cwd) {
  const parts = String(cwd || '').split('/').filter(Boolean);
  return clip(short(parts[parts.length - 1] || 'claude'), 22);
}

// Sweeps sessions that stopped reporting without ever sending SessionEnd.
export function reapStaleHooks(room, deps = {}) {
  const { history, asks } = deps;
  const now = Date.now();
  for (const a of [...room.agents.values()]) {
    if (a.source !== 'claude-hook') continue;
    // A helper leaves the floor shortly after its hand-back: it has no session of its own
    // to close, and the room caps how many avatars walk in — lingerers would shut real
    // helpers out of the next seat.
    if (a.parent) {
      const boss = room.agents.get(a.parent);
      if (!boss || (a.endedAt && now - a.endedAt > HELPER_ON_FLOOR_MS)) room.remove(a.id);
      continue;
    }
    const idle = now - (a.updatedAt || 0);
    // A session that closed stays on the floor briefly so the result can be read, then
    // it walks off; the ledger row is what survives.
    if (a.closedAt && now - a.closedAt > CLOSED_ON_FLOOR_MS) {
      asks?.forgetSession(a.sessionId || a.id);
      dropSeats(room, a.sessionId || a.id);
      room.remove(a.id);
      continue;
    }
    if (idle > FORGOTTEN_MS) {
      record(history, a, a.state === 'error' ? 'error' : 'quiet', {
        durationMs: a.startedAt && a.updatedAt ? a.updatedAt - a.startedAt : null,
      });
      asks?.forgetSession(a.sessionId || a.id);
      dropSeats(room, a.sessionId || a.id);
      room.remove(a.id);
      continue;
    }
    if (idle > GOING_QUIET_MS && !['idle', 'done', 'error'].includes(a.state)) {
      room.touch(a.id, { state: 'idle', activity: 'Quiet for a while — nothing new came from your editor or terminal' });
      room.syncAgent(a.id, { kind: 'sys', text: 'no hook traffic', human: 'It stopped reporting, so it is standing by until you do something there.' });
    }
  }
}