// The folder picker and the branch switcher.
//
// Two authorities, and they are deliberately different:
//   BROWSE is read-only and reaches anywhere under your home folder, because choosing a
//          projects root means being able to walk to it. It only ever lists directory names.
//   WORK   is confined to the one root you chose. Creating a folder and switching branches
//          happen inside it and nowhere else.
//
// The git rule is "create and switch, never destroy": this module can make a branch and move
// between them, but never stashes, resets, discards or forces. If a checkout would overwrite
// something uncommitted, git itself refuses — and that refusal is shown to you verbatim.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { words } from './plain.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = path.join(HERE, '..', 'data', 'settings.json');
const MAX_ENTRIES = 400;
const MAX_DIR_BYTES = 2 * 1024 * 1024;
// Limits for the file picker. A walk of a real repo can hit 40k paths, so it stops
// after this many and says it stopped rather than pretending the folder is small.
const MAX_FILES = 300;
const SCAN_LIMIT = 4000;
const MAX_DEPTH = 3;
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'venv', '.venv', '__pycache__',
  '.next', '.nuxt', 'coverage', 'vendor', 'cache', '.cache', 'tmp', '__snapshots__',
]);

// What makes a folder look like a project rather than a pile of downloads.
const MARKERS = [
  ['.git', 'git repo'],
  ['package.json', 'node project'],
  ['pyproject.toml', 'python project'],
  ['requirements.txt', 'python project'],
  ['go.mod', 'go project'],
  ['Cargo.toml', 'rust project'],
  ['pom.xml', 'java project'],
  ['build.gradle', 'java project'],
  ['composer.json', 'php project'],
  ['Gemfile', 'ruby project'],
  ['Makefile', 'built from source'],
  ['docker-compose.yml', 'docker project'],
];

export class Projects {
  constructor() {
    this.home = realpathOr(os.homedir(), os.homedir());
    this.root = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
      const root = typeof raw.projectsRoot === 'string' ? raw.projectsRoot : null;
      if (root && isDirectory(root)) this.root = realpathOr(root, root);
    } catch {
      // No saved choice yet — the page asks for one.
    }
  }

  save() {
    const body = JSON.stringify({ projectsRoot: this.root }, null, 2);
    try {
      fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
      fs.writeFileSync(SETTINGS, body);
    } catch {
      // A settings file we cannot write is inconvenient, not dangerous.
    }
  }

  snapshot() {
    return {
      home: this.home,
      root: this.root,
      rootExists: Boolean(this.root && isDirectory(this.root)),
      defaultGuess: pickGuess(this.home),
    };
  }

  // ---- browsing (read-only, anywhere under home) ------------------------------------

  browse(rawPath) {
    const dir = this.openForBrowse(rawPath);
    if (dir.error) return dir;
    const dirs = [];
    let blocked = null;
    try {
      for (const entry of fs.readdirSync(dir.path, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        // .claude holds the login for every session; it is not a place to work.
        if (entry.name === '.claude') continue;
        const full = path.join(dir.path, entry.name);
        dirs.push({ ...describe(full, entry.name), path: full });
        if (dirs.length >= MAX_ENTRIES) break;
      }
    } catch (err) {
      blocked = err.code === 'EACCES' ? 'That folder will not open — it belongs to another user.' : err.message;
    }
    dirs.sort(compareEntries);
    const up = path.dirname(dir.path);
    return {
      path: dir.path,
      // Browsing stops at home: above it is everyone else's machine.
      parent: up !== dir.path && inside(up, this.home) ? up : null,
      atHome: dir.path === this.home,
      isRoot: this.root === dir.path,
      blocked,
      dirs,
      count: dirs.length,
    };
  }

  openForBrowse(rawPath) {
    const wanted = rawPath ? String(rawPath) : this.home;
    if (!path.isAbsolute(wanted)) return { error: 'give a full path starting with /' };
    const real = realpathOr(wanted, null);
    if (!real) return { error: 'no folder at that path' };
    if (!isDirectory(real)) return { error: 'that is a file, not a folder' };
    if (!inside(real, this.home)) return { error: `the page only browses inside your home folder (${this.home})` };
    // ~/.claude holds the login and the transcripts of every session. It is neither a
    // place to work nor a place to look.
    if (inside(real, path.join(this.home, '.claude')) || inDotGit(real)) {
      return { error: 'that folder is machinery Claude keeps for itself — pick where your own projects live' };
    }
    return { path: real };
  }

  setRoot(rawPath) {
    const found = this.openForBrowse(rawPath);
    if (found.error) return { error: found.error };
    this.root = found.path;
    this.save();
    return { ok: true, root: this.root };
  }

  // ---- working (inside the chosen root only) ----------------------------------------

  insideRoot(rawRel) {
    if (!this.root) return { error: 'no projects folder picked yet' };
    const raw = String(rawRel ?? '');
    if (raw.includes('\0')) return { error: 'that name cannot be used' };
    const abs = path.isAbsolute(raw) ? raw : path.join(this.root, raw);
    const real = realpathOr(abs, null);
    if (!real) return { error: 'no folder at that path' };
    if (!isDirectory(real)) return { error: 'that is a file, not a folder' };
    if (!inside(real, this.root)) return { error: 'that is outside your projects folder' };
    if (inDotGit(real) || inside(real, path.join(os.homedir(), '.claude'))) {
      return { error: 'that path is inside machinery Claude keeps for itself' };
    }
    return { path: real, rel: relTo(this.root, real) };
  }

  // One level of the root, with a project label on every folder that earns one.
  list(rawRel) {
    const base = this.insideRoot(rawRel ?? '');
    if (base.error) return base;
    const entries = [];
    let blocked = null;
    try {
      for (const e of fs.readdirSync(base.path, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(base.path, e.name);
        const rel = relTo(this.root, full);
        if (e.isDirectory()) entries.push({ ...describe(full, e.name), path: rel });
        else entries.push({ name: e.name, dir: false, path: rel, bytes: sizeOf(full) });
        if (entries.length >= MAX_ENTRIES) break;
      }
    } catch (err) {
      blocked = err.code === 'EACCES' ? 'That folder will not open — it belongs to another user.' : err.message;
    }
    entries.sort(compareEntries);
    return {
      root: this.root,
      rel: base.rel,
      parent: base.rel ? relTo(this.root, path.dirname(base.path)) : null,
      entries,
      folders: entries.filter((e) => e.dir).length,
      blocked,
    };
  }

  // Everything a person needs before pointing an agent at this folder.
  detail(rawRel) {
    const where = this.insideRoot(rawRel);
    if (where.error) return where;
    const out = {
      root: this.root,
      path: where.path,
      rel: where.rel,
      name: path.basename(where.path),
      isRoot: where.rel === '',
      git: gitRepo(where.path),
    };
    if (out.git.found) {
      out.branch = gitBranch(where.path);
      out.branches = gitBranches(where.path);
      out.dirty = gitDirty(where.path);
      out.last = gitLast(where.path);
      out.upstream = gitUpstream(where.path);
    }
    out.markers = MARKERS.filter(([f]) => fs.existsSync(path.join(where.path, f))).map(([, label]) => label);
    const kids = countFolders(where.path);
    out.folders = kids.n;
    out.foldersMore = kids.more;
    return out;
  }

  createFolder(rawRel, rawName, opts = {}) {
    const parent = this.insideRoot(rawRel ?? '');
    if (parent.error) return parent;
    const name = String(rawName ?? '').trim();
    const bad = validateName(name);
    if (bad) return { error: bad };
    const target = path.join(parent.path, name);
    if (fs.existsSync(target)) return { error: `there is already a folder called ${name} here` };
    try {
      fs.mkdirSync(target);
    } catch (err) {
      return { error: err.code === 'EACCES' ? 'That folder will not let you write here.' : err.message };
    }
    const out = { ok: true, path: relTo(this.root, target), abs: target, name };
    if (opts.git) {
      const init = git(target, ['init', '-b', 'main'], 15000);
      out.git = init.ok
        ? { ok: true, note: 'started a git history here' }
        : { ok: false, note: gitErrorText(init) || 'git could not start here — the folder is still there' };
    }
    return out;
  }

  // A file list for the mention picker: names only, inside the chosen root, machinery skipped.
  // Nothing about the contents is read, so this cannot leak what is in a file.
  files(rawRel, rawQuery) {
    const where = this.insideRoot(rawRel ?? '');
    if (where.error) return where;
    const q = String(rawQuery ?? '').trim().toLowerCase().slice(0, 60);
    const out = [];
    let blocked = null;
    let scanned = 0;
    // Breadth first, so the cap fills with the files nearest the top of the project
    // rather than whatever folder the disk happened to list first.
    const queue = [{ dir: where.path, depth: MAX_DEPTH }];
    while (queue.length && out.length < MAX_FILES && scanned < SCAN_LIMIT) {
      const job = queue.shift();
      let handle;
      try { handle = fs.opendirSync(job.dir); } catch (err) {
        if (!blocked) blocked = err.code === 'EACCES' ? 'Some folders here will not open — they belong to another user.' : err.message;
        continue;
      }
      try {
        for (;;) {
          const e = handle.readSync();
          if (!e) break;
          if (out.length >= MAX_FILES || scanned >= SCAN_LIMIT) break;
          if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
          const full = path.join(job.dir, e.name);
          if (e.isDirectory()) {
            if (job.depth > 0) queue.push({ dir: full, depth: job.depth - 1 });
            continue;
          }
          if (!e.isFile()) continue;
          scanned++;
          const rel = relTo(where.path, full);
          if (!q || rel.toLowerCase().includes(q)) out.push({ path: rel, name: e.name, bytes: sizeOf(full) });
        }
      } finally {
        try { handle.closeSync(); } catch { /* already gone */ }
      }
    }
    // The ones you can name are usually the ones nearest the top.
    out.sort((a, b) => (depthOf(a.path) - depthOf(b.path)) || a.path.localeCompare(b.path, undefined, { numeric: true }));
    return {
      root: this.root,
      rel: where.rel,
      folder: where.path,
      query: q || null,
      files: out,
      count: out.length,
      scanned,
      // Both caps are reported, because "there are no more files" would be a lie.
      truncated: out.length >= MAX_FILES || scanned >= SCAN_LIMIT,
      blocked,
    };
  }

  // The only two git writes this app performs: name a new branch, or stand on an existing one.
  switchBranch(rawRel, rawName, create) {
    const where = this.insideRoot(rawRel);
    if (where.error) return where;
    // Read the branch first: every refusal has to be able to say "you are still on it".
    const before = gitBranch(where.path);
    const name = String(rawName ?? '').trim();
    if (!name) return { error: 'the branch needs a name', untouched: true, branch: before };
    if (name.startsWith('-') || /[\s~^:?*[\\]/.test(name) || name.includes('..')) {
      return { error: 'that is not a legal branch name — no spaces, and none of ~ ^ : ? * [ \\', untouched: true, branch: before };
    }
    if (!gitRepo(where.path).found) return { error: `${where.rel || 'this folder'} is not a git repo, so it has no branches`, untouched: true, branch: before };
    const args = create ? ['switch', '-c', name] : ['switch', name];
    const res = git(where.path, args, 20000);
    if (!res.ok) {
      const why = gitErrorText(res);
      return {
        error: why || `git could not ${create ? `create ${name}` : `move to ${name}`}`,
        // Nothing was touched. Say so plainly, because the scary case is a lost file.
        untouched: true,
        branch: before,
        dirty: gitDirty(where.path),
      };
    }
    return {
      ok: true,
      path: where.rel,
      from: before,
      branch: gitBranch(where.path),
      created: Boolean(create),
      carried: gitDirty(where.path).files.length,
    };
  }
}

// ---- helpers --------------------------------------------------------------------------

function validateName(name) {
  if (!name) return 'the folder needs a name';
  if (name === '.' || name === '..') return 'that name means another folder';
  if (name.startsWith('.')) return 'a leading dot hides the folder from the list';
  if (name.length > 60) return 'that name is longer than 60 characters';
  if (/[/\0]/.test(name)) return 'use one folder name, not a path';
  if (/[<>:"|?*]/.test(name)) return 'those characters cannot be used in a folder name';
  return null;
}

function describe(full, name) {
  const hasGit = fs.existsSync(path.join(full, '.git'));
  const folders = countFolders(full);
  return {
    name,
    dir: true,
    git: hasGit,
    kind: [...new Set(MARKERS.filter(([f]) => fs.existsSync(path.join(full, f))).map(([, l]) => l))].join(', ') || 'plain folder',
    folders: folders.n,
    foldersMore: folders.more,
    files: countSome(full, (e) => e.isFile(), 60).n,
    modifiedAt: mtime(full),
  };
}

// Projects you can actually work in come first, then plain folders, then by name.
function compareEntries(a, b) {
  if (a.dir !== b.dir) return a.dir ? -1 : 1;
  if (a.dir && b.dir && a.git !== b.git) return a.git ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true });
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

function inDotGit(p) {
  return p.split(path.sep).includes('.git');
}

function relTo(base, p) {
  const rel = path.relative(base, p);
  return rel === '' ? '' : rel.split(path.sep).join('/');
}

function depthOf(rel) {
  return String(rel).split('/').length - 1;
}

function mtime(p) {
  try { return fs.statSync(p).mtimeMs; } catch { return null; }
}

function sizeOf(p) {
  try { return fs.statSync(p).size; } catch { return null; }
}

// A folder listing that opens a 100k-file directory would stall the page, so both
// counts stop early and say they stopped.
function countFolders(dir) {
  return countSome(dir, (e) => e.isDirectory(), 60);
}

function countSome(dir, want, cap) {
  let handle;
  try { handle = fs.opendirSync(dir); } catch { return { n: 0, more: false }; }
  let n = 0;
  let more = false;
  try {
    // Dir has no sync iterator, so pull entries one at a time until it returns null.
    for (;;) {
      const e = handle.readSync();
      if (!e) break;
      if (e.name.startsWith('.')) continue;
      if (want(e)) n++;
      if (n >= cap) { more = true; break; }
    }
  } catch {
    // A half-count is still useful.
  } finally {
    try { handle.closeSync(); } catch { /* already gone */ }
  }
  return { n, more };
}

function pickGuess(home) {
  for (const c of [
    path.join(home, 'Documents', 'Client-Projects'),
    path.join(home, 'Documents', 'Projects'),
    path.join(home, 'Documents'),
    path.join(home, 'Projects'),
    path.join(home, 'Code'),
    path.join(home, 'code'),
    path.join(home, 'Developer'),
    path.join(home),
  ]) {
    if (isDirectory(c)) return c;
  }
  return home;
}

// ---- git ------------------------------------------------------------------------------

function git(cwd, args, timeout = 8000) {
  const res = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout,
    maxBuffer: MAX_DIR_BYTES,
    env: process.env,
  });
  return {
    ok: res.status === 0,
    out: (res.stdout || '').trim(),
    err: (res.stderr || res.error?.message || '').trim(),
  };
}

function gitRepo(cwd) {
  const r = git(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (!r.ok || r.out !== 'true') return { found: false };
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  return {
    found: true,
    top: top.ok ? top.out : cwd,
    atRoot: top.ok ? realpathOr(top.out, top.out) === realpathOr(cwd, cwd) : true,
  };
}

function gitBranch(cwd) {
  const r = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!r.ok) return null;
  return r.out === 'HEAD' ? detached(cwd) : r.out;
}

function detached(cwd) {
  const sha = git(cwd, ['rev-parse', '--short', 'HEAD']);
  return sha.ok ? `no branch (detached at ${sha.out})` : 'no branch';
}

function gitBranches(cwd) {
  const r = git(cwd, ['branch', '--list', '--format=%(refname:short)|%(committerdate:iso8601)|%(HEAD)']);
  if (!r.ok) return [];
  return r.out.split('\n').filter(Boolean).map((line) => {
    const [name, date, head] = line.split('|');
    return { name: words(name, 60), updatedAt: date || null, current: head === '*' };
  }).sort((a, b) => (a.current === b.current ? a.name.localeCompare(b.name) : a.current ? -1 : 1));
}

function gitDirty(cwd) {
  const r = git(cwd, ['status', '--porcelain=v1', '--branch']);
  if (!r.ok) return { ok: false, files: [], ahead: 0, behind: 0, error: gitErrorText(r) };
  const files = [];
  let ahead = 0;
  let behind = 0;
  for (const line of r.out.split('\n')) {
    if (line.startsWith('##')) {
      const up = line.match(/\[(.+) \]/);
      if (up) {
        const a = up[1].match(/ahead (\d+)/);
        const b = up[1].match(/behind (\d+)/);
        ahead = a ? Number(a[1]) : 0;
        behind = b ? Number(b[1]) : 0;
      }
      continue;
    }
    const code = line.slice(0, 2);
    const name = line.slice(3).replace(/^"|"$/g, '');
    if (!name) continue;
    files.push({
      code,
      path: words(name, 140),
      staged: code[0] !== ' ' && code[0] !== '?',
      changed: code[1] !== ' ' && code[1] !== '?',
    });
  }
  return { ok: true, files: files.slice(0, 300), count: files.length, ahead, behind, untracked: files.filter((f) => f.code === '??').length };
}

function gitLast(cwd) {
  const r = git(cwd, ['log', '-1', '--format=%h|%ct|%an|%s']);
  if (!r.ok) return null;
  const [sha, ts, author, ...rest] = r.out.split('|');
  return { sha, at: Number(ts) * 1000, author: words(author, 40), subject: words(rest.join('|'), 120) };
}

function gitUpstream(cwd) {
  const r = git(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  return r.ok ? r.out : null;
}

function gitErrorText(res) {
  const text = res.err || res.out || '';
  if (!text) return null;
  // git writes its advice to stderr in full paragraphs; the first line is the finding.
  const first = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('hint:'))[0] || '';
  return words(first.replace(/^fatal:\s*/i, '').replace(/^error:\s*/i, ''), 220);
}
