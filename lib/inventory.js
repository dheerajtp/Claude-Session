import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '..', 'data', 'inventory.json');
const HOME = path.join(os.homedir(), '.claude');
const PROJECT = path.join(HERE, '..');

// Two sources, in order: what a real session reports in system/init (authoritative,
// and only for that session), and — before any session has spoken — what is
// installed for this user and this project. Marketplace caches are never scanned:
// they hold plugins the CLI does not load.
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
    if (this.source !== 'session') this.scanInstalled();
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

  // Before a session speaks, show what this computer has: the user's own agents
  // and skills, plus this project's. Names come from frontmatter when present.
  scanInstalled() {
    const agents = new Set();
    const skills = new Set();
    for (const root of [HOME, path.join(PROJECT, '.claude')]) {
      walk(path.join(root, 'agents'), (file) => {
        agents.add(frontName(file) || path.basename(file, '.md'));
      });
      walk(path.join(root, 'skills'), (file) => {
        if (path.basename(file) !== 'SKILL.md') return;
        skills.add(frontName(file) || path.basename(path.dirname(file)));
      });
    }
    if (!agents.size && !skills.size) return false;
    this.agents = dedupe([...agents]);
    this.skills = dedupe([...skills]);
    this.seenAt = Date.now();
    this.sessionId = null;
    this.source = 'installed';
    this.save();
    return true;
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

function walk(dir, visit) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (isCacheCopy(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else if (entry.isFile()) visit(full);
  }
}

// Marketplace leftovers sit next to real installs and are never loaded by the CLI.
function isCacheCopy(name) {
  return name === '.git' || name === 'node_modules' || name.endsWith('.bak') || name.endsWith('.staging');
}

function frontName(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(4096);
    const text = buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, 0)).toString('utf8');
    const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    const named = block && /^name:\s*(.+?)\s*$/m.exec(block[1]);
    return named ? named[1].replace(/^["']|["']$/g, '').trim() : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function dedupe(list) {
  return [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
