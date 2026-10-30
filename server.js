import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room } from './lib/room.js';
import { ClaudeRun, clip, safeFlag } from './lib/claude-runner.js';
import { words } from './lib/plain.js';
import { handleHook, reapStaleHooks, noteDismissal, hookStats } from './lib/hook-bridge.js';
import { Inventory } from './lib/inventory.js';
import { History } from './lib/history.js';
import { Asks } from './lib/asks.js';
import { Projects } from './lib/projects.js';
import { Usage } from './lib/usage.js';
import { Sessions } from './lib/sessions.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 4173;
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

const room = new Room();
room.inventory = new Inventory();
room.history = new History(room);
const asks = new Asks(room);
room.asks = asks;
const runs = new Map();
const health = probeClaude();
const projects = new Projects();
const usage = new Usage({ bin: health.claude.path, room });
const sessions = new Sessions({ bin: health.claude.path, room });
// The CLI decides where it keeps session records; ask it instead of assuming.
usage.readAuth(false).then((auth) => {
  const dir = auth?.projectsDirectory;
  if (typeof dir === 'string' && dir.startsWith('/') && dir !== sessions.root) sessions.root = dir;
}).catch(() => { /* the default location is used */ });

room.onSubagent = (parent, input) => {
  const parentAgent = room.agents.get(parent.id);
  if (!parentAgent || room.agents.size >= 14) return null;
  const id = randomUUID().slice(0, 8);
  const name = clip(String(input.subagent_type || 'subagent'), 18) || 'subagent';
  room.upsert(id, {
    name,
    // Inherit, so a helper of a hooked session is swept by the hook reaper with its boss.
    source: parentAgent.source,
    state: 'walking',
    activity: words(input.description || 'a job its boss gave it', 70),
    prompt: words(input.prompt || input.description || '', 900),
    parent: parent.id,
    model: parentAgent.model,
    cwd: parentAgent.cwd,
    startedAt: Date.now(),
  });
  room.syncAgent(id, {
    kind: 'sys',
    text: `${parentAgent.name} hired ${name} for a subtask`,
    human: `${parentAgent.name} asked the ${name} helper to do one small job: ${words(input.description || '', 90)}`,
  });
  return id;
};

function probeClaude() {
  const found = spawnSync('which', [CLAUDE_BIN], { encoding: 'utf8' });
  const binPath = found.status === 0 ? found.stdout.trim() : null;
  let version = null;
  if (binPath) {
    const v = spawnSync(binPath, ['--version'], { encoding: 'utf8', timeout: 8000 });
    version = v.status === 0 ? v.stdout.trim().split('\n')[0] : null;
  }
  return {
    claude: { bin: CLAUDE_BIN, path: binPath, version, found: Boolean(binPath) },
    workdir: process.cwd(),
    pid: process.pid,
    startedAt: Date.now(),
  };
}

const sharpens = new Set();

// Runs the CLI once, headless, to rewrite a prompt. Nothing is executed: plan
// mode and a single turn mean the model only ever returns text.
function sharpenPrompt(prompt, cwd) {
  const ask = [
    'Rewrite the request between <<< and >>> as a prompt for a headless coding agent.',
    'Keep the goal identical. Make four things explicit: the objective, the scope (what to touch and what to leave alone),',
    'any constraints, and the exact shape of the answer the agent should produce.',
    'Prefer short concrete instructions over adjectives. Do not invent file names, APIs, numbers or deadlines.',
    'If something essential is missing, add one final line stating the assumption the agent should work under.',
    'Reply with ONLY the rewritten prompt: plain text, no preamble, no quotes, no code fence.',
    '<<<', prompt, '>>>',
  ].join(' ');
  const args = ['-p', ask, '--output-format', 'text', '--max-turns', '1', '--permission-mode', 'plan'];

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(health.claude.path || CLAUDE_BIN, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      reject(err);
      return;
    }
    sharpens.add(child);
    let out = '';
    let errText = '';
    child.stdout.on('data', (c) => {
      out += c;
      if (out.length > 24000) { try { child.kill('SIGTERM'); } catch { /* gone */ } }
    });
    child.stderr.on('data', (c) => { errText += c; });
    const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch { /* gone */ } }, 75000);
    const done = (fn) => { clearTimeout(timer); sharpens.delete(child); fn(); };
    child.on('error', (err) => done(() => reject(err)));
    child.on('close', (code) => {
      const text = out.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
      if (!text) done(() => reject(new Error(errText.trim().slice(0, 200) || `claude exited with code ${code}`)));
      else done(() => resolve(text));
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
  res.end(data);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const target = path.resolve(PUBLIC, rel);
  if (!target.startsWith(PUBLIC + path.sep) && target !== PUBLIC) return send(res, 403, { error: 'forbidden' });
  fs.readFile(target, (err, buf) => {
    if (err) return send(res, 404, { error: `not found: ${rel}` });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      });
      return res.end();
    }

    if (p === '/api/health') return send(res, 200, health);
    if (p === '/api/state') return send(res, 200, {
      ...room.snapshot(health),
      hooks: hookStats(),
      asks: asks.snapshot(),
      history: room.history.snapshot(),
    });
    if (p === '/api/inventory') return send(res, 200, room.inventory.snapshot());
    if (p === '/api/history') return send(res, 200, room.history.snapshot());

    // Where your projects live, and what one folder looks like from the inside.
    if (p === '/api/projects') {
      const out = projects.list(url.searchParams.get('path') || '');
      return send(res, out.error ? 400 : 200, { settings: projects.snapshot(), ...(out.error ? out : out) });
    }
    if (p === '/api/project') {
      const out = projects.detail(url.searchParams.get('path') || '');
      return send(res, out.error ? 400 : 200, out);
    }
    // Read-only walk of the home folder, used only to choose the projects root.
    if (p === '/api/browse') {
      const out = projects.browse(url.searchParams.get('path') || '');
      return send(res, out.error ? 400 : 200, out);
    }
    // File names inside one project folder, for the mention picker. Never the contents.
    if (p === '/api/project/files') {
      const where = projects.insideRoot(url.searchParams.get('path') || '');
      if (where.error) return send(res, 400, where);
      const out = projects.files(where.rel, url.searchParams.get('q') || '');
      return send(res, out.error ? 400 : 200, out);
    }
    // Every Claude session this folder has ever had, from the CLI's own records.
    if (p === '/api/sessions') {
      const where = projects.insideRoot(url.searchParams.get('path') || '');
      if (where.error) return send(res, 400, where);
      const out = await sessions.list(where.path);
      return send(res, out.error ? 400 : 200, { ...out, settings: projects.snapshot() });
    }
    if (p === '/api/usage') {
      if (!health.claude.found) return send(res, 503, { error: `Claude CLI (${CLAUDE_BIN}) not found on PATH` });
      return send(res, 200, await usage.snapshot(url.searchParams.get('fresh') === '1'));
    }

    if (p === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`data: ${JSON.stringify({
        kind: 'hello',
        health,
        inventory: room.inventory.snapshot(),
        asks: asks.snapshot(),
        history: room.history.snapshot(),
        seq: room.seq,
      })}\n\n`);
      const release = room.addClient(res);
      const beat = setInterval(() => {
        try { res.write(': ping\n\n'); } catch { /* closed */ }
      }, 20000);
      req.on('close', () => { clearInterval(beat); release(); });
      return;
    }

    if (req.method === 'POST') {
      if (p === '/api/sharpen') {
        const body = await readBody(req);
        const prompt = String(body.prompt || '').trim();
        if (!prompt) return send(res, 400, { error: 'prompt required' });
        if (!health.claude.found) return send(res, 503, { error: `Claude CLI (${CLAUDE_BIN}) not found on PATH` });
        if (sharpens.size >= 2) return send(res, 429, { error: 'already rewriting prompts — try again in a moment' });
        const cwd = body.cwd ? path.resolve(String(body.cwd)) : process.cwd();
        try {
          const improved = await sharpenPrompt(prompt, cwd);
          return send(res, 200, { improved, changed: improved !== prompt });
        } catch (err) {
          return send(res, 502, { error: err.message });
        }
      }

      if (p === '/api/run') {
        const body = await readBody(req);
        const prompt = String(body.prompt || '').trim();
        if (!prompt) return send(res, 400, { error: 'prompt required' });
        if (!health.claude.found) {
          return send(res, 503, { error: `Claude CLI (${CLAUDE_BIN}) not found on PATH`, hint: 'install it or set CLAUDE_BIN' });
        }
        const run = new ClaudeRun(room, {
          prompt,
          bin: health.claude.path || CLAUDE_BIN,
          model: body.model || null,
          permissionMode: body.permissionMode || 'plan',
          maxTurns: body.maxTurns || 25,
          allowedTools: body.allowedTools || null,
          cwd: body.cwd ? path.resolve(String(body.cwd)) : process.cwd(),
          name: body.name || null,
          approvalsHere: Boolean(body.approvalsHere),
        });
        runs.set(run.id, run);
        run.start();
        return send(res, 202, { agentId: run.id, state: run.room.agents.get(run.id) });
      }

      if (p === '/api/stop') {
        const body = await readBody(req);
        const run = runs.get(body.agentId);
        if (!run) return send(res, 404, { error: 'no live run with that id' });
        const stopped = run.stop();
        if (stopped) setTimeout(() => runs.delete(run.id), 6000);
        return send(res, 200, { stopped });
      }

      if (p === '/api/dismiss') {
        const body = await readBody(req);
        const id = String(body.agentId);
        const agent = room.agents.get(id);
        const removed = room.remove(id);
        if (removed) {
          noteDismissal(id);
          if (agent?.sessionId) asks.forgetSession(agent.sessionId);
        }
        return send(res, 200, { removed });
      }

      if (p === '/api/hook') {
        const body = await readBody(req, 48 * 1024);
        const result = await handleHook(room, body, { asks, history: room.history });
        // A held call answers with the hook contract and nothing else, because this
        // exact object is what the waiting hook script prints for Claude Code to read.
        if (result.hookSpecificOutput) return send(res, 200, { hookSpecificOutput: result.hookSpecificOutput });
        return send(res, result.ok ? 200 : 400, result);
      }

      if (p === '/api/ask') {
        const body = await readBody(req);
        const out = asks.answer(String(body.askId || ''), body);
        if (!out) return send(res, 404, { error: 'that question is already answered or timed out' });
        if (out.error) return send(res, 400, out);
        return send(res, 200, { ok: true, asks: asks.snapshot() });
      }

      if (p === '/api/arming') {
        const body = await readBody(req);
        const agent = room.agents.get(String(body.agentId || ''));
        if (!agent) return send(res, 404, { error: 'no agent with that id on the floor' });
        // A session that already closed cannot be held: arming it would leave a stale
        // entry that nothing ever cleans up, because its SessionEnd has already fired.
        if (['done', 'error', 'leaving'].includes(agent.state)) {
          return send(res, 409, { error: `that session already ${agent.state === 'error' ? 'hit a problem' : 'ended'} — arm it while it is still running` });
        }
        const sid = agent.sessionId || agent.id;
        const on = Boolean(body.on);
        asks.setArmed(sid, on);
        room.broadcast('asks:update', { armed: [...asks.armed], open: asks.snapshot().open });
        room.syncAgent(agent.id, {
          kind: 'sys',
          text: on ? 'approvals route to the office' : 'approvals back to the terminal',
          human: on
            ? `It will ask you here before it runs anything that changes the machine.`
            : `Approvals go back to the terminal, so the office only watches.`,
        });
        return send(res, 200, { armed: on, asks: asks.snapshot() });
      }

      if (p === '/api/feed') {
        const body = await readBody(req);
        const id = String(body.agentId || randomUUID().slice(0, 8));
        const patch = {};
        for (const k of ['name', 'state', 'activity', 'model', 'cwd', 'sessionId', 'source', 'parent']) {
          if (body[k] != null) patch[k] = body[k];
        }
        if (!patch.source) patch.source = 'external';
        for (const k of ['turns', 'toolCalls', 'tokensIn', 'tokensOut']) {
          if (body[k] != null) patch[k] = Number(body[k]) || 0;
        }
        if (body.costUsd != null) patch.costUsd = Number(body.costUsd) || 0;
        if (Array.isArray(body.todos)) {
          patch.todos = body.todos.slice(0, 40).map((t) => ({
            content: words(String(t.content ?? t.text ?? ''), 120),
            status: t.status || (t.done ? 'completed' : 'pending'),
          }));
          patch.todoDone = patch.todos.filter((t) => t.status === 'completed').length;
          patch.todoTotal = patch.todos.length;
        }
        if (body.done) { patch.state = 'done'; patch.endedAt = Date.now(); }
        if (body.error) { patch.state = 'error'; patch.endedAt = Date.now(); patch.activity = words(body.error, 90); }

        const isNew = !room.agents.has(id);
        room.upsert(id, patch);
        if (body.note) room.pushLog(id, { kind: body.noteKind || 'info', text: words(body.note, 200) });
        room.syncAgent(id, body.note ? { kind: body.noteKind || 'info', text: words(body.note, 200) } : undefined);
        return send(res, 200, { ok: true, isNew, agentId: id });
      }

      if (p === '/api/projects/root') {
        const body = await readBody(req);
        const out = projects.setRoot(body.path);
        if (out.error) return send(res, 400, out);
        room.broadcast('projects:root', { settings: projects.snapshot() });
        return send(res, 200, { ...out, settings: projects.snapshot() });
      }

      if (p === '/api/projects/folder') {
        const body = await readBody(req);
        const out = projects.createFolder(body.path || '', body.name, { git: body.git !== false });
        if (out.error) return send(res, 400, out);
        // Creating a folder is only worth a ticker line if it actually happened.
        room.broadcast('ticker', { text: `A new folder called ${out.name} is ready to work in.`, tone: 'ok' });
        return send(res, 201, { ...out, settings: projects.snapshot() });
      }

      if (p === '/api/project/branch') {
        const body = await readBody(req);
        const out = projects.switchBranch(body.path || '', body.name, Boolean(body.create));
        // Nothing was destroyed either way — a refusal says so and lists what is uncommitted.
        return send(res, out.error ? 409 : 200, out);
      }

      // Start a session in a project folder: a new one, or the same conversation again.
      if (p === '/api/sessions/start') {
        const body = await readBody(req);
        const prompt = String(body.prompt || '').trim();
        if (!prompt) return send(res, 400, { error: 'the session needs something to be asked to do' });
        if (!health.claude.found) return send(res, 503, { error: `Claude CLI (${CLAUDE_BIN}) not found on PATH` });
        const where = projects.insideRoot(body.path || '');
        if (where.error) return send(res, 400, where);
        const resume = body.sessionId ? String(body.sessionId).trim() : null;
        if (resume && !safeFlag(resume)) {
          return send(res, 400, { error: 'that session id has characters a session id should not have, so it was not passed to the CLI' });
        }
        if (body.name && !safeFlag(body.name)) {
          return send(res, 400, { error: 'a session name may not start with a dash and cannot contain those characters' });
        }
        // "A new session closes the previous one" — the previous one is stopped, never deleted,
        // and only if this page is the one that started it.
        let closed = 0;
        if (body.closePrevious) {
          for (const run of runs.values()) {
            if (run.stopped || run.workdir !== where.path) continue;
            if (resume && (run.sessionId || run.resume) === resume) continue;
            if (run.stop()) closed++;
          }
        }
        const run = new ClaudeRun(room, {
          prompt,
          bin: health.claude.path || CLAUDE_BIN,
          model: body.model || null,
          permissionMode: body.permissionMode || 'plan',
          maxTurns: body.maxTurns || 25,
          cwd: where.path,
          sessionName: body.name || null,
          resume,
          approvalsHere: Boolean(body.approvalsHere),
        });
        runs.set(run.id, run);
        run.start();
        room.broadcast('sessions:change', { folder: where.path, resuming: Boolean(resume) });
        return send(res, 202, {
          agentId: run.id,
          folder: where.path,
          resumed: resume,
          closedPrevious: closed,
          state: room.agents.get(run.id),
        });
      }

      if (p === '/api/sessions/stop') {
        const body = await readBody(req);
        const sid = String(body.sessionId || '').trim();
        const agent = [...room.agents.values()].find((a) => (a.sessionId || a.id) === sid);
        if (!agent) return send(res, 404, { error: 'that session is not on the floor right now, so there is nothing here to stop' });
        if (agent.source !== 'claude') {
          return send(res, 409, {
            error: `This page did not start that session — it is ${agent.source === 'claude-hook' ? 'running in your editor or another terminal' : 'reported from somewhere else'}. Stopping it belongs to the place it came from, and nothing else can close it cleanly.`,
            where: agent.source,
          });
        }
        const run = runs.get(agent.id);
        if (!run) return send(res, 409, { error: 'that session has already ended here — the conversation is kept, and you can switch back to it' });
        const stopped = run.stop();
        if (stopped) setTimeout(() => runs.delete(run.id), 6000);
        // The record stays. Stopping is not deleting: the session remains resumable tomorrow.
        room.broadcast('sessions:change', { folder: agent.cwd, stopped: sid });
        return send(res, 200, { stopped, kept: true, sessionId: agent.sessionId || agent.id });
      }

      return send(res, 404, { error: `no route: POST ${p}` });
    }

    if (req.method === 'GET') return serveStatic(req, res, p);
    return send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    return send(res, 400, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  agent office  →  http://${HOST}:${PORT}`);
  console.log(`  claude cli    →  ${health.claude.found ? `${health.claude.path} (${health.claude.version || 'version unknown'})` : 'NOT FOUND — set CLAUDE_BIN'}`);
  console.log(`  office cwd    →  ${process.cwd()}\n`);
});

// Hooked sessions that vanish without a SessionEnd must still leave the floor.
setInterval(() => reapStaleHooks(room, { history: room.history, asks }), 60_000).unref();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const run of runs.values()) run.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
