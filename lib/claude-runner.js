import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { humanize, words } from './plain.js';

const WORKING_TOOLS = new Set(['Bash', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'WebSearch', 'WebFetch', 'LS', 'Task', 'Agent', 'Skill', 'TodoWrite']);

// Housekeeping the CLI reports on every run; nobody reads these.
const QUIET_SUBTYPES = new Set(['hook_started', 'hook_response', 'hook_progress', 'thinking_tokens', 'command_permissions', 'task_progress', 'output_delta']);

export class ClaudeRun {
  constructor(room, opts = {}) {
    this.room = room;
    this.id = opts.agentId || randomUUID().slice(0, 8);
    this.prompt = String(opts.prompt || '').slice(0, 8000);
    this.bin = opts.bin || 'claude';
    this.model = opts.model || null;
    this.permissionMode = opts.permissionMode || 'plan';
    this.maxTurns = Number(opts.maxTurns) || 25;
    this.allowedTools = Array.isArray(opts.allowedTools) ? opts.allowedTools : null;
    this.workdir = opts.cwd || process.cwd();
    this.sessionName = safeFlag(opts.sessionName) ? String(opts.sessionName).trim().slice(0, 40) : null;
    this.resume = safeFlag(opts.resume) ? String(opts.resume).trim() : null;
    this.name = opts.name || this.sessionName || nameFromPrompt(this.prompt, this.id);
    this.wantApprovals = Boolean(opts.approvalsHere);
    this.child = null;
    this.sessionId = null;
    this.buf = '';
    this.stopped = false;
    this.lastByteAt = Date.now();
    this.flushTimer = null;
    this.idleTimer = null;
    this.initDone = false;
    this.route = null;
    this.self = newAcc();
    this.childAcc = new Map();
    this.childIds = new Set();
    this.childToolUse = new Map();

    this.room.upsert(this.id, {
      name: this.name,
      source: 'claude',
      state: 'booting',
      activity: 'launching claude -p',
      prompt: this.prompt,
      model: this.model,
      cwd: this.workdir,
      startedAt: Date.now(),
      skillsUsed: [],
      agentsUsed: [],
      toolStats: [],
      durationMs: null,
      apiMs: null,
      byModel: [],
    });
    this.room.pushLog(this.id, { kind: 'sys', text: `spawn ${this.bin} -p (cwd ${this.workdir}, mode ${this.permissionMode}${this.resume ? ', resuming the previous conversation' : ''}${this.sessionName ? `, named ${this.sessionName}` : ''})` });
    this.room.syncAgent(this.id, { kind: 'sys', text: `${this.name} is walking to a desk`, human: this.resume ? `${this.name} walked back in to carry on the conversation from before.` : `${this.name} walked in and is looking for a desk.` });
  }

  start() {
    // The prompt goes last of the three leading arguments, in the exact shape that
    // was verified to continue a session under the same id.
    const args = ['-p'];
    if (this.resume) args.push('--resume', this.resume);
    if (this.sessionName) args.push('--name', this.sessionName);
    args.push(
      this.prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', String(this.maxTurns),
      '--permission-mode', this.permissionMode,
    );
    if (this.model) args.push('--model', this.model);
    if (this.allowedTools?.length) args.push('--allowedTools', ...this.allowedTools);

    try {
      this.child = spawn(this.bin, args, {
        cwd: this.workdir,
        // Marks the child as ours so the global hook bridge stays out of the way —
        // this run is already reported through stream-json.
        env: { ...process.env, CLAUDE_OFFICE_OWNER: this.id },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      this.fail(`could not launch ${this.bin}: ${err.message}`);
      return;
    }

    this.child.stdout.on('data', (chunk) => { this.lastByteAt = Date.now(); this.onData(chunk); });
    this.child.stderr.on('data', (chunk) => this.onStderr(chunk));
    this.child.on('error', (err) => this.fail(err.code === 'ENOENT'
      ? `${this.bin} not found on PATH. Set CLAUDE_BIN or install the Claude CLI.`
      : err.message));
    this.child.on('close', (code) => this.onClose(code));

    this.idleTimer = setInterval(() => {
      if (Date.now() - this.lastByteAt > 45000 && !this.stopped) {
        this.patch({ activity: 'waiting on model…', state: 'thinking' });
      }
    }, 15000);
  }

  onData(chunk) {
    this.buf += chunk.toString('utf8');
    let nl;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      this.handle(msg);
    }
    if (this.buf.length > 4_000_000) this.buf = '';
  }

  handle(msg) {
    // Events raised inside a subagent carry parent_tool_use_id; they belong to
    // that avatar, not the one that hired it.
    this.route = (msg.parent_tool_use_id && this.taskChildren?.get(msg.parent_tool_use_id)) || null;
    switch (msg.type) {
      case 'system': {
        if (msg.subtype === 'init') {
          this.initDone = true;
          this.sessionId = msg.session_id || null;
          const inv = this.room.inventory;
          if (inv?.absorbInit(msg)) this.room.broadcast('inventory:update', { inventory: inv.snapshot() });
          // A headless run has no terminal to ask in, so if the office was told to be
          // the approver, this is the first moment the session id exists to arm it.
          if (this.wantApprovals && msg.session_id) this.room.asks?.setArmed(msg.session_id, true);
          this.patch({
            state: 'working',
            activity: 'Sat down and started working',
            model: msg.model || this.model,
            sessionId: msg.session_id || null,
            cwd: msg.cwd || this.workdir,
            hadTools: (msg.tools || []).length || null,
            hadAgents: (msg.agents || []).length || null,
            hadSkills: (msg.skills || []).length || null,
          }, {
            kind: 'ok',
            text: `${msg.model || 'model'} · ${(msg.agents || []).length} agents / ${(msg.skills || []).length} skills on standby`,
            human: `Ready to go — ${msg.model || 'the default model'} is thinking, with ${(msg.tools || []).length} tools, ${(msg.agents || []).length} helpers and ${(msg.skills || []).length} skills within reach`,
          });
        } else if (msg.subtype === 'commands_changed') {
          // noisy, and not room-relevant
        } else if (msg.subtype && !QUIET_SUBTYPES.has(msg.subtype)) {
          // Internal chatter (task_progress etc.) — keep what is left in the log, out of the sentence stream.
          this.room.pushLog(this.route || this.id, { kind: 'sys', text: `system ${msg.subtype}`, human: `System notice: ${msg.subtype}` });
        }
        break;
      }
      case 'assistant': {
        const usage = msg.message?.usage;
        const model = msg.message?.model;
        if (model) {
          this.room.inventory?.noteModel(model);
          if (model !== this.room.agents.get(this.route || this.id)?.model) this.patch({ model });
        }
        if (usage) {
          this.patch({
            ...(usage.output_tokens ? { tokensOut: usage.output_tokens } : {}),
            ...(liveTokens(usage) ? { tokensIn: liveTokens(usage) } : {}),
          });
        }
        for (const block of msg.message?.content || []) this.handleBlock(block);
        break;
      }
      case 'user': {
        for (const block of msg.message?.content || []) {
          if (block.type === 'tool_result') this.handleToolResult(block);
        }
        break;
      }
      case 'result': {
        this.result = msg;
        const failed = Boolean(msg.is_error) || msg.subtype === 'error';
        for (const open of [...this.self.open.values()]) this.closeTool(this.self, open, Date.now(), false);
        this.route = null;
        const wallMs = Date.now() - (this.room.agents.get(this.id)?.startedAt || Date.now());
        this.patch({
          state: failed ? 'error' : 'done',
          activity: failed ? words(oneline(msg.result || msg.subtype) || 'It ended on a problem', 64) : 'Finished — it wrote its report',
          endedAt: Date.now(),
          turns: msg.num_turns ?? this.turns(),
          tokensIn: liveTokens(msg.usage),
          tokensOut: msg.usage?.output_tokens || 0,
          costUsd: msg.total_cost_usd || 0,
          durationMs: wallMs,
          apiMs: msg.duration_api_ms ?? null,
          byModel: modelBreakdown(msg.modelUsage),
          toolStats: this.statList(this.self),
          skillsUsed: this.self.skillsUsed.slice(-12),
          agentsUsed: this.self.agentsUsed.slice(-12),
        }, {
          kind: failed ? 'error' : 'ok',
          text: failed ? 'run failed' : `done in ${dur(wallMs)} wall (${dur(msg.duration_api_ms)} model) · ${msg.num_turns} turns · $${(msg.total_cost_usd || 0).toFixed(4)}`,
          human: failed
            ? `It ended on a problem after ${durPlain(wallMs)}${msg.result ? `: ${words(oneline(msg.result), 80)}` : '.'} The Finished shelf has what it managed to do.`
            : `All done — it took ${durPlain(wallMs)} and did ${this.self.tools} ${this.self.tools === 1 ? 'thing' : 'things'} for $${(msg.total_cost_usd || 0).toFixed((msg.total_cost_usd || 0) < 1 ? 3 : 2)}. Its report is on the Finished shelf.`,
        });
        if (msg.result) this.patch({}, { kind: 'final', text: words(msg.result, 600), silent: true });
        for (const id of this.childIds) this.finishChild(id);
        break;
      }
      default:
        break;
    }
  }

  handleBlock(block) {
    const id = this.route || this.id;
    const acc = this.accFor(id);
    if (block.type === 'text' && block.text?.trim()) {
      const text = block.text.trim();
      const said = saidLine(text);
      this.patch({ state: 'thinking', activity: words(said, 64) }, { kind: 'say', text: words(text, 200), human: said });
      return;
    }
    if (block.type !== 'tool_use') return;

    const name = block.name || 'tool';
    const input = block.input || {};
    const summary = toolSummary(name, input);
    let use = null;
    acc.tools += 1;

    if (name === 'TodoWrite' && Array.isArray(input.todos)) {
      const todos = input.todos.map((t) => ({ content: String(t.content || '').slice(0, 120), status: t.status || 'pending' }));
      const done = todos.filter((t) => t.status === 'completed').length;
      const human = `Made a list of the steps — ${done} of ${todos.length} finished.`;
      this.patch({ todos, state: 'working', activity: human, toolCalls: acc.tools }, {
        kind: 'todo',
        text: `kanban updated (${todos.length} items)`,
        human,
      });
      return;
    }

    if (name === 'Task' || name === 'Agent') {
      const subagent = clip(String(input.subagent_type || 'general-purpose'), 26);
      use = { kind: 'agent', name: subagent };
      acc.agentsUsed.push({ name: subagent, at: Date.now(), toolUseId: block.id || null });
      this.room.inventory?.markUsed('agent', subagent);
      this.patch({ agentsUsed: acc.agentsUsed.slice(-12) }, {
        kind: 'cast',
        text: `${this.name} called in agent · ${subagent}`,
        human: `The ${subagent} helper came over to help.`,
      });
      const childId = this.room.onSubagent?.(this, input);
      if (childId && block.id) {
        (this.taskChildren ||= new Map()).set(block.id, childId);
        this.childIds.add(childId);
        this.childToolUse.set(childId, block.id);
      }
    }

    if (name === 'Skill') {
      const skill = clip(String(input.skill || ''), 34);
      const rec = { name: skill, at: Date.now() };
      use = { kind: 'skill', name: skill, rec };
      acc.skillsUsed.push(rec);
      this.room.inventory?.markUsed('skill', skill);
      this.patch({ skillsUsed: acc.skillsUsed.slice(-12) }, {
        kind: 'cast',
        text: `invoked skill · ${skill}`,
        human: `It picked up the ${skill} skill and read how to use it.`,
      });
    }

    if (block.id) acc.open.set(block.id, { id: block.id, name, at: Date.now(), summary, use });
    acc.lastTool = name;

    const said = humanTool(name, input);
    this.patch(
      { state: WORKING_TOOLS.has(name) ? 'working' : 'thinking', activity: words(said, 64), lastTool: name, toolCalls: acc.tools },
      { kind: 'tool', tool: name, text: summary, human: said },
    );
  }

  accFor(id) {
    if (!id || id === this.id) return this.self;
    let acc = this.childAcc.get(id);
    if (!acc) { acc = newAcc(); this.childAcc.set(id, acc); }
    return acc;
  }

  closeTool(acc, open, at, failed) {
    const ms = Math.max(0, at - open.at);
    const prev = acc.stats.get(open.name) || { tool: open.name, calls: 0, ms: 0, maxMs: 0, lastMs: 0 };
    prev.calls += 1;
    prev.ms += ms;
    prev.lastMs = ms;
    prev.maxMs = Math.max(prev.maxMs, ms);
    if (failed) prev.errors = (prev.errors || 0) + 1;
    acc.stats.set(open.name, prev);
    acc.open.delete(open.id);
    return ms;
  }

  statList(acc) {
    return [...acc.stats.values()]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 14)
      .map((s) => ({ ...s, ms: Math.round(s.ms), maxMs: Math.round(s.maxMs), lastMs: Math.round(s.lastMs) }));
  }

  handleToolResult(block) {
    const id = this.route || this.id;
    const acc = this.accFor(id);
    const failed = Boolean(block.is_error);
    const open = block.tool_use_id && acc.open.get(block.tool_use_id);
    const ms = open ? this.closeTool(acc, open, Date.now(), failed) : null;
    const label = open?.name || acc.lastTool || 'tool';
    const why = cleanError(blockText(block));
    if (failed && open?.use) {
      this.room.inventory?.markError(open.use.kind, open.use.name);
      if (open.use.rec) open.use.rec.failed = true;
    }
    const childId = block.tool_use_id && this.taskChildren?.get(block.tool_use_id);
    if (childId) this.childHandoff(childId, ms, blockText(block), failed);
    const human = failed
      ? `That didn’t work: ${words(oneline(why), 90) || `${label} reported an error`}`
      : humanResult(label, ms, resultWords(block));
    this.patch(
      {
        state: failed ? 'blocked' : 'working',
        activity: failed ? words(`${label} hit a problem: ${oneline(why)}`, 60) : human,
        toolStats: this.statList(acc),
        ...(failed && open?.use?.rec ? { skillsUsed: acc.skillsUsed.slice(-12) } : {}),
      },
      {
        kind: failed ? 'error' : 'ok',
        text: failed
          ? `${label} failed${ms != null ? ` after ${dur(ms)}` : ''}${why ? ` — ${words(why, 110)}` : ''}`
          : `${label} in ${dur(ms ?? 0)}`,
        human,
      },
    );
  }

  childHandoff(childId, ms, text, failed) {
    const child = this.room.agents.get(childId);
    if (!child) return;
    // A backgrounded Task answers with a receipt, not a report, and the child
    // keeps streaming under the same parent_tool_use_id afterwards. The mapping
    // has to survive or its tool calls land back on the parent.
    if (!failed && /\bbackground\b|task_id|is running|still running/i.test(text)) {
      this.room.touch(childId, { state: 'working', activity: 'Carrying on quietly in the background' });
      this.room.syncAgent(childId, {
        kind: 'ok',
        text: `${child.name} is running in the background · ${dur(ms)} to hand off`,
        human: `It said “I’ll keep going” after ${durPlain(ms)} and is still working.`,
      });
      return;
    }
    this.taskChildren?.delete(this.childToolUse.get(childId));
    this.finishChild(childId, ms, failed ? 'subtask errored' : 'subtask returned');
  }

  finishChild(childId, ms = null, activity = 'subtask returned') {
    const child = this.room.agents.get(childId);
    if (!child || child.endedAt) return;
    const acc = this.childAcc.get(childId) || newAcc();
    for (const open of [...acc.open.values()]) this.closeTool(acc, open, Date.now(), false);
    const wall = Date.now() - (child.startedAt || Date.now());
    const said = {
      'subtask returned': 'gave its answer back',
      'subtask errored': 'gave up — that job went wrong',
      'session ended': 'the session closed before it finished',
    }[activity] || activity;
    this.room.touch(childId, {
      state: 'done',
      activity: words(`${child.name} ${said}`, 64),
      endedAt: Date.now(),
      durationMs: ms ?? wall,
      toolCalls: acc.tools,
      toolStats: this.statList(acc),
      skillsUsed: acc.skillsUsed.slice(-12),
      agentsUsed: acc.agentsUsed.slice(-12),
    });
    this.room.syncAgent(childId, {
      kind: 'ok',
      text: `${child.name} finished in ${dur(wall)}${acc.tools ? ` · ${acc.tools} tools` : ''}`,
      human: `${child.name} ${said} in ${durPlain(wall)}${acc.tools ? `, using ${acc.tools} ${acc.tools === 1 ? 'tool' : 'tools'}` : ''}.`,
    });
  }

  turns() {
    return this.room.agents.get(this.id)?.turns || 0;
  }

  patch(patch, note) {
    const id = this.route || this.id;
    const queue = this.pending || (this.pending = new Map());
    const slot = queue.get(id) || { p: null, notes: [] };
    slot.p = { ...(slot.p || {}), ...patch };
    if (note) slot.notes.push({ ts: Date.now(), ...note });
    queue.set(id, slot);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => { this.flushTimer = null; this.flush(); }, 90);
    }
  }

  flush() {
    const queue = this.pending;
    if (!queue) return;
    this.pending = null;
    for (const [id, slot] of queue) {
      if (slot.p) this.room.touch(id, slot.p);
      let shown = false;
      for (const note of slot.notes) {
        // The closing result usually repeats the last thing the agent said.
        if (note.kind === 'final' && this.repeatOfSay(id, note.text)) continue;
        this.room.pushLog(id, { ts: note.ts, kind: note.kind, text: note.text, human: note.human || note.text });
        if (note.silent) continue;
        this.room.syncAgent(id, note);
        shown = true;
      }
      if (!shown) this.room.syncAgent(id);
    }
  }

  repeatOfSay(id, text) {
    const log = this.room.agents.get(id)?.log || [];
    // The line just before the result is usually the "done in …" ticker, so look
    // back a few entries for the last thing the agent actually said.
    for (let i = log.length - 1; i >= 0 && i > log.length - 6; i--) {
      if (log[i].kind !== 'say') continue;
      return text.startsWith(String(log[i].text).replace(/…$/, ''));
    }
    return false;
  }

  onStderr(chunk) {
    const text = chunk.toString('utf8').trim();
    if (!text) return;
    this.errText = words(text, 400);
    this.patch({ state: 'blocked', activity: words(`Problem: ${oneline(text)}`, 60) }, { kind: 'error', text: words(text, 200), human: `Something went wrong while it worked: ${words(oneline(text), 110)}` });
  }

  onClose(code) {
    this.stopped = true;
    clearInterval(this.idleTimer);
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    this.route = null;
    this.flush();
    const agent = this.room.agents.get(this.id);
    if (!agent) return;
    if (agent.state === 'done' || agent.state === 'error') {
      this.room.syncAgent(this.id);
      this.recordHistory(agent, agent.state === 'error' ? 'error' : 'finished');
      return;
    }
    const ok = code === 0;
    this.room.touch(this.id, {
      state: ok ? 'done' : 'error',
      activity: ok ? 'Walked off the floor' : `Stopped working by itself (error ${code})${this.errText ? ` — ${words(this.errText, 60)}` : ''}`,
      endedAt: Date.now(),
    });
    this.room.syncAgent(this.id, {
      kind: ok ? 'ok' : 'error',
      text: `${this.name} exited (${ok ? 'code 0' : `code ${code}`})`,
      human: ok ? 'It closed the session and walked off the floor.' : `It stopped working by itself (error ${code})${this.errText ? `: ${words(oneline(this.errText), 80)}` : ''}.`,
    });
    this.recordHistory(agent, this.userStopped ? 'stopped' : ok ? 'finished' : 'error');
    for (const id of this.childIds) this.finishChild(id, null, 'session ended');
  }

  // The floor is transient; the ledger is what answers "what did it finish?" later.
  recordHistory(agent, outcome) {
    const history = this.room.history;
    if (!history) return null;
    const report = this.result?.result || null;
    const problem = this.result?.is_error ? (report || this.result?.subtype) : this.errText;
    return history.record(agent, outcome, {
      durationMs: agent.durationMs ?? (agent.startedAt ? Date.now() - agent.startedAt : null),
      report,
      problem: outcome === 'error' ? problem : null,
    });
  }

  fail(message) {
    this.stopped = true;
    this.errText = this.errText || message;
    this.room.touch(this.id, { state: 'error', activity: words(`Could not start: ${oneline(message)}`, 90), endedAt: Date.now() });
    this.room.syncAgent(this.id, { kind: 'error', text: message, human: `It could not even start: ${words(oneline(message), 110)}` });
    this.recordHistory(this.room.agents.get(this.id), 'error');
  }

  stop() {
    if (!this.child || this.stopped) return false;
    this.userStopped = true;
    this.room.touch(this.id, { state: 'leaving', activity: 'You said stop — packing up' });
    this.room.syncAgent(this.id, { kind: 'sys', text: `stop requested for ${this.name}`, human: 'You asked it to stop, so it is packing up and heading for the door.' });
    try { this.child.kill('SIGTERM'); } catch { /* already gone */ }
    this.killTimer = setTimeout(() => { try { this.child?.kill('SIGKILL'); } catch { /* gone */ } }, 4000);
    return true;
  }
}

function newAcc() {
  return { open: new Map(), stats: new Map(), tools: 0, skillsUsed: [], agentsUsed: [], lastTool: null };
}

// A session id or a session name arrives from the page. It is passed as one argv
// element, never through a shell, but it still must not be able to look like a flag.
const SAFE_FLAG = /^[A-Za-z0-9][A-Za-z0-9._:@/ -]{0,79}$/;

export function safeFlag(v) {
  return typeof v === 'string' && SAFE_FLAG.test(v.trim());
}

// A label must not end on a dangling "and"/"the" — the ticker reads
// "<name> walked in and is looking for a desk", so a stub word breaks the sentence.
const TRAILING_FILLER = /^(and|or|the|a|an|to|in|of|for|with|that|this|it|is|on|at|as|by|from|please|me|my|can|could|would)$/i;

function nameFromPrompt(prompt, id) {
  // A whole-word label, never a clipped mid-word ellipsis: this string is the
  // avatar's name in the bubble, the crew list and every ticker line.
  let name = '';
  for (const word of oneline(prompt).split(' ').slice(0, 5)) {
    const w = word.replace(/[^\w./-]/g, '');
    if (!w) continue;
    if (name && (name + ' ' + w).length > 26) break;
    name = name ? `${name} ${w}` : w;
  }
  while (name) {
    const words = name.split(' ');
    if (words.length < 2 || !TRAILING_FILLER.test(words[words.length - 1])) break;
    name = words.slice(0, -1).join(' ');
  }
  if (name.split(' ').length < 2) return `claude-${id}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// The activity stream is read by a person, so it gets one short, plain sentence per
// event — the kind a child could follow. The terse technical line still goes to the log.
export function humanTool(name, input) {
  const arg = (v, n) => words(v, n);
  const file = () => arg(short(String(input.file_path || input.path || '')), 34);
  switch (name) {
    case 'Bash': return `Running a command: ${arg(input.command, 44)}`;
    case 'Read': return `Reading ${file()} to see what is inside`;
    case 'Edit': return `Changing ${file()}`;
    case 'Write': return `Making a new file called ${file()}`;
    case 'MultiEdit': return `Changing several parts of ${file()}`;
    case 'NotebookEdit': return 'Changing one box in a notebook';
    case 'LS': return `Looking inside ${arg(short(input.dir_path || input.path || '.'), 34)}`;
    case 'Grep': return `Searching the files for “${arg(input.pattern, 28)}”`;
    case 'Glob': return `Looking for files named ${arg(input.pattern, 30)}`;
    case 'Task':
    case 'Agent': return `Asking the ${arg(input.subagent_type || 'helper', 20)} helper for a small job`;
    case 'Skill': return `Trying the ${arg(input.skill, 28)} skill`;
    case 'TodoWrite': return `Writing down the steps as a list`;
    case 'WebSearch': return `Searching the internet for “${arg(input.query, 32)}”`;
    case 'WebFetch': return 'Opening a web page to read it';
    case 'AskUserQuestion': return 'Stopping to ask you a question';
    case 'KillShell': return 'Stopping a command it started earlier';
    case 'BashOutput': return 'Checking on a command still running';
    default: return `Used the ${name} tool`;
  }
}

export function humanResult(name, ms, count) {
  const took = ms == null ? '' : ` in ${durPlain(ms)}`;
  const back = count ? ` — ${count.toLocaleString('en-IN')} ${count === 1 ? 'word' : 'words'} came back` : '';
  switch (name) {
    case 'Bash': return `The command answered${took}${back}`;
    case 'Read': return `It read the file${took}${back}`;
    case 'Grep':
    case 'Glob': return `The search finished${took}${back}`;
    case 'Task':
    case 'Agent': return `The helper gave its answer back${took}${back}`;
    case 'Skill': return `The skill is ready${took}`;
    case 'Edit':
    case 'MultiEdit':
    case 'Write': return `The change is saved${took}`;
    case 'TodoWrite': return 'The step list is saved';
    default: return `That finished${took}${back}`;
  }
}

// Seconds a person can say out loud, not "12.2s" or "12200ms".
export function durPlain(ms) {
  if (ms == null) return 'a while';
  if (ms < 1000) return 'a moment';
  const s = ms / 1000;
  return s < 10 ? `${Math.round(s * 10) / 10} seconds` : `${Math.round(s)} seconds`;
}

// The model's own words go in as one sentence, never a wall of text.
export function saidLine(text) {
  const clean = humanize(text).text || oneline(text);
  const first = clean.split(/(?<=[.!?])\s/)[0] || '';
  return `Said: “${words(first, 96)}”`;
}

// Counted from the full tool_result, not the clipped preview, so the number
// shown in the feed is the real payload size.
export function resultWords(block) {
  const c = block?.content;
  const s = typeof c === 'string'
    ? c
    : Array.isArray(c) ? c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join(' ') : '';
  return oneline(s).split(' ').filter(Boolean).length;
}

export function toolSummary(name, input) {
  if (name === 'Bash') return `Bash: ${words(input.command, 54)}`;
  if (name === 'Read' || name === 'Edit' || name === 'Write' || name === 'LS') return `${name}: ${clip(short(String(input.file_path || input.path || input.dir_path || '')), 54)}`;
  if (name === 'Grep') return `Grep: /${words(input.pattern, 40)}/`;
  if (name === 'Glob') return `Glob: ${words(input.pattern, 48)}`;
  if (name === 'Task' || name === 'Agent') return `Task → ${clip(String(input.subagent_type || 'general-purpose'), 22)}: ${words(input.description, 34)}`;
  if (name === 'Skill') return `Skill → ${clip(String(input.skill || 'unknown'), 34)}`;
  if (name === 'WebSearch') return `WebSearch: ${words(input.query, 48)}`;
  if (name === 'WebFetch') return `WebFetch: ${clip(String(input.url || ''), 48)}`;
  if (name === 'TodoWrite') return `TodoWrite: ${input.todos?.length ?? 0} items`;
  const key = Object.keys(input)[0];
  return key ? `${name}: ${words(input[key], 46)}` : name;
}

export function oneline(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function blockText(block) {
  const c = block?.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.map((part) => (typeof part === 'string' ? part : part?.text || '')).join(' ').slice(0, 600);
}

function cleanError(s) {
  return oneline(String(s || '').replace(/<\/?tool_use_error>/g, ''));
}

function dur(ms) {
  if (ms == null) return '?';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function modelBreakdown(modelUsage) {
  return Object.entries(modelUsage || {}).map(([model, u]) => ({
    model,
    calls: u.calls ?? null,
    inputTokens: u.inputTokens || 0,
    outputTokens: u.outputTokens || 0,
    thinkingTokens: u.thinkingTokens || 0,
    cacheRead: u.cacheReadInputTokens || 0,
    costUsd: u.costUSD || 0,
    contextWindow: u.contextWindow || null,
    provider: u.provider || null,
  })).sort((a, b) => b.costUsd - a.costUsd);
}

export function short(p) {
  const parts = String(p).split('/');
  return parts.length > 2 ? parts.slice(-2).join('/') : String(p);
}

function liveTokens(usage) {
  if (!usage) return 0;
  return (usage.input_tokens || 0)
    + (usage.cache_creation_input_tokens || 0)
    + (usage.cache_read_input_tokens || 0);
}

export function clip(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
