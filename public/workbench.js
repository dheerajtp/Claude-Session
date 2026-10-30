// The workbench: the page behind the + button.
//
// Three jobs, because the ask was three things — "show me my projects so I can work in one",
// "let me start a session or go back to one I had before", and "tell me what Claude is doing
// and what it has cost". All of it lives here so the office floor stays a floor.
//
// Everything on screen is a sentence, and every number is one the server actually measured.

const $ = (id) => document.getElementById(id);

// Browsing the home folder is absolute paths; working inside the root is relative.
const state = {
  root: null,
  rel: '',
  open: null,
  entries: [],
  pickPath: null,
  usage: null,
  sessRel: null,
  sessResume: null,
  sess: null,
};

let sheetTab = 'projects';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

async function api(pathname, options) {
  const res = await fetch(pathname, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `${pathname} said ${res.status}`);
    err.body = body;
    err.status = res.status;
    throw err;
  }
  return body;
}

function post(pathname, payload) {
  return api(pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ---- the button -----------------------------------------------------------------------

function wireFab() {
  const fab = $('fab');
  const menu = $('fabMenu');
  const setOpen = (on) => {
    menu.hidden = !on;
    fab.classList.toggle('open', on);
    fab.setAttribute('aria-expanded', String(on));
    $('fabi').textContent = on ? '×' : '+';
  };
  fab.addEventListener('click', () => setOpen(menu.hidden));
  $('fabProjects').addEventListener('click', () => { setOpen(false); openSheet('projects'); });
  $('fabSessions').addEventListener('click', () => { setOpen(false); openSheet('sessions'); });
  $('fabUsage').addEventListener('click', () => { setOpen(false); openSheet('usage'); });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !$('fabWrap').contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('workbench').hidden) closeSheet();
    else if (!menu.hidden) setOpen(false);
  });
}

function openSheet(tab) {
  sheetTab = tab;
  $('workbench').hidden = false;
  showTab(tab);
  if (tab === 'projects') loadList(state.rel);
  else if (tab === 'sessions') openSessionsTab();
  else loadUsage(false);
}

function closeSheet() {
  $('workbench').hidden = true;
}

function showTab(tab) {
  for (const [id, which] of [['wbTabProjects', 'projects'], ['wbTabSessions', 'sessions'], ['wbTabUsage', 'usage']]) {
    $(id).classList.toggle('on', which === tab);
  }
  $('wbProjects').hidden = tab !== 'projects';
  $('wbSessions').hidden = tab !== 'sessions';
  $('wbUsage').hidden = tab !== 'usage';
}

function wireTabs() {
  $('wbTabProjects').addEventListener('click', () => showTab(sheetTab = 'projects'));
  $('wbTabSessions').addEventListener('click', () => { showTab(sheetTab = 'sessions'); openSessionsTab(); });
  $('wbTabUsage').addEventListener('click', () => { showTab(sheetTab = 'usage'); loadUsage(false); });
  $('wbClose').addEventListener('click', closeSheet);
  $('wbUsageRefresh').addEventListener('click', () => loadUsage(true));
  $('wbSessRefresh').addEventListener('click', () => loadSessions(state.sessRel, true));
  $('wbSessProject').addEventListener('change', () => loadSessions($('wbSessProject').value));
  $('wbSeeSessions').addEventListener('click', () => { showTab(sheetTab = 'sessions'); openSessionsTab(); });
}

// ---- projects -------------------------------------------------------------------------

async function loadList(rel) {
  let out;
  try {
    out = await api(`/api/projects?path=${encodeURIComponent(rel || '')}`);
  } catch (err) {
    // No root yet is the normal first visit, not an error worth shouting about.
    if (state.root === null && /picked yet/.test(err.message)) {
      applySettings(err.body.settings);
      openPicker();
      renderList([]);
      $('wbRootLine').textContent = 'No projects folder picked yet. Choose the folder that holds your work.';
      return;
    }
    $('wbRootLine').textContent = err.message;
    return;
  }
  if (out.settings) applySettings(out.settings);
  state.rel = out.rel || '';
  renderCrumb(out);
  renderList(out.entries || []);
  if (out.blocked) $('wbEmptyList').textContent = out.blocked;
  $('wbNewFolder').hidden = false;
  $('wbUp').hidden = !out.parent;
}

function applySettings(s) {
  if (!s) return;
  state.root = s.root;
  $('wbRootLine').textContent = s.root
    ? `Your projects folder is ${s.root}. Open one to see its branches and send an agent in.`
    : 'No projects folder picked yet. Choose the folder that holds your work.';
  $('wbPickRoot').textContent = s.root ? 'change' : 'choose folder';
}

function renderCrumb(out) {
  const crumb = $('wbCrumb');
  crumb.hidden = false;
  crumb.replaceChildren();
  const home = el('button', 'crumbbtn', 'projects folder');
  home.type = 'button';
  home.addEventListener('click', () => { showDetail(null); loadList(''); });
  crumb.append(home);
  const parts = String(out.rel || '').split('/').filter(Boolean);
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    crumb.append(el('span', 'crumbsep', '/'));
    const b = el('button', 'crumbbtn', part);
    b.type = 'button';
    const target = acc;
    b.addEventListener('click', () => { showDetail(null); loadList(target); });
    crumb.append(b);
  }
}

function renderList(entries) {
  const ul = $('wbList');
  ul.replaceChildren();
  const dirs = entries.filter((e) => e.dir);
  state.entries = dirs.map((e) => ({ rel: e.path, name: e.name }));
  $('wbEmptyList').hidden = dirs.length > 0;
  $('wbEmptyList').textContent = 'No folders in here yet.';
  for (const e of dirs) {
    const li = el('li', 'fileitem');
    const main = el('button', 'filemain');
    main.type = 'button';
    const text = el('span', 'filetext');
    text.append(el('span', 'filename', e.name), el('span', 'filekind', e.kind || 'plain folder'));
    main.append(
      el('span', 'fileicon', e.git ? '⎇' : '▸'),
      text,
      el('span', 'filemeta', folderMeta(e)),
    );
    main.addEventListener('click', () => showDetail(e.path));
    li.append(main);
    if (e.folders) {
      const into = el('button', 'mini', 'go inside');
      into.type = 'button';
      into.addEventListener('click', () => { showDetail(null); loadList(e.path); });
      li.append(into);
    }
    ul.append(li);
  }
  const files = entries.filter((e) => !e.dir);
  if (files.length) {
    ul.append(el('li', 'filesummary', `Plus ${files.length} ${files.length === 1 ? 'file' : 'files'} in this folder. Only folders can be worked in.`));
  }
}

function folderMeta(e) {
  const bits = [];
  if (e.folders) bits.push(`${e.folders}${e.foldersMore ? '+' : ''} folder${e.folders === 1 && !e.foldersMore ? '' : 's'} inside`);
  if (e.files) bits.push(`${e.files} file${e.files === 1 ? '' : 's'}`);
  if (e.modifiedAt) bits.push(`last touched ${when(e.modifiedAt)}`);
  return bits.join(' · ');
}

// The detail pane is where the branch choices live, because a branch only means
// something once you can see what is uncommitted.
async function showDetail(rel) {
  state.open = rel;
  const box = $('wbDetail');
  if (!rel) {
    box.hidden = true;
    $('wbNewBranch').hidden = false;
    return;
  }
  let d;
  try {
    d = await api(`/api/project?path=${encodeURIComponent(rel)}`);
  } catch (err) {
    box.hidden = false;
    $('wbProjName').textContent = rel.split('/').pop() || 'this folder';
    $('wbProjFacts').replaceChildren();
    $('wbGitNote').hidden = false;
    $('wbGitNote').textContent = err.message;
    return;
  }
  box.hidden = false;
  $('wbGitNote').hidden = true;
  $('wbProjName').textContent = d.name;
  $('wbWorkHere').dataset.abs = d.path;
  $('wbWorkHere').dataset.rel = d.rel;

  const facts = $('wbProjFacts');
  facts.replaceChildren();
  for (const [label, value] of projFacts(d)) facts.append(row(label, value));

  const dirty = d.dirty && d.git && d.git.found ? d.dirty : null;
  const dirtyLine = $('wbDirty');
  const dirtyList = $('wbDirtyList');
  if (dirty) {
    const n = dirty.count || 0;
    dirtyLine.hidden = false;
    dirtyLine.textContent = n
      ? `${n} ${n === 1 ? 'file has' : 'files have'} changed here since the last save to git${dirty.untracked ? `, ${dirty.untracked} ${dirty.untracked === 1 ? 'one is' : 'of them are'} brand new` : ''}. Nothing is lost when you move between branches, but git will refuse a move that would overwrite them.`
      : 'Nothing is changed here since the last save to git. Every branch is safe to move onto.';
    if (n) {
      dirtyList.hidden = false;
      dirtyList.replaceChildren(...dirty.files.slice(0, 12).map((f) => {
        const li = el('li', null);
        li.append(el('code', 'dirtycode', f.code.trim() || '?'), el('span', null, f.path));
        return li;
      }));
      if (n > 12) dirtyList.append(el('li', 'more', `and ${n - 12} more`));
    } else dirtyList.hidden = true;
  } else {
    dirtyLine.hidden = false;
    dirtyLine.textContent = 'This folder has no git history, so there are no branches to choose. Starting an agent here still works.';
    dirtyList.hidden = true;
  }

  const hasBranches = d.git && d.git.found && Array.isArray(d.branches) && d.branches.length;
  $('wbSwitch').hidden = !hasBranches;
  const sel = $('wbSwitchName');
  sel.replaceChildren();
  for (const b of (d.branches || [])) {
    const opt = el('option', null, b.current ? `${b.name} (you are on it now)` : b.name);
    opt.value = b.name;
    opt.disabled = Boolean(b.current);
    sel.append(opt);
  }
  $('wbNewBranch').hidden = !d.git || !d.git.found;
  if (!d.git || !d.git.found) {
    $('wbNewBranchName').value = '';
  }
}

function projFacts(d) {
  const rows = [['The full folder', d.path]];
  if (d.git && d.git.found) {
    rows.push(['Standing on branch', d.branch || 'git could not say']);
    rows.push(['Other branches', (d.branches || []).map((b) => b.name).filter((n) => n !== d.branch).join(', ') || 'there are none']);
    if (d.last) {
      rows.push(['Last saved', `${when(d.last.at)} — ${d.last.subject} by ${d.last.author} (${d.last.sha})`]);
    } else rows.push(['Last saved', 'nothing has been saved to git here yet']);
    if (d.upstream) rows.push(['Copies to', `${d.upstream}, ${d.dirty.ahead || d.dirty.behind ? `${d.dirty.ahead} to send, ${d.dirty.behind} to fetch` : 'in step'}`]);
  }
  rows.push(['What kind of project', (d.markers || []).join(', ') || 'no project files found']);
  rows.push(['Folders inside', d.folders ? `${d.folders}${d.foldersMore ? '+' : ''}` : 'none']);
  return rows;
}

function row(label, value) {
  const wrap = el('div', 'factrow');
  wrap.append(el('dt', null, label), el('dd', null, String(value ?? '—')));
  return wrap;
}

function when(ms) {
  if (!ms) return '—';
  const diff = Date.now() - Number(ms);
  if (diff < 60_000) return 'just now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(Number(ms)).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---- the three writes -----------------------------------------------------------------

function wireForms() {
  $('wbUp').addEventListener('click', () => {
    const parent = state.rel.split('/').filter(Boolean).slice(0, -1).join('/');
    showDetail(null);
    loadList(parent);
  });

  $('wbDetailClose').addEventListener('click', () => showDetail(null));

  $('wbPickRoot').addEventListener('click', openPicker);
  $('wbPickUse').addEventListener('click', async () => {
    note('wbPickNote', 'Saving that choice…');
    try {
      const out = await post('/api/projects/root', { path: state.pickPath });
      state.root = out.root;
      applySettings(out.settings);
      $('wbPick').hidden = true;
      await loadList('');
      $('wbRootLine').textContent = `Your projects folder is ${out.root}. Open one to see its branches and send an agent in.`;
    } catch (err) {
      note('wbPickNote', err.message);
    }
  });

  $('wbNewFolder').addEventListener('click', () => {
    $('wbNewFolderForm').hidden = !$('wbNewFolderForm').hidden;
    if (!$('wbNewFolderForm').hidden) $('wbNewName').focus();
  });
  $('wbNewCancel').addEventListener('click', () => { $('wbNewFolderForm').hidden = true; $('wbNewNote').hidden = true; });
  $('wbNewFolderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('wbNewName').value.trim();
    if (!name) return note('wbNewNote', 'Type a name for the folder first.');
    note('wbNewNote', `Making ${name}…`);
    try {
      const out = await post('/api/projects/folder', { path: state.rel, name, git: $('wbNewGit').checked });
      $('wbNewNote').hidden = true;
      $('wbNewName').value = '';
      $('wbNewFolderForm').hidden = true;
      await loadList(state.rel);
      note('wbRootLine', `Made ${out.name}. ${out.git && out.git.ok ? 'It has its own git history, so branches start working straight away.' : 'It is ready to work in.'}`);
    } catch (err) {
      note('wbNewNote', `It did not make that folder: ${err.message}`);
    }
  });

  $('wbNewBranch').addEventListener('submit', (e) => { e.preventDefault(); branchAction(true); });
  $('wbSwitch').addEventListener('submit', (e) => { e.preventDefault(); branchAction(false); });

  $('wbWorkHere').addEventListener('click', () => {
    const abs = $('wbWorkHere').dataset.abs;
    if (!abs) return;
    const cwd = $('cwd');
    if (cwd) cwd.value = abs;
    const adv = document.querySelector('.adv');
    if (adv) adv.open = true;
    closeSheet();
    const prompt = $('prompt');
    if (prompt) {
      prompt.focus();
      prompt.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    say(`The agent will work in ${abs}.`);
  });
}

async function branchAction(create) {
  const name = (create ? $('wbNewBranchName') : $('wbSwitchName')).value.trim();
  if (!name) return note('wbGitNote', create ? 'Type a name for the new branch first.' : 'Choose a branch to move onto.');
  note('wbGitNote', create ? `Making ${name} and moving onto it…` : `Moving onto ${name}…`);
  try {
    const out = await post('/api/project/branch', { path: state.open, name, create });
    await showDetail(state.open);
    note('wbGitNote', out.created
      ? `Made ${out.branch} from ${out.from}. ${out.carried ? `${out.carried} changed ${out.carried === 1 ? 'file came' : 'files came'} along with you — nothing was stashed or thrown away.` : 'Nothing was waiting to be saved, so the move was clean.'}`
      : `You are on ${out.branch} now (you were on ${out.from}). ${out.carried ? `${out.carried} changed ${out.carried === 1 ? 'file came' : 'files came'} with you.` : 'Nothing was carried.'}`);
  } catch (err) {
    // 409 means git refused to touch anything — say that first, because it is the relief.
    const b = err.body || {};
    const dirty = b.dirty && b.dirty.count ? b.dirty.count : 0;
    await showDetail(state.open);
    note('wbGitNote', `It did not move, and nothing changed. You are still on ${b.branch || 'the same branch'}. ${err.message}${dirty ? ` — ${dirty} ${dirty === 1 ? 'file' : 'files'} here are saved but not committed, and git will not overwrite them. Save them, or undo those changes yourself, then try again.` : ''}`);
  }
}

function note(id, text) {
  const n = $(id);
  if (!n) return;
  n.hidden = false;
  n.textContent = text;
}

// A short line at the top of the page, so the workbench can report without stealing focus.
function say(text) {
  const banner = $('banner');
  if (!banner) return;
  banner.hidden = false;
  banner.className = 'banner ok';
  banner.textContent = text;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => { banner.hidden = true; }, 6000);
}

// ---- the folder picker --------------------------------------------------------------

async function openPicker() {
  $('wbPick').hidden = false;
  await loadPicker(state.root || (await homeGuess()));
}

async function homeGuess() {
  try {
    const s = await api('/api/projects');
    return (s.settings && s.settings.home) || '/';
  } catch (err) {
    return (err.body && err.body.settings && err.body.settings.home) || '/';
  }
}

async function loadPicker(path) {
  let out;
  try {
    out = await api(`/api/browse?path=${encodeURIComponent(path || '')}`);
  } catch (err) {
    note('wbPickNote', err.message);
    return;
  }
  state.pickPath = out.path;
  $('wbPickNote').hidden = true;
  $('wbPickPath').textContent = out.path;
  $('wbPickUp').disabled = !out.parent;
  $('wbPickUse').textContent = out.isRoot ? 'This is already the one' : 'Use this folder';
  $('wbPickUp').onclick = () => out.parent && loadPicker(out.parent);
  const ul = $('wbPickList');
  ul.replaceChildren();
  if (!out.dirs.length) {
    ul.append(el('li', 'empty', out.blocked || 'No folders in here.'));
    return;
  }
  for (const d of out.dirs) {
    const li = el('li', 'pickitem');
    const open = el('button', 'pickname');
    open.type = 'button';
    open.append(el('span', 'fileicon', d.git ? '⎇' : '▸'), el('span', 'filename', d.name));
    open.addEventListener('click', () => loadPicker(d.path));
    li.append(open);
    if (d.git) li.append(el('span', 'filekind', 'git repo'));
    const use = el('button', 'mini', 'use this one');
    use.type = 'button';
    use.addEventListener('click', () => { state.pickPath = d.path; $('wbPickUse').click(); });
    li.append(use);
    ul.append(li);
  }
}

// ---- sessions -------------------------------------------------------------------------

// The folder the sessions tab is pointed at, as a name a person can recognise.
function sessLabel(rel) {
  if (!rel) return 'the whole projects folder';
  return String(rel).split('/').filter(Boolean).pop() || 'this folder';
}

function fillProjectChoices() {
  const sel = $('wbSessProject');
  const wanted = state.sessRel ?? state.open ?? state.rel ?? '';
  sel.replaceChildren();
  const root = el('option', null, sessOptionName(''));
  root.value = '';
  sel.append(root);
  // The folders in the list you were last looking at, plus any deeper one you opened.
  const seen = new Set(['']);
  const add = (rel) => {
    if (!rel || seen.has(rel)) return;
    seen.add(rel);
    const o = el('option', null, sessOptionName(rel));
    o.value = rel;
    sel.append(o);
  };
  for (const e of state.entries) add(e.rel);
  add(wanted);
  sel.value = seen.has(wanted) ? wanted : '';
}

function sessOptionName(rel) {
  const parts = String(rel || '').split('/').filter(Boolean);
  return parts.length ? parts.join(' / ') : '(the whole projects folder)';
}

async function openSessionsTab() {
  fillProjectChoices();
  await loadSessions($('wbSessProject').value);
}

async function loadSessions(rel, force) {
  state.sessRel = rel || '';
  fillProjectChoices();
  $('wbSessProject').value = state.sessRel;
  $('wbSessLine').textContent = `Reading the sessions recorded for ${sessLabel(state.sessRel)}…`;
  let d;
  try {
    d = await api(`/api/sessions?path=${encodeURIComponent(state.sessRel)}`);
  } catch (err) {
    $('wbSessLine').textContent = err.message;
    $('wbSessList').replaceChildren();
    return;
  }
  if (force && sheetTab !== 'sessions') return;
  state.sess = d;
  $('wbSessLine').textContent = sessSummary(d);
  renderSessions(d);
  const read = $('wbSessRead');
  read.hidden = false;
  const where = d.scanned > 1 ? `${d.scanned} record folders` : 'one record folder';
  const cap = d.truncated ? `, and only the ${d.rows.length} newest of the ${d.count} are listed` : '';
  read.textContent = `${d.note} It read ${d.files} record ${d.files === 1 ? 'file' : 'files'} in ${where}${cap}.`;
}

function sessSummary(d) {
  if (!d.count) return `${sessLabel(state.sessRel)} has no Claude session recorded yet. Start one and the first appears here.`;
  const bits = [`${d.count} Claude ${d.count === 1 ? 'session has' : 'sessions have'} been recorded here`];
  if (d.liveCount) bits.push(`${d.liveCount} ${d.liveCount === 1 ? 'one is' : 'of them are'} still open`);
  if (d.rows[0]) bits.push(`the newest was used ${when(d.rows[0].lastUsedAt)}`);
  return `${sessLabel(state.sessRel)}: ${bits.join(', ')}.`;
}

function renderSessions(d) {
  const ul = $('wbSessList');
  ul.replaceChildren();
  $('wbSessEmpty').hidden = d.rows.length > 0;
  $('wbSessEmpty').textContent = d.count
    ? 'The records are there but this page only shows the newest ones.'
    : 'No Claude session has been recorded in this folder yet. Use "new session" and the first one appears here.';
  for (const s of d.rows) ul.append(sessRow(s));
  if (d.gaps && d.gaps.length) {
    const li = el('li', 'filesummary', `One thing could not be read: ${d.gaps.join(' ')}`);
    ul.append(li);
  }
}

function sessRow(s) {
  const li = el('li', `sessitem${s.live ? ' live' : ''}`);

  const head = el('div', 'sesshead');
  head.append(el('span', 'sesschip', s.live ? (s.status === 'busy' || s.status === 'working' ? 'working now' : 'open, waiting for you') : 'closed'));
  const ask = el('button', 'sessask');
  ask.type = 'button';
  ask.append(
    el('span', 'sessaskkind', s.labelFrom === 'first ask' ? 'You asked' : s.labelFrom ? s.labelFrom : 'this session'),
    el('span', 'sessasktext', `“${s.label}”`),
  );
  ask.addEventListener('click', () => openLaunchForm(s));
  head.append(ask);
  li.append(head);

  li.append(el('div', 'sessmeta', sessMeta(s)));

  if (s.lastPrompt && s.labelFrom === 'first ask') {
    li.append(el('div', 'sesslast', `Last thing you said to it: “${s.lastPrompt}”`));
  }
  if (s.shelf && s.shelf.report) {
    li.append(el('div', 'sessreport', `Its report here: ${s.shelf.report}`));
  }
  if (s.onFloor && s.activity) li.append(el('div', 'sessfloor', `On the office floor right now: ${s.activity}`));

  const acts = el('div', 'sessacts');
  const carry = el('button', 'mini');
  carry.type = 'button';
  carry.textContent = s.live ? 'say something to it' : 'carry on from here';
  carry.addEventListener('click', () => openLaunchForm(s));
  acts.append(carry);

  if (s.stoppable) {
    const stop = el('button', 'mini danger');
    stop.type = 'button';
    stop.textContent = 'stop it';
    stop.addEventListener('click', () => stopSession(s, stop));
    acts.append(stop);
  }
  if (s.live && !s.stoppable) {
    acts.append(el('span', 'sesshint', s.startedFrom === 'your editor'
      ? 'this one is yours in the editor — the page will not stop it'
      : 'running somewhere else — the page will not stop it'));
  }
  if (!s.live) {
    const attach = el('button', 'mini');
    attach.type = 'button';
    attach.textContent = 'how to open it in a terminal';
    attach.addEventListener('click', () => showAttach(li, s));
    acts.append(attach);
  }
  li.append(acts);
  return li;
}

function sessMeta(s) {
  const bits = [`last used ${when(s.lastUsedAt)}`];
  if (s.startedAt && s.startedAt !== s.lastUsedAt) bits.push(`began ${when(s.startedAt)}`);
  bits.push(`started from ${s.startedFrom}`);
  if (s.branch) bits.push(`branch ${s.branch}`);
  if (s.folderName && s.folderName !== sessLabel(state.sessRel)) bits.push(`inside ${s.folderName}`);
  bits.push(s.totalsRead
    ? `${s.costUsd ? `$${s.costUsd.toFixed(s.costUsd < 1 ? 3 : 2)}` : 'no cost'}${s.tokens ? `, ${fmt(s.tokens)} tokens` : ''}${s.seconds ? `, ${spoken(s.seconds * 1000)}` : ''}`
    : 'cost not read');
  if (s.linesAdded || s.linesRemoved) bits.push(`${s.linesAdded || 0} lines added, ${s.linesRemoved || 0} removed`);
  if (s.model) bits.push(s.model);
  return bits.join(' · ');
}

function showAttach(li, s) {
  let line = li.querySelector('.sessattach');
  if (line) { line.remove(); return; }
  line = el('div', 'sessattach');
  line.append(
    el('span', null, 'Type this in a terminal to sit back down at that exact conversation:'),
    el('code', null, s.attach),
  );
  li.append(line);
}

async function stopSession(s, btn) {
  btn.disabled = true;
  try {
    const out = await post('/api/sessions/stop', { sessionId: s.id });
    say(out.stopped
      ? 'That session is stopping. Its conversation is kept, so you can carry on with it tomorrow.'
      : 'It had already ended here.');
    await loadSessions(state.sessRel, true);
  } catch (err) {
    note('wbSessNote', err.message);
    btn.disabled = false;
  }
}

// ---- launching a session, new or carried on ----------------------------------------------

function openLaunchForm(session) {
  const f = $('wbSessForm');
  f.hidden = false;
  state.sessResume = session ? session.id : null;
  const who = session ? `“${session.label}”` : null;
  $('wbSessHeading').textContent = session
    ? `Carrying on ${who}. Claude keeps the same session id, so it remembers what you already told it, and your new line is added on the end.${session.live ? ' That conversation is still open where it was started, so this continues it from here as a second copy.' : ''}`
    : `A brand new session in ${sessLabel(state.sessRel)}. It remembers nothing of the sessions above it — that is what makes it new.`;
  $('wbSessGo').textContent = session ? 'Carry on with it' : 'Send it in';
  $('wbSessClosePrev').closest('label').hidden = Boolean(session);
  $('wbSessName').placeholder = session ? 'optional — renames it on the office floor' : 'optional — it shows on the office floor';
  $('wbSessNote').hidden = true;
  $('wbSessPrompt').focus();
  $('wbSessPrompt').scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function closeLaunchForm() {
  $('wbSessForm').hidden = true;
  $('wbFilePick').hidden = true;
  state.sessResume = null;
}

function wireSessions() {
  $('wbSessNew').addEventListener('click', () => openLaunchForm(null));
  $('wbSessCancel').addEventListener('click', closeLaunchForm);
  $('wbSessFileBtn').addEventListener('click', () => {
    $('wbFilePick').hidden = !$('wbFilePick').hidden;
    if (!$('wbFilePick').hidden) { loadFiles(''); $('wbFileQ').focus(); }
  });
  $('wbFileClose').addEventListener('click', () => { $('wbFilePick').hidden = true; countMentions(); });
  let qTimer = null;
  $('wbFileQ').addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => loadFiles($('wbFileQ').value.trim()), 220);
  });
  $('wbSessPrompt').addEventListener('input', countMentions);

  $('wbSessForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = $('wbSessPrompt').value.trim();
    if (!prompt) return note('wbSessNote', 'Type what to ask for first.');
    const btn = $('wbSessGo');
    btn.disabled = true;
    note('wbSessNote', state.sessResume ? 'Walking back in to that conversation…' : 'Sending it in…');
    try {
      const out = await post('/api/sessions/start', {
        path: state.sessRel,
        prompt,
        sessionId: state.sessResume || undefined,
        name: $('wbSessName').value.trim() || undefined,
        permissionMode: $('wbSessAllow').value,
        maxTurns: Number($('wbSessTurns').value) || 20,
        approvalsHere: $('wbSessApprove').checked,
        closePrevious: !state.sessResume && $('wbSessClosePrev').checked,
      });
      const name = out.state && out.state.name ? out.state.name : 'the new session';
      note('wbSessNote', `${name} is on the floor. ${out.closedPrevious ? `It closed the ${out.closedPrevious} ${out.closedPrevious === 1 ? 'session' : 'sessions'} this page had started here first — those conversations are kept, not deleted. ` : ''}Watch it at a desk, or read again below when it ends.`);
      $('wbSessPrompt').value = '';
      $('wbSessName').value = '';
      closeLaunchForm();
      say(`${name} is working in ${sessLabel(state.sessRel)}.`);
      await loadSessions(state.sessRel, true);
    } catch (err) {
      note('wbSessNote', err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---- the file mention picker ---------------------------------------------------------------

async function loadFiles(q) {
  $('wbFileFolder').textContent = (state.sess && state.sess.folder) || 'this folder';
  let d;
  try {
    d = await api(`/api/project/files?path=${encodeURIComponent(state.sessRel || '')}&q=${encodeURIComponent(q || '')}`);
  } catch (err) {
    note('wbFileNote', err.message);
    return;
  }
  const ul = $('wbFileList');
  ul.replaceChildren();
  $('wbFileNote').hidden = true;
  if (!d.files.length) {
    ul.append(el('li', 'empty', q ? `No file name here contains “${q}”.` : 'No files in this folder.'));
    return;
  }
  for (const f of d.files) {
    const li = el('li', 'pickitem');
    const b = el('button', 'pickname');
    b.type = 'button';
    b.append(el('span', 'filename', f.path), el('span', 'filekind', f.bytes ? `${fmt(f.bytes)} bytes` : ''));
    b.addEventListener('click', () => mention(f.path, b));
    li.append(b);
    ul.append(li);
  }
  if (d.truncated) {
    ul.append(el('li', 'filesummary', `Only the first ${d.files.length} names of the ${d.scanned} entries it looked at are listed — type part of a name to search deeper.`));
  }
}

// A pick becomes "@relative/path" in the ask, which is how Claude Code is told to look at a file.
function mention(rel, btn) {
  const box = $('wbSessPrompt');
  const tag = `@${rel}`;
  if (box.value.includes(tag)) return;
  box.value = box.value.trim().length ? `${box.value.trim()} ${tag}` : tag;
  box.dispatchEvent(new Event('input'));
  if (btn) btn.classList.add('added');
}

function countMentions() {
  const n = ($('wbSessPrompt').value.match(/(^|\s)@\S+/g) || []).length;
  $('wbSessFileNote').textContent = n
    ? `${n} file${n === 1 ? '' : 's'} in your ask. The page only writes the path — it never reads the file.`
    : 'each pick is written into your ask as @its-path';
}

// ---- usage ----------------------------------------------------------------------------

async function loadUsage(force) {
  $('wbUsageLine').textContent = force ? 'Asking Claude again…' : 'Reading what Claude reports about itself…';
  let d;
  try {
    d = await api(`/api/usage${force ? '?fresh=1' : ''}`);
  } catch (err) {
    $('wbUsageLine').textContent = err.message;
    return;
  }
  state.usage = d;
  const a = d.signedIn || {};
  $('wbUsageLine').textContent = a.loggedIn
    ? `Signed in as ${a.account || 'your Claude account'} on the ${a.plan || 'unknown'} plan, through ${a.method || 'the CLI'}.`
    : 'Claude says you are not signed in on this machine, so no session can start until you are.';
  renderUsage(d);
}

function renderUsage(d) {
  const host = $('wbUsageBody');
  host.replaceChildren();

  const live = d.live || { rows: [], count: 0, idle: 0 };
  host.append(section('Running right now', [
    live.count
      ? `${live.count} Claude ${live.count === 1 ? 'session is' : 'sessions are'} open on this machine${live.idle ? `, and ${live.idle} ${live.idle === 1 ? 'one is' : 'of them are'} waiting for you rather than working` : ''}.`
      : 'No Claude session is open on this machine right now.',
  ]));
  const table = el('table', 'ledger');
  const head = el('tr');
  head.append(el('th', null, 'session'), el('th', null, 'folder'), el('th', null, 'doing'), el('th.n', null, 'pid'), el('th.n', null, 'open for'));
  table.append(head);
  if (!live.rows.length) {
    const tr = el('tr');
    const td = el('td', null, 'Nothing is running.');
    td.colSpan = 5;
    tr.append(td);
    table.append(tr);
  }
  for (const r of live.rows) {
    const tr = el('tr');
    tr.append(
      el('td', null, r.name),
      el('td', null, r.folderName || '—'),
      el('td', null, r.onFloor ? `${r.status}, and it is on the office floor` : r.status),
      el('td.n', null, r.pid ? String(r.pid) : '—'),
      el('td.n', null, r.startedAt ? ago(r.startedAt) : '—'),
    );
    table.append(tr);
  }
  host.append(table);

  const o = d.office || {};
  const m = o.measured || {};
  const f = o.onFloor || {};
  const lines = [];
  lines.push(`${num(m.finishedRuns)} ${m.finishedRuns === 1 ? 'session has' : 'sessions have'} finished and been written to the shelf.`);
  const spent = m.costUsd ? `$${m.costUsd.toFixed(m.costUsd < 1 ? 3 : 2)}` : null;
  const tokens = m.tokens ? `${fmt(m.tokens)} tokens` : null;
  const anything = spent || tokens || m.toolCalls || m.seconds;
  lines.push(anything
    ? `This office measured ${[spent, tokens, `${num(m.toolCalls)} ${m.toolCalls === 1 ? 'thing done' : 'things done'}`, m.seconds ? `${spoken(m.seconds * 1000)} of work` : null].filter(Boolean).join(', ')}.`
    : 'Nothing has been measured yet — a session started from this page is what produces these numbers.');
  if (f.sessions) {
    lines.push(`${f.sessions} ${f.sessions === 1 ? 'agent is' : 'agents are'} on the floor (${f.fromThisPage ? `${f.fromThisPage} from this page` : 'none from this page'}${f.fromYourEditor ? `, ${f.fromYourEditor} from your editor` : ''}${f.helpers ? `, plus ${f.helpers} ${f.helpers === 1 ? 'helper' : 'helpers'}` : ''}).`);
  }
  if (f.costless) {
    lines.push(`${f.costless} of the sessions on the floor came from your editor, and a session started that way never reports its tokens — those rows show nothing rather than zero.`);
  }
  host.append(section('What this office measured', lines));

  if (m.tokensSplit) {
    host.append(section('Memory used', ['The split between what Claude read and what it wrote is only known for sessions this page started.']));
  }

  const byTool = (o.byTool || []).filter((t) => t.calls);
  if (byTool.length) {
    host.append(subhead('Where the time went'));
    const tt = el('table', 'ledger');
    const th = el('tr');
    th.append(el('th', null, 'the thing'), el('th.n', null, 'times'), el('th.n', null, 'total'), el('th.n', null, 'slowest'));
    tt.append(th);
    const max = Math.max(...byTool.map((t) => t.ms), 1);
    for (const t of byTool) {
      const tr = el('tr');
      const cell = el('td');
      cell.append(el('span', null, t.name));
      if (t.errs) cell.append(el('span', 'metanote', ` · ${t.errs} did not work`));
      const ms = el('td.n');
      ms.append(el('span', null, spoken(t.ms)), el('i', 'bar'));
      ms.querySelector('i').style.width = `${Math.round((t.ms / max) * 100)}%`;
      tr.append(cell, el('td.n', null, String(t.calls)), ms, el('td.n', null, spoken(t.maxMs)));
      tt.append(tr);
    }
    host.append(tt);
  }

  const byModel = o.byModel || [];
  const shelfModels = o.shelfModels || [];
  if (byModel.length || shelfModels.length) {
    host.append(subhead('Models'));
    const mt = el('table', 'ledger');
    const mh = el('tr');
    mh.append(el('th', null, 'model'), el('th.n', null, 'runs'), el('th.n', null, 'tokens'), el('th.n', null, 'cost'));
    mt.append(mh);
    const named = new Set();
    for (const b of byModel) {
      named.add(b.model);
      const tr = el('tr');
      tr.append(
        el('td', null, b.model),
        el('td.n', null, b.calls ? String(b.calls) : '—'),
        el('td.n', null, fmt(b.inputTokens + b.outputTokens)),
        el('td.n', null, b.costUsd ? `$${b.costUsd.toFixed(b.costUsd < 1 ? 3 : 2)}` : '—'),
      );
      mt.append(tr);
    }
    for (const s of shelfModels.filter((x) => !named.has(x.model))) {
      const tr = el('tr');
      tr.append(el('td', null, s.model), el('td.n', null, String(s.runs)), el('td.n', null, 'not measured'), el('td.n', null, '—'));
      mt.append(tr);
    }
    host.append(mt);
  }

  if (d.gaps && d.gaps.length) {
    host.append(section('One thing could not be read', d.gaps));
  }
  host.append(section('What is not shown here', d.notMeasured || []));

  if (d.signedIn && d.signedIn.projectsDirectory) {
    host.append(el('p', 'hint', `Claude keeps its own session records in ${d.signedIn.projectsDirectory}. The Sessions tab reads the labels, dates and totals from those records for one folder at a time — never a whole conversation, and never anything that looks like a key.`));
  }
}

function section(title, lines) {
  const wrap = el('section', 'wbsec');
  wrap.append(el('h3', null, title));
  for (const l of lines) wrap.append(el('p', null, l));
  return wrap;
}

function subhead(text) {
  return el('div', 'subhead', text);
}

function num(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

function fmt(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

function spoken(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s < 60) return `${s} seconds`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} sec`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function ago(ts) {
  return spoken(Date.now() - Number(ts));
}

// ---- go -------------------------------------------------------------------------------

wireFab();
wireTabs();
wireForms();
wireSessions();
loadList('');
