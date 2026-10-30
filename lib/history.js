// The finished-work ledger. A run that ends must stay readable: right now the avatar
// leaves the floor with its session, and the answer to "what did it do?" goes with it.
//
// One row per session, refreshed whenever a turn completes, so the shelf always shows
// the latest outcome instead of one entry per turn. Persisted — the page can be closed
// and the work still shows tomorrow.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clip, oneline, short } from './claude-runner.js';
import { humanize, words } from './plain.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '..', 'data', 'history.json');
const MAX_ITEMS = 60;

// Outcomes a person can read without knowing the wire format.
export const OUTCOMES = {
  finished: 'finished the job',
  closed: 'session closed',
  error: 'stopped with a problem',
  stopped: 'you stopped it',
  quiet: 'went quiet',
};

export class History {
  constructor(room) {
    this.room = room;
    this.items = [];
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
      this.items = Array.isArray(raw?.items) ? raw.items : [];
    } catch {
      // No ledger yet — the first finished run creates it.
    }
  }

  // `agent` is a room record; `extra` carries what only the run itself knows
  // (the final report, the exit code, who stopped it).
  record(agent, outcome, extra = {}) {
    if (!agent) return null;
    const key = agent.sessionId || agent.id;
    const item = {
      key,
      agentId: agent.id,
      name: clip(oneline(agent.name || 'claude'), 40),
      folder: folderName(agent.cwd),
      cwd: agent.cwd || null,
      source: agent.source === 'claude-hook' ? 'claude-hook' : 'claude',
      outcome: OUTCOMES[outcome] ? outcome : 'finished',
      prompt: agent.prompt ? words(humanize(agent.prompt).text || '', 300) : null,
      model: agent.model || null,
      finishedAt: Date.now(),
      startedAt: agent.startedAt || null,
      durationMs: extra.durationMs ?? (agent.startedAt ? Date.now() - agent.startedAt : null),
      turns: agent.turns || 0,
      toolCalls: agent.toolCalls || 0,
      costUsd: agent.costUsd || 0,
      tokens: (agent.tokensIn || 0) + (agent.tokensOut || 0),
      todoDone: agent.todoDone || 0,
      todoTotal: agent.todoTotal || 0,
      report: cleanReport(extra.report ? oneline(extra.report) : lastSay(agent)),
      problem: extra.problem ? words(humanize(oneline(extra.problem)).text || oneline(extra.problem), 300) : (outcome === 'error' ? words(oneline(agent.activity), 300) : null),
      skills: (agent.skillsUsed || []).slice(-4).map((s) => s.name),
      helpers: (agent.agentsUsed || []).slice(-4).map((a) => a.name),
      visits: 1,
      ...sanitize(extra.item),
    };
    const at = this.items.findIndex((i) => i.key === key);
    if (at >= 0) {
      item.visits = (this.items[at].visits || 1) + (extra.newTurn ? 1 : 0);
      this.items[at] = item;
    } else {
      this.items.unshift(item);
    }
    this.items.sort((a, b) => b.finishedAt - a.finishedAt);
    if (this.items.length > MAX_ITEMS) this.items.length = MAX_ITEMS;
    this.save();
    this.room?.broadcast('run:finished', { item });
    return item;
  }

  forget(key) {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.key !== key);
    if (this.items.length !== before) this.save();
  }

  snapshot(limit = MAX_ITEMS) {
    return { items: this.items.slice(0, limit), count: this.items.length };
  }

  save() {
    const body = JSON.stringify({ items: this.items }, null, 2);
    fs.mkdir(path.dirname(CACHE), { recursive: true }, (err) => {
      if (err) return;
      fs.writeFile(CACHE, body, () => {});
    });
  }
}

// The last thing the agent actually said is the most useful summary a hooked
// session can offer — hooks never carry a final report.
function lastSay(agent) {
  const log = agent.log || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry.kind !== 'say' && entry.kind !== 'final') continue;
    return oneline(entry.human || entry.text);
  }
  return null;
}

// Nothing written to the shelf should still be wearing its wire format.
function cleanReport(text) {
  if (!text) return null;
  const said = humanize(text).text;
  return said ? words(said, 900) : null;
}

function folderName(cwd) {
  const parts = String(cwd || '').split('/').filter(Boolean);
  return clip(short(parts[parts.length - 1] || 'somewhere else'), 24);
}

// Never let a caller smuggle file contents or oversized text into the persisted ledger.
function sanitize(item) {
  if (!item || typeof item !== 'object') return {};
  const out = {};
  for (const k of ['outcome', 'report', 'problem', 'durationMs']) {
    if (item[k] === undefined) continue;
    out[k] = typeof item[k] === 'string' ? words(oneline(item[k]), 900) : item[k];
  }
  return out;
}
