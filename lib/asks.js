// The approval desk. Claude Code normally stops in the terminal and waits for a person
// to type 1/2/3; this holds that decision in the office instead, so the answer can be
// given from the web page.
//
// How it works: a PreToolUse hook is the only place Claude Code accepts an outside
// answer, and the hook blocks until its script prints JSON. The bridge therefore waits
// on the office's reply, and the office only holds when the session has opted in.
// Anything unanswered falls through to the terminal prompt untouched.

import { randomUUID } from 'node:crypto';
import { humanTool, clip, oneline, short } from './claude-runner.js';
import { words } from './plain.js';

// The hook's own timeout in Claude Code is 60s, so the office answers inside 50 and
// leaves room for the response to travel back.
const ANSWER_WINDOW_MS = 50_000;
const MAX_OPEN = 12;
const RETAINED = 40;
// An answered card stays on the page briefly so you can see what you chose.
const RETIRE_MS = 90_000;

// These are the calls that stop and ask in a normal session. Read/Grep/Glob never do,
// so routing them here would be pure noise.
const GATED = new Set([
  'Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch',
  'KillShell', 'BashOutput', 'Restart', 'ExitPlanMode',
]);

const QUESTION_TOOL = 'AskUserQuestion';

export class Asks {
  constructor(room) {
    this.room = room;
    this.open = new Map();
    this.retired = [];
    this.armed = new Set();
    this.remembered = new Map();
    this.stats = { opened: 0, allowed: 0, denied: 0, expired: 0, answered: 0 };
  }

  isArmed(sessionId) {
    return Boolean(sessionId) && this.armed.has(sessionId);
  }

  setArmed(sessionId, on) {
    if (!sessionId) return false;
    if (on) this.armed.add(sessionId);
    else {
      this.armed.delete(sessionId);
      this.remembered.delete(sessionId);
      for (const ask of [...this.open.values()]) if (ask.sessionId === sessionId) this.settle(ask, { fallthrough: 'unarmed' });
    }
    return this.isArmed(sessionId);
  }

  // A call only needs the office if the session opted in and the office is not already
  // planning to answer it for the rest of the session.
  needs(body, sessionId) {
    if (!this.isArmed(sessionId)) return null;
    const tool = String(body.tool_name || '');
    if (tool === QUESTION_TOOL) return 'question';
    if (GATED.has(tool) || tool.startsWith('mcp__')) {
      const done = this.remembered.get(sessionId);
      if (done && done.has(tool)) return null;
      return 'approval';
    }
    return null;
  }

  // Resolves with the object the hook script must print, or null to say nothing.
  hold(agent, body, kind) {
    if (this.open.size >= MAX_OPEN) return Promise.resolve(null);
    // Nobody is watching the page: let the terminal ask, as it always did.
    if (!this.room.clients.size) return Promise.resolve(null);

    const id = randomUUID().slice(0, 8);
    const tool = String(body.tool_name || 'tool');
    const input = body.tool_input || {};
    const ask = {
      id,
      agentId: agent.id,
      agentName: agent.name,
      color: agent.color,
      sessionId: agent.sessionId || body.session_id || null,
      cwd: agent.cwd || body.cwd || null,
      kind,
      tool,
      summary: kind === 'question' ? questionLine(input) : humanTool(tool, input),
      detail: detailFor(tool, input),
      questions: kind === 'question' ? readQuestions(input) : [],
      toolUseId: body.tool_use_id || null,
      rawInput: input,
      at: Date.now(),
      expiresAt: Date.now() + ANSWER_WINDOW_MS,
      state: 'open',
      decision: null,
      decidedBy: null,
    };
    this.open.set(id, ask);
    this.stats.opened += 1;
    this.room.touch(agent.id, { state: 'blocked', activity: words(ask.kind === 'question' ? 'Waiting for your answer' : `Waiting for you to allow ${tool}`, 64) });
    this.room.syncAgent(agent.id, {
      kind: 'error',
      text: `ask ${id} ${tool}`,
      human: ask.kind === 'question'
        ? `${agent.name} needs a decision from you — answer it on the right.`
        : `${agent.name} needs your approval before it goes on: ${lower(ask.summary)}.`,
    });
    this.broadcastOpen(ask);

    return new Promise((resolve) => {
      ask.timer = setTimeout(() => this.settle(ask, { fallthrough: 'expired' }).then(resolve), ANSWER_WINDOW_MS);
      ask.resolve = resolve;
    });
  }

  answer(id, body) {
    const ask = this.open.get(id);
    if (!ask) return null;
    const decision = String(body.decision || '');
    if (!['allow', 'deny', 'fallthrough'].includes(decision)) return { error: 'decision must be allow, deny or fallthrough' };

    const patch = { decision };
    if (decision === 'deny') patch.reason = words(oneline(body.reason || 'You said no from the office'), 200);
    if (decision === 'allow' && body.remember) this.rememberFor(ask);
    if (ask.kind === 'question' && decision === 'allow') {
      const answers = readAnswers(body.answers);
      if (answers) patch.answers = answers;
    }
    this.stats.answered += 1;
    if (decision === 'allow') this.stats.allowed += 1;
    if (decision === 'deny') this.stats.denied += 1;
    return this.settle(ask, patch);
  }

  rememberFor(ask) {
    if (!ask.sessionId) return;
    const set = this.remembered.get(ask.sessionId) || new Set();
    set.add(ask.tool);
    this.remembered.set(ask.sessionId, set);
  }

  // Settles the held HTTP request so the waiting hook can print its verdict and exit.
  settle(ask, patch) {
    if (ask.settled) return Promise.resolve(null);
    ask.settled = true;
    clearTimeout(ask.timer);
    Object.assign(ask, { state: patch.fallthrough || patch.decision || 'answered' }, patch);
    if (patch.fallthrough === 'expired') this.stats.expired += 1;
    this.open.delete(ask.id);
    this.retired.unshift(card(ask));
    if (this.retired.length > RETAINED) this.retired.length = RETAINED;
    setTimeout(() => this.dropRetired(ask.id), RETIRE_MS).unref?.();

    const out = hookOutput(ask);
    ask.resolve?.(out);
    this.room.syncAgent(ask.agentId, {
      kind: ask.decision === 'deny' ? 'error' : 'ok',
      text: `ask ${ask.id} ${ask.state}`,
      human: sentenceFor(ask),
    });
    this.broadcastResolved(ask);
    return Promise.resolve(out);
  }

  dropRetired(id) {
    this.retired = this.retired.filter((a) => a.id !== id);
  }

  forgetSession(sessionId) {
    for (const ask of [...this.open.values()]) if (ask.sessionId === sessionId) this.settle(ask, { fallthrough: 'session ended' });
    this.armed.delete(sessionId);
    this.remembered.delete(sessionId);
  }

  snapshot() {
    return {
      open: [...this.open.values()].map(card),
      recentlyAnswered: this.retired.slice(0, 8),
      armed: [...this.armed],
      remembered: [...this.remembered.entries()].map(([sid, tools]) => ({ sessionId: sid, tools: [...tools] })),
      windowMs: ANSWER_WINDOW_MS,
      stats: { ...this.stats },
    };
  }

  broadcastOpen(ask) {
    this.room.broadcast('ask:open', { ask: card(ask), armed: [...this.armed] });
  }

  broadcastResolved(ask) {
    this.room.broadcast('ask:resolved', { ask: card(ask), armed: [...this.armed] });
  }
}

// The exact JSON Claude Code reads from the hook's stdout. An ask that fell through
// prints nothing at all, which is how the terminal keeps its own prompt.
function hookOutput(ask) {
  const out = { hookEventName: 'PreToolUse' };
  if (ask.decision === 'deny') {
    out.permissionDecision = 'deny';
    out.permissionDecisionReason = ask.reason || 'Denied from the office';
    return out;
  }
  if (ask.decision !== 'allow') return null;
  out.permissionDecision = 'allow';
  if (ask.answers) {
    out.updatedInput = { ...(ask.rawInput || {}), answers: ask.answers };
  }
  return out;
}

function card(ask) {
  return {
    id: ask.id,
    agentId: ask.agentId,
    agentName: ask.agentName,
    color: ask.color,
    sessionId: ask.sessionId,
    cwd: ask.cwd,
    kind: ask.kind,
    tool: ask.tool,
    summary: ask.summary,
    detail: ask.detail,
    questions: ask.questions,
    at: ask.at,
    expiresAt: ask.expiresAt,
    state: ask.state,
    decision: ask.decision || null,
    reason: ask.reason || null,
  };
}

function sentenceFor(ask) {
  if (ask.decision === 'allow') {
    return ask.kind === 'question'
      ? `You gave it the answer, so it is carrying on.`
      : `You allowed it, so ${ask.agentName} is getting on with it.`;
  }
  if (ask.decision === 'deny') return `You said no, so ${ask.agentName} has been told not to do that.`;
  if (ask.state === 'expired') return `Nobody answered in time, so it is asking you in the terminal instead.`;
  return `It stopped waiting for the office and will ask you in the terminal.`;
}

function detailFor(tool, input) {
  if (tool === 'Bash') return oneline(input.command);
  if (tool === 'WebFetch') return clip(oneline(input.url), 200);
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    return `${clip(short(String(input.file_path || input.path || '')), 90)}${tool === 'Write' ? ` (${wordCount(input.content)} words to write)` : ''}`;
  }
  if (tool === 'ExitPlanMode') return 'It wants to leave planning and start editing.';
  const keys = Object.keys(input).slice(0, 4);
  return clip(keys.map((k) => `${k}: ${oneline(String(input[k]))}`).join(' · '), 260);
}

function readQuestions(input) {
  const list = Array.isArray(input?.questions) ? input.questions : [];
  return list.slice(0, 4).map((q, i) => ({
    index: i,
    question: words(oneline(q.question || `Question ${i + 1}`), 240),
    header: clip(oneline(q.header || ''), 24),
    multiSelect: q.multiSelect === true,
    options: (Array.isArray(q.options) ? q.options : []).slice(0, 4).map((o) => ({
      label: words(oneline(o.label || ''), 60),
      hint: words(oneline(o.description || ''), 120),
    })),
  }));
}

function questionLine(input) {
  const q = readQuestions(input)[0];
  return q ? `It asked: ${q.question}` : 'It stopped to ask you something';
}

// Answers come back keyed by the question text, which is what the CLI's own
// AskUserQuestion input expects.
function readAnswers(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (n >= 4) break;
    const value = Array.isArray(v) ? v.slice(0, 4).map((x) => words(oneline(String(x)), 80)) : words(oneline(String(v)), 80);
    if (!value) continue;
    out[clip(oneline(k), 240)] = value;
    n += 1;
  }
  return n ? out : null;
}

function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

function lower(s) {
  return String(s || '').replace(/^./, (c) => c.toLowerCase());
}
