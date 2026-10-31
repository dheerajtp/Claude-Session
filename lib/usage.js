// What Claude is doing right now, what it has cost, and how much of the plan is left —
// from the two places that actually know: the `claude` CLI's own commands, and this
// office's own measurements. Plan limits come from the CLI's `/usage` command, which
// reports the account-wide percentages Claude itself uses. Nothing is estimated here.

import { spawn } from 'node:child_process';
import os from 'node:os';

const AUTH_TTL = 60_000;
const AGENTS_TTL = 5_000;
const PLAN_TTL = 60_000;
const PLAN_TIMEOUT = 12_000;
const SPAWN_TIMEOUT = 20_000;

export class Usage {
  constructor({ bin, room }) {
    this.bin = bin;
    this.room = room;
    this.auth = null;
    this.authAt = 0;
    this.authError = null;
    this.plan = null;
    this.planAt = 0;
    this.planError = null;
    this.agents = null;
    this.agentsAt = 0;
    this.agentsError = null;
    this.inflight = null;
  }

  async snapshot(force = false) {
    if (!this.inflight) {
      this.inflight = this.collect(force).finally(() => { this.inflight = null; });
    }
    return this.inflight;
  }

  async collect(force) {
    const [auth, live, plan] = await Promise.all([
      this.readAuth(force), this.readAgents(force), this.readPlan(force),
    ]);
    return {
      at: Date.now(),
      signedIn: auth,
      plan,
      live: sessions(live, this.room),
      office: officeTotals(this.room),
      // A silent failure would read as "zero sessions", which is a different claim.
      gaps: [this.authError, this.agentsError, this.planError].filter(Boolean).map((e) => short(e)),
      notMeasured: [
        'Hooked sessions (the ones started in your editor or another terminal) never report their token counts, so those rows show no cost.',
      ],
    };
  }

  readAuth(force) {
    if (!force && this.auth && Date.now() - this.authAt < AUTH_TTL) return Promise.resolve(this.auth);
    if (!this.bin) return Promise.resolve(null);
    return run(this.bin, ['auth', 'status', '--json']).then((res) => {
      if (!res.ok) {
        this.authError = res.err || 'claude auth status did not answer';
        return this.auth;
      }
      const parsed = parseJson(res.out);
      if (!parsed) {
        this.authError = 'claude auth status did not return JSON';
        return this.auth;
      }
      // Only the safe, human-facing facts. Nothing that identifies a token is kept or sent.
      this.auth = {
        loggedIn: Boolean(parsed.loggedIn),
        method: parsed.authMethod || null,
        provider: parsed.apiProvider || null,
        account: parsed.email || null,
        org: parsed.orgName || null,
        plan: parsed.subscriptionType || null,
        projectsDirectory: parsed.projectsDirectory || null,
        checkedAt: Date.now(),
      };
      this.authAt = Date.now();
      this.authError = null;
      return this.auth;
    });
  }

  // The CLI's own /usage command reports the same account-wide percentages a person
  // sees in the terminal. It runs from the temp folder so it never creates a session
  // inside the project being watched.
  readPlan(force) {
    if (!force && this.plan && Date.now() - this.planAt < PLAN_TTL) return Promise.resolve(this.plan);
    if (!this.bin) return Promise.resolve(this.plan);
    return run(this.bin, ['-p', '/usage', '--output-format', 'json'], { cwd: os.tmpdir(), timeout: PLAN_TIMEOUT }).then((res) => {
      this.planAt = Date.now();
      if (!res.ok) {
        this.planError = res.err || 'claude /usage did not answer';
        return this.plan;
      }
      const parsed = parseJson(res.out);
      const plan = parsed && typeof parsed.result === 'string' ? parseUsage(parsed.result) : null;
      if (!plan || !plan.limits.length) {
        this.planError = 'Claude did not report a plan limit for this account.';
        return this.plan;
      }
      this.plan = plan;
      this.planError = null;
      return this.plan;
    });
  }

  readAgents(force) {    if (!force && this.agents && Date.now() - this.agentsAt < AGENTS_TTL) return Promise.resolve(this.agents);
    if (!this.bin) return Promise.resolve(this.agents || []);
    return run(this.bin, ['agents', '--json']).then((res) => {
      if (!res.ok) {
        this.agentsError = res.err || 'claude agents did not answer';
        return this.agents || [];
      }
      const parsed = parseJson(res.out);
      if (!Array.isArray(parsed)) {
        this.agentsError = 'claude agents did not return a list';
        return this.agents || [];
      }
      this.agents = parsed;
      this.agentsAt = Date.now();
      this.agentsError = null;
      return this.agents;
    });
  }
}

// The CLI knows the process; the office knows the story. Join them by session id so a row
// can say both "this is running in that folder" and "it is sitting at a desk in here".
function sessions(live, room) {
  const agents = [...(room?.agents?.values() || [])];
  const bySession = new Map();
  for (const a of agents) bySession.set(a.sessionId || a.id, a);
  const rows = (live || []).map((s) => {
    const here = bySession.get(s.sessionId);
    const folder = folderName(s.cwd || here?.cwd);
    return {
      id: String(s.sessionId || s.pid || ''),
      name: s.name || here?.name || folder || 'a Claude session',
      pid: s.pid ?? null,
      folder: s.cwd || (here ? here.cwd : null),
      folderName: folder,
      status: s.status || 'unknown',
      kind: s.kind || null,
      startedAt: s.startedAt ?? (here ? here.startedAt : null),
      onFloor: Boolean(here),
      activity: here ? here.activity : null,
      model: here?.model || null,
      turns: here?.turns || 0,
      toolCalls: here?.toolCalls || 0,
      costUsd: here?.costUsd || 0,
      tokensIn: here?.tokensIn || 0,
      tokensOut: here?.tokensOut || 0,
      source: here?.source || 'cli-only',
    };
  });
  rows.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return {
    count: rows.length,
    idle: rows.filter((r) => r.status === 'idle').length,
    rows,
  };
}

function officeTotals(room) {
  const agents = [...(room?.agents?.values() || [])];
  const shelf = room?.history?.snapshot()?.items || [];
  const live = agents.filter((a) => !a.parent);
  const helpers = agents.filter((a) => a.parent);

  const tools = new Map();
  const models = new Map();
  for (const a of agents) {
    for (const s of a.toolStats || []) {
      const t = tools.get(s.name) || { name: s.name, calls: 0, ms: 0, maxMs: 0, errs: 0 };
      t.calls += s.calls || 1;
      t.ms += s.ms || 0;
      t.maxMs = Math.max(t.maxMs, s.maxMs || 0);
      t.errs += s.errs || 0;
      tools.set(s.name, t);
    }
    for (const m of a.byModel || []) {
      const k = m.model || 'unknown model';
      const acc = models.get(k) || { model: k, inputTokens: 0, outputTokens: 0, cacheRead: 0, thinkingTokens: 0, costUsd: 0, calls: 0 };
      acc.inputTokens += m.inputTokens || 0;
      acc.outputTokens += m.outputTokens || 0;
      acc.cacheRead += m.cacheRead || 0;
      acc.thinkingTokens += m.thinkingTokens || 0;
      acc.costUsd += m.costUsd || 0;
      acc.calls += m.calls || 0;
      models.set(k, acc);
    }
  }

  const sum = (list, key) => list.reduce((n, x) => n + (Number(x[key]) || 0), 0);
  // Shelf rows for a session still on the floor are the same work counted twice.
  const onFloorKeys = new Set(live.map((a) => a.sessionId || a.id));
  const archived = shelf.filter((i) => !onFloorKeys.has(i.key));
  const hooked = live.filter((a) => a.source === 'claude-hook');
  const fromPage = live.filter((a) => a.source !== 'claude-hook');
  // Hooks carry no usage at all, so a row with neither tokens nor cost is unmeasured, not free.
  const unmeasured = live.filter((a) => !(a.tokensIn || a.tokensOut || a.costUsd));

  const tokensLive = sum(agents, 'tokensIn') + sum(agents, 'tokensOut');
  const tokensShelf = sum(archived, 'tokens');

  return {
    onFloor: {
      sessions: live.length,
      helpers: helpers.length,
      fromThisPage: fromPage.length,
      fromYourEditor: hooked.length,
      costless: unmeasured.length,
    },
    measured: {
      // One row per session on the Finished shelf, however it was started.
      finishedRuns: shelf.length,
      archivedRows: archived.length,
      tokens: tokensLive + tokensShelf,
      tokensSplit: tokensLive > 0,
      costUsd: round4(sum(agents, 'costUsd') + sum(archived, 'costUsd')),
      toolCalls: sum(live, 'toolCalls') + sum(archived, 'toolCalls'),
      seconds: Math.round((sum(agents, 'durationMs') + sum(archived, 'durationMs')) / 1000),
    },
    byTool: [...tools.values()].sort((a, b) => b.ms - a.ms).slice(0, 12).map((t) => ({
      ...t,
      ms: Math.round(t.ms),
      maxMs: Math.round(t.maxMs),
    })),
    byModel: [...models.values()].sort((a, b) => b.costUsd - a.costUsd).map((m) => ({ ...m, costUsd: round4(m.costUsd) })),
    shelfModels: topModels(shelf),
  };
}

function topModels(shelf) {
  const counts = new Map();
  for (const i of shelf) {
    if (!i.model) continue;
    counts.set(i.model, (counts.get(i.model) || 0) + 1);
  }
  return [...counts.entries()].map(([model, runs]) => ({ model, runs })).sort((a, b) => b.runs - a.runs);
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function folderName(cwd) {
  const parts = String(cwd || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || null;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// "Current session: 0% used" and "Current week (all models): 62% used · resets Nov 6
// at 1:30pm (Asia/Calcutta)". Only the limit lines are kept; the contribution breakdown
// underneath is machine-specific advice, not a measurement of the plan.
function parseUsage(text) {
  const limits = [];
  const line = /^\s*(Current [^:\n]+):\s*(\d+)%\s*used(?:\s*·\s*resets\s+(.+?))?\s*$/gim;
  for (const m of String(text || '').matchAll(line)) {
    const used = Math.min(100, Math.max(0, Number(m[2])));
    limits.push({
      label: m[1].trim(),
      used,
      remaining: 100 - used,
      resets: m[3] ? m[3].trim() : null,
    });
  }
  return { checkedAt: Date.now(), limits };
}

// argv only, never a shell: a path with a space in it is one argument, not two commands.
function run(bin, args, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(bin, args, { cwd: opts.cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (err) { resolve({ ok: false, err: err.message }); return; }
    let out = '';
    let errText = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, opts.timeout || SPAWN_TIMEOUT);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { errText += c; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, err: e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, out: out.trim() });
      else resolve({ ok: false, err: errText.trim().split('\n')[0] || `claude ${args[0]} exited with code ${code}`, out: out.trim() });
    });
  });
}

function short(text) {
  return String(text || '').replace(/\s+/g, ' ').slice(0, 160);
}
