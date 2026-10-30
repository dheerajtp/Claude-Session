// Every Claude session this folder has ever had, from the records the CLI itself keeps.
//
// The page normally only sees sessions that are alive right now. To switch back to a
// conversation from last week, the one honest list is `~/.claude/projects/<this folder>/*.jsonl`,
// one file per session. Reading it is a deliberate change to what this app promised before,
// and it stays inside the same limits:
//   - only the folder you are standing in, resolved to its real path;
//   - only a bounded head and tail of each file, never the whole transcript;
//   - only the labels a person needs (the prompts you typed, the dates, the CLI's own totals).
// Nothing that looks like a key, a token or a URL in a config is copied out, and the raw
// lines are never kept or sent — only the small summarised row.
//
// Where a session came from is read from the record's own `entrypoint`, so the page can say
// "started in your editor" instead of guessing. `claude agents --json --all` adds which of
// them are alive right now; the office's own floor adds what a live one is doing.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { humanize, words } from './plain.js';

const LIVE_TTL = 5_000;
const SPAWN_TIMEOUT = 20_000;
const HEAD_BYTES = 160_000; // the first real prompt is usually inside the first few records
const TAIL_BYTES = 96_000; // enough to reach the last cost-state and the last prompt
const MAX_PROJECT_DIRS = 24; // this folder plus the folders inside it
const MAX_FILES = 200;
const MAX_ROWS = 120;

// The CLI's own folder naming: every character that is not a letter or a digit becomes a dash.
// Verified against the recorded cwd of 34 real project folders on this machine.
export function projectDirName(absPath) {
  return absPath.replace(/[^a-zA-Z0-9]/g, '-');
}

export class Sessions {
  constructor({ bin, room, home = os.homedir(), projectsDir = null } = {}) {
    this.bin = bin || null;
    this.room = room || null;
    this.home = home;
    this.root = projectsDir || path.join(home, '.claude', 'projects');
    this.live = null;
    this.liveAt = 0;
    this.liveError = null;
    this.inflight = null;
  }

  // One call at a time: the page refreshes this list and a second read of the same
  // folder would only duplicate the disk work.
  async list(rawFolder) {
    const folder = realpathOr(rawFolder, null);
    if (!folder) return { error: 'no folder at that path' };
    if (!inside(folder, this.home)) return { error: `sessions are only listed for folders inside your home folder` };
    if (!isDirectory(folder)) return { error: 'that is a file, not a folder' };
    if (this.inflight && this.inflight.folder === folder) return this.inflight.promise;
    const entry = { folder };
    entry.promise = this.read(folder).finally(() => { if (this.inflight === entry) this.inflight = null; });
    this.inflight = entry;
    return entry.promise;
  }

  async read(folder) {
    const live = await this.liveRows();
    const prefix = projectDirName(folder);
    const found = this.candidateDirs(prefix);
    const dirs = found.dirs;
    const gaps = [];
    if (found.missed > 0) gaps.push(`${found.missed} folder${found.missed === 1 ? '' : 's'} inside this one were not read — the list stops at ${MAX_PROJECT_DIRS}`);
    const rows = [];
    let files = 0;
    for (const dir of dirs) {
      let names;
      try {
        names = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl'));
      } catch (err) {
        if (err.code !== 'ENOENT') gaps.push(`could not open ${path.basename(dir)}: ${err.code || err.message}`);
        continue;
      }
      for (const name of names) {
        if (files >= MAX_FILES) { gaps.push(`only the first ${MAX_FILES} session records were read here`); break; }
        files++;
        const full = path.join(dir, name);
        const id = name.slice(0, -'.jsonl'.length);
        let row;
        try { row = this.readOne(full, id); } catch (err) { gaps.push(`${name}: ${err.code || err.message}`); continue; }
        // A record only belongs to this folder if its own cwd says so. Two different
        // paths can escape to the same folder name, so the escape is a hint, not proof.
        if (!row || !row.cwd || !cwdMatches(row.cwd, folder)) continue;
        rows.push(this.shape(row, id, folder, live));
      }
    }
    rows.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
    const out = {
      folder,
      folderName: path.basename(folder),
      recordDir: path.relative(this.root, dirs[0]) || path.basename(dirs[0]),
      scanned: dirs.length,
      files,
      count: rows.length,
      liveCount: rows.filter((r) => r.live).length,
      rows: rows.slice(0, MAX_ROWS),
      truncated: rows.length > MAX_ROWS,
      gaps,
      note: 'Every session ever recorded for this folder, including ones started in your editor or a terminal. Only the prompts you typed, the dates and the CLI totals are read - never the full conversation.',
    };
    return out;
  }

  // The folder's own record dir, plus the dirs of folders inside it.
  candidateDirs(prefix) {
    const out = [path.join(this.root, prefix)];
    let names;
    try { names = fs.readdirSync(this.root); } catch { return { dirs: out, missed: 0 }; }
    const extra = names.filter((n) => n !== prefix && n.startsWith(prefix + '-'));
    const kept = extra.slice(0, MAX_PROJECT_DIRS - 1);
    for (const n of kept) out.push(path.join(this.root, n));
    return { dirs: out, missed: extra.length - kept.length };
  }

  // ---- one session record ----------------------------------------------------------------

  readOne(full, id) {
    const st = fs.statSync(full);
    const head = readRange(full, 0, Math.min(HEAD_BYTES, st.size));
    const tail = st.size > HEAD_BYTES + TAIL_BYTES ? dropFirstLine(readRange(full, st.size - TAIL_BYTES, TAIL_BYTES)) : '';
    const seen = { id, cwd: null, branch: null, entrypoint: null, version: null, startedAt: null, prompt: null };
    const cost = {};
    let lastPrompt = null;
    let model = null;

    for (const line of head.split('\n')) {
      const o = parse(line);
      if (!o) continue;
      note(o, seen, cost, (m) => { model = m; }, (p) => { lastPrompt = p; });
    }
    for (const line of tail.split('\n')) {
      const o = parse(line);
      if (!o) continue;
      note(o, seen, cost, (m) => { model = m; }, (p) => { lastPrompt = p; });
    }

    // A file with no prompt of its own is a worktree or a subagent scratch record.
    if (!seen.cwd) return null;
    return { ...seen, ...cost, lastPrompt, model, bytes: st.size, lastUsedAt: st.mtimeMs };
  }

  shape(r, id, folder, live) {
    const here = this.room ? [...this.room.agents.values()].find((a) => (a.sessionId || a.id) === id) : null;
    const cli = live.get(id);
    const shelf = this.room?.history?.snapshot()?.items?.find((i) => i.key === id) || null;
    const startedFrom = sourceOf(r.entrypoint, here?.source, shelf?.source);
    const clean = (t) => words(humanize(t).text || t, 110);
    const firstAsk = r.prompt ? clean(r.prompt) : null;
    const lastAsk = r.lastPrompt ? clean(r.lastPrompt) : null;
    // A long live transcript can hold its opening prompt past the part that was read.
    // Saying what you last asked, and saying that it is the last one, beats a blank row.
    const label = firstAsk || lastAsk || (cli?.name ? `Session named ${words(cli.name, 40)}` : null);
    return {
      id,
      shortId: id.slice(0, 8),
      // The label is the first thing you asked, because that is how a person remembers a session.
      label: label || '(no prompt was found in the part of the record that was read)',
      labelFrom: firstAsk ? 'first ask' : lastAsk ? 'last ask' : cli?.name ? 'its name' : null,
      lastPrompt: lastAsk,
      startedAt: r.startedAt || null,
      lastUsedAt: r.lastUsedAt || null,
      cwd: r.cwd || folder,
      folderName: path.basename(r.cwd || ''),
      branch: r.branch && r.branch !== 'HEAD' ? r.branch : null,
      model: r.model || here?.model || (shelf?.model ?? null),
      startedFrom,
      // The CLI only lists sessions that are alive, so `live` is a fact, not a guess.
      live: Boolean(cli) || Boolean(here && !here.endedAt),
      status: cli?.status || (here && !here.endedAt ? here.state : 'closed'),
      pid: cli?.pid ?? null,
      cliName: cli?.name || null,
      onFloor: Boolean(here),
      activity: here?.activity || null,
      // Measured by the office when the run came through here; otherwise by the CLI's own ledger.
      costUsd: r.totalCostUSD != null ? round4(r.totalCostUSD) : (here?.costUsd || shelf?.costUsd || 0),
      tokens: r.tokens ? r.tokens.in + r.tokens.out : (here ? (here.tokensIn || 0) + (here.tokensOut || 0) : shelf?.tokens || 0),
      tokensIn: r.tokens?.in ?? null,
      tokensOut: r.tokens?.out ?? null,
      seconds: r.totalDuration != null ? Math.round(r.totalDuration / 1000) : Math.round((here?.durationMs || shelf?.durationMs || 0) / 1000),
      linesAdded: r.linesAdded ?? null,
      linesRemoved: r.linesRemoved ?? null,
      // A big live transcript can keep its totals past the part that was read. Saying
      // "not read" is honest; showing a zero would look like it cost nothing.
      totalsRead: r.totalCostUSD != null || Boolean(here?.costUsd || here?.tokensIn) || Boolean(shelf?.costUsd || shelf?.tokens),
      bytes: r.bytes,
      // Only a session this office spawned can be stopped from this page.
      stoppable: Boolean(here && here.source === 'claude' && !here.endedAt),
      resumable: true,
      attach: `claude attach ${id.replace(/[^a-zA-Z0-9-]/g, '')}`,
      shelf: shelf ? { outcome: shelf.outcome, report: words(shelf.report || shelf.problem || '', 160) } : null,
    };
  }

  // ---- live sessions ----------------------------------------------------------------------

  async liveRows() {
    if (this.live && Date.now() - this.liveAt < LIVE_TTL) return indexById(this.live);
    if (!this.bin) return indexById(this.live || []);
    const res = await run(this.bin, ['agents', '--json', '--all']);
    if (!res.ok) {
      this.liveError = short(res.err || 'claude agents did not answer');
      return indexById(this.live || []);
    }
    let parsed;
    try { parsed = JSON.parse(res.out); } catch { this.liveError = 'claude agents did not return a list'; return indexById(this.live || []); }
    this.live = Array.isArray(parsed) ? parsed : [];
    this.liveAt = Date.now();
    this.liveError = null;
    return indexById(this.live);
  }

  // The exact command, shown to you so you can take a session over in your own terminal.
  static attachCommand(id) {
    return `claude attach ${String(id).replace(/[^a-zA-Z0-9-]/g, '')}`;
  }
}

// ---- record mining ------------------------------------------------------------------------

// One pass over a line's record, filling the small set of fields worth showing.
function note(o, seen, cost, setModel, setLastPrompt) {
  if (o.sessionId && !seen.id) seen.id = o.sessionId;
  if (!seen.cwd && o.cwd) seen.cwd = String(o.cwd);
  if (!seen.branch && o.gitBranch) seen.branch = String(o.gitBranch);
  if (!seen.entrypoint && o.entrypoint) seen.entrypoint = String(o.entrypoint);
  if (!seen.version && o.version) seen.version = String(o.version);
  if (!seen.startedAt && o.timestamp) seen.startedAt = isoToMs(o.timestamp);
  if (!seen.prompt) {
    const ask = promptOf(o);
    if (ask) { seen.prompt = ask.slice(0, 900); if (!seen.startedAt && o.timestamp) seen.startedAt = isoToMs(o.timestamp); }
  }
  if (o.type === 'last-prompt' && typeof o.lastPrompt === 'string') setLastPrompt(o.lastPrompt.slice(0, 900));
  if (o.type === 'cost-state') {
    if (o.totalCostUSD != null) cost.totalCostUSD = o.totalCostUSD;
    if (o.totalDuration != null) cost.totalDuration = o.totalDuration;
    if (o.totalLinesAdded != null) cost.linesAdded = o.totalLinesAdded;
    if (o.totalLinesRemoved != null) cost.linesRemoved = o.totalLinesRemoved;
    if (o.startTime) cost.startedAt = Number(o.startTime);
    const usage = o.modelUsage || {};
    const models = Object.keys(usage);
    if (models.length) {
      const top = models.reduce((a, b) => ((usage[b].costUSD || 0) > (usage[a].costUSD || 0) ? b : a), models[0]);
      setModel(String(top).slice(0, 40));
      cost.tokens = models.reduce((acc, m) => ({
        in: acc.in + (usage[m].inputTokens || 0) + (usage[m].cacheReadInputTokens || 0),
        out: acc.out + (usage[m].outputTokens || 0),
      }), { in: 0, out: 0 });
    }
  }
}

// The first thing a person typed, and nothing the harness injected.
function promptOf(o) {
  if (o.type === 'user' && !o.isSidechain && !o.isMeta) {
    const c = o.message?.content;
    const text = typeof c === 'string' ? c : Array.isArray(c)
      ? c.filter((p) => p && typeof p === 'object' && p.type === 'text').map((p) => p.text || '').join(' ')
      : '';
    const clean = String(text).trim();
    if (clean && !clean.startsWith('{') && !/<tool_result|<command-name>/.test(clean)) return clean;
  }
  if (o.type === 'queue-operation' && typeof o.content === 'string' && o.content.trim()) return o.content.trim();
  return null;
}

// ---- helpers ------------------------------------------------------------------------------

function cwdMatches(cwd, folder) {
  return cwd === folder || cwd.startsWith(folder + path.sep);
}

function indexById(rows) {
  const map = new Map();
  for (const r of rows || []) map.set(String(r.sessionId || r.pid || ''), r);
  return map;
}

function parse(line) {
  const t = String(line || '').trim();
  if (!t.startsWith('{')) return null;
  try { return JSON.parse(t); } catch { return null; }
}

function isoToMs(s) {
  const n = Date.parse(String(s || ''));
  return Number.isNaN(n) ? null : n;
}

function readRange(file, position, bytes) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, position);
    return buf.slice(0, n).toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* already closed */ } }
  }
}

function dropFirstLine(text) {
  const i = String(text).indexOf('\n');
  return i < 0 ? '' : text.slice(i + 1);
}

function sourceOf(entrypoint, floorSource, shelfSource) {
  // Only a session the office itself spawned is known to have come from this page.
  // Everything else is described by what the record actually says.
  if (floorSource === 'claude' || shelfSource === 'claude') return 'this page';
  if (floorSource === 'claude-hook') return 'your editor';
  if (entrypoint === 'claude-vscode') return 'your editor';
  if (entrypoint === 'cli') return 'a terminal';
  if (entrypoint === 'sdk-cli') return 'a headless command (claude -p)';
  if (entrypoint === 'sdk-py') return 'a python script';
  return 'somewhere else';
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function realpathOr(p, fallback) {
  try { return fs.realpathSync(p); } catch { return fallback; }
}

function isDirectory(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function inside(p, boundary) {
  return p === boundary || p.startsWith(boundary + path.sep);
}

function short(text) {
  return String(text || '').replace(/\s+/g, ' ').slice(0, 160);
}

// argv only, never a shell.
function run(bin, args) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(bin, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (err) { resolve({ ok: false, err: err.message }); return; }
    let out = '';
    let errText = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, SPAWN_TIMEOUT);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { errText += c; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, err: e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, out: out.trim() });
      else resolve({ ok: false, err: errText.trim().split('\n')[0] || `claude ${args[0]} exited with code ${code}` });
    });
  });
}
