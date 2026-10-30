import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '..', 'data', 'inventory.json');

// The roster of what a Claude session had available comes only from its own
// system/init event. Scanning ~/.claude would also pick up marketplace
// .bak/.staging copies that the CLI never loads, so it is not done here.
export class Inventory {
  constructor() {
    this.model = null;
    this.models = [];
    this.tools = [];
    this.agents = [];
    this.skills = [];
    this.usage = new Map();
    this.seenAt = null;
    this.sessionId = null;
    this.source = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
      Object.assign(this, {
        model: raw.model ?? null,
        models: raw.models ?? [],
        tools: raw.tools ?? [],
        agents: raw.agents ?? [],
        skills: raw.skills ?? [],
        seenAt: raw.seenAt ?? null,
        sessionId: raw.sessionId ?? null,
        source: raw.source ?? null,
      });
      this.usage = new Map(raw.usage ?? []);
    } catch {
      // No cache yet: the dorm stays dark until a real session reports its roster.
    }
  }

  absorbInit(msg) {
    if (!msg || msg.subtype !== 'init') return false;
    this.model = msg.model || this.model;
    if (msg.model && !this.models.includes(msg.model)) this.models.push(msg.model);
    let changed = false;
    for (const key of ['tools', 'agents', 'skills']) {
      const next = dedupe((msg[key] || []).map(String));
      if (next.length && next.join('|') !== this[key].join('|')) {
        this[key] = next;
        changed = true;
      }
    }
    this.seenAt = Date.now();
    this.sessionId = msg.session_id || this.sessionId;
    this.source = 'session';
    this.save();
    return changed;
  }

  noteModel(model) {
    if (!model || this.models.includes(model)) return;
    this.models.push(model);
    this.save();
  }

  markUsed(kind, name) {
    if (!name) return;
    const key = `${kind}:${name}`;
    const prev = this.usage.get(key) || { count: 0, lastAt: null, errs: 0 };
    this.usage.set(key, { count: prev.count + 1, lastAt: Date.now(), errs: prev.errs });
    this.save();
  }

  // A bed only counts as "on shift" when the call the agent made actually ran.
  markError(kind, name) {
    if (!name) return;
    const key = `${kind}:${name}`;
    const prev = this.usage.get(key);
    if (!prev) return;
    this.usage.set(key, { ...prev, errs: (prev.errs || 0) + 1 });
    this.save();
  }

  snapshot() {
    return {
      known: Boolean(this.seenAt),
      source: this.source,
      seenAt: this.seenAt,
      sessionId: this.sessionId,
      model: this.model,
      models: this.models,
      tools: this.tools,
      agents: this.agents,
      skills: this.skills,
      counts: {
        agents: this.agents.length,
        skills: this.skills.length,
        tools: this.tools.length,
        models: this.models.length,
      },
      usage: [...this.usage.entries()].map(([key, v]) => ({ key, ...v })),
    };
  }

  save() {
    const body = JSON.stringify({
      model: this.model,
      models: this.models,
      tools: this.tools,
      agents: this.agents,
      skills: this.skills,
      usage: [...this.usage.entries()],
      seenAt: this.seenAt,
      sessionId: this.sessionId,
      source: this.source,
    }, null, 2);
    fs.mkdir(path.dirname(CACHE), { recursive: true }, (err) => {
      if (err) return;
      fs.writeFile(CACHE, body, () => {});
    });
  }
}

function dedupe(list) {
  return [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
