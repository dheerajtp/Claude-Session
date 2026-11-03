import { Office } from './world.js';
import { renderLegend } from './legend.js';
import { Dorm } from './dorm.js';
import { alertsOn, setAlerts, canNotify, announceFinished, announceNeedsYou } from './notify.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const office = new Office($('office'));
const dorm = new Dorm($('dorm'));
const agents = new Map();
const feedItems = [];
let health = null;
let inventory = null;
let asks = { open: [], recentlyAnswered: [], armed: [], windowMs: 50000, stats: {} };
let shelf = { items: [], count: 0 };
let selected = null;
let dirty = false;
let room = 'office';

office.onselect = (id) => { selected = id; markDirty(); };

function markDirty() {
  if (dirty) return;
  dirty = true;
  requestAnimationFrame(() => { dirty = false; render(); });
}

let hookSetup = null;
let setupDone = false;
const EMPTY_FULL = 'Nobody is in the room yet. Send an agent off to the right, or start one in VS Code or a terminal and it will walk in here.';

function renderSetup(listLen) {
  const card = $('setup');
  if (!card) return;
  const needs = !!hookSetup && !hookSetup.installed;
  const show = setupDone ? listLen === 0 : needs;
  if (setupDone && listLen > 0) setupDone = false;
  card.hidden = !show;
  const missingTool = needs && (hookSetup.jq === false || hookSetup.curl === false);
  if (!setupDone) {
    $('setupHead').textContent = "Sessions from VS Code and your terminal can't reach this office yet.";
    $('setupSub').textContent = missingTool ? 'Install jq and curl first, then reload.' : 'Connect them and a new session will walk in here.';
    $('setupBtn').hidden = missingTool;
    $('setupDetails').textContent = hookSetup?.settingsPath ? `Changes ${hookSetup.settingsPath}` : '';
  }
  $('empty').textContent = needs || setupDone ? 'Nobody is in the room yet.' : EMPTY_FULL;
}

async function connectSessions() {
  const btn = $('setupBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/hooks/install', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error || 'Could not connect.');
    setupDone = true;
    hookSetup = { ...(hookSetup || {}), installed: true };
    $('setupHead').textContent = 'Connected. Sessions that were already open need to be restarted \u2014 new ones will walk in.';
    $('setupSub').textContent = '';
    $('setupBtn').hidden = true;
    $('setupDetails').textContent = '';
    renderSetup(agents.size);
  } catch (e) {
    $('setupSub').textContent = String(e.message || e);
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  renderLegend($('legendBar'));
  $('setupBtn')?.addEventListener('click', connectSessions);
  try {
    health = await fetch('/api/health').then((r) => r.json());
    const snap = await fetch('/api/state').then((r) => r.json());
    hookSetup = snap.hookSetup || hookSetup;
    (snap.agents || []).forEach((a) => agents.set(a.id, a));
    (snap.events || []).forEach((e) => { if (e.kind === 'ticker') pushFeed(e, true); });
    setInventory(snap.inventory);
    $('cwd').value = health.workdir || location.origin;
    $('model').placeholder = 'default model';
    if (!health.claude.found) {
      $('runBtn').disabled = true;
      banner(`Claude CLI "${health.claude.bin}" was not found on this machine's PATH, so the real feed is unavailable. `
        + 'Install the Claude CLI or start the server with CLAUDE_BIN=/path/to/claude. The office still accepts external feeds via POST /api/feed.', 'bad');
    }
  } catch (err) {
    banner(`Could not reach the office server: ${err.message}`, 'bad');
  }
  connect();
  wire();
  markDirty();
  showRoom(location.hash === '#dorm' ? 'dorm' : 'office');
  setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString(); }, 1000);
}

function connect() {
  const es = new EventSource('/api/stream');
  es.onopen = () => setConn('live');
  es.onerror = () => setConn('down');
  es.onmessage = (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }
    if (msg.kind === 'hello') {
      health = msg.health;
      setConn('live');
      if (msg.inventory) setInventory(msg.inventory);
      if (msg.asks) setAsks(msg.asks);
      if (msg.history) setShelf(msg.history);
      resync();
      return;
    }
    if (msg.kind === 'agent:update') { agents.set(msg.agent.id, msg.agent); markDirty(); return; }
    if (msg.kind === 'agent:remove') { agents.delete(msg.id); if (selected === msg.id) selected = null; markDirty(); return; }
    if (msg.kind === 'inventory:update') { setInventory(msg.inventory); markDirty(); return; }
    if (msg.kind === 'ask:open' || msg.kind === 'ask:resolved' || msg.kind === 'asks:update') {
      if (msg.kind === 'ask:open') announceNeedsYou(banner, msg.ask);
      refreshAsks();
      return;
    }
    if (msg.kind === 'run:finished') { announceFinished(msg.item, banner); refreshShelf(); markDirty(); }
    if (msg.kind === 'ticker') { pushFeed(msg); markDirty(); }
  };
}

function setInventory(inv) {
  inventory = inv || null;
  dorm.setInventory(inventory);
}

function setAsks(next) {
  asks = next || asks;
  markDirty();
}

function setShelf(next) {
  shelf = next || shelf;
  markDirty();
}

// The ask lives in the server's memory only for the 50s it is held, so the page pulls a
// fresh snapshot rather than trying to keep its own copy of a moving queue.
async function refreshAsks() {
  try {
    const r = await fetch('/api/state').then((x) => x.json());
    hookSetup = r.hookSetup || hookSetup;
    setAsks(r.asks);
    setShelf(r.history);
  } catch { /* the next event retries */ }
}

async function refreshShelf() {
  try {
    const r = await fetch('/api/history').then((x) => x.json());
    setShelf(r);
  } catch { /* the next event retries */ }
}

async function resync() {
  try {
    const snap = await fetch('/api/state').then((r) => r.json());
    hookSetup = snap.hookSetup || hookSetup;
    agents.clear();
    (snap.agents || []).forEach((a) => agents.set(a.id, a));
    setInventory(snap.inventory);
    setAsks(snap.asks);
    setShelf(snap.history);
    if (selected && !agents.has(selected)) { selected = null; office.selected = null; }
    markDirty();
  } catch { /* the next hello will retry */ }
}

function setConn(state) {
  const c = $('conn');
  c.className = `conn ${state}`;
  c.querySelector('span').textContent = state === 'live' ? 'socket live' : 'socket down';
}

function banner(text, kind) {
  const b = $('banner');
  b.hidden = false;
  b.textContent = text;
  b.className = `banner ${kind === 'ok' ? 'ok' : ''}`;
  b.onclick = () => { b.hidden = true; };
}

function pushFeed(ev, silent) {
  feedItems.unshift(ev);
  if (feedItems.length > 140) feedItems.length = 140;
  if (silent) return;
}

function wire() {
  $('runForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      prompt: $('prompt').value.trim(),
      model: $('model').value.trim() || null,
      permissionMode: $('mode').value,
      maxTurns: Number($('turns').value) || 20,
      cwd: $('cwd').value.trim() || undefined,
      approvalsHere: $('approveHere').checked,
    };
    if (!payload.prompt) return;
    $('runBtn').disabled = true;
    try {
      const r = await fetch('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) banner(`Run rejected: ${j.error || r.status}`, 'bad');
      else { $('banner').hidden = true; $('prompt').value = ''; }
    } catch (err) {
      banner(`Run failed: ${err.message}`, 'bad');
    } finally {
      $('runBtn').disabled = !health || !health.claude.found;
    }
  });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => showRoom(tab.dataset.room));
  }
  $('grpAgents').addEventListener('click', () => setGroup('agent'));
  $('grpSkills').addEventListener('click', () => setGroup('skill'));
  $('dormSearch').addEventListener('input', (e) => { dorm.setFilter(e.target.value); markDirty(); });

  $('fitBtn').addEventListener('click', () => { activeIso().autoFit = true; activeIso().fit(); });
  $('sharpenBtn').addEventListener('click', sharpenComposer);
  window.addEventListener('hashchange', () => showRoom(location.hash === '#dorm' ? 'dorm' : 'office'));
  $('detailClose').addEventListener('click', () => { selected = null; office.selected = null; markDirty(); });
  const alertsBtn = $('alertsBtn');
  const paintAlerts = (note) => {
    alertsBtn.textContent = alertsOn() ? 'Alerts on' : 'Tell me when done';
    alertsBtn.className = `badge ${alertsOn() ? 'real' : 'neutral'} clickable`;
    alertsBtn.title = note || (alertsOn() ? 'You will hear a chime and get a notification when work finishes. Click to turn off.' : 'Get a notification and a chime when work finishes or needs you.');
  };
  alertsBtn.addEventListener('click', async () => {
    const { permission } = await setAlerts(!alertsOn());
    paintAlerts();
    if (!alertsOn()) return;
    if (permission === 'denied' || permission === 'unsupported' || !canNotify()) {
      banner('Alerts are on, but your browser is blocking desktop notifications — you will still hear a chime and see the tab title change. Allow notifications for this site to get pop-ups too.');
    } else {
      banner('Alerts are on. You will be told when work finishes or needs you.', 'ok');
    }
  });
  paintAlerts();
  $('needsYou').addEventListener('click', () => $('askCard').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  $('askAllDeny').addEventListener('click', () => {
    for (const ask of asks.open || []) {
      answerAsk(ask.id, { decision: 'deny', reason: `You denied the ${ask.tool} call from the office page.` });
    }
  });
  $('finishedToggle').addEventListener('click', () => {
    finishedOpen = !finishedOpen;
    $('finishedToggle').textContent = finishedOpen ? 'hide' : 'show';
    renderFinished();
  });
  // The countdown is the only clock-driven copy on the page: an unanswered card must
  // say how long it has left, or it reads as a stall.
  setInterval(() => { if ((asks.open || []).length) tickAllCountdowns(); }, 1000);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') $('runBtn').click();
    if (e.key === 'Escape') { selected = null; office.selected = null; markDirty(); }
    if (e.key === 'f' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') { activeIso().autoFit = true; activeIso().fit(); }
    if ((e.key === '1' || e.key === '2') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') showRoom(e.key === '1' ? 'office' : 'dorm');
  });
}

async function sharpenPrompt(promptText, cwd) {
  const r = await fetch('/api/sharpen', post({ prompt: promptText, cwd }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `sharpen failed (${r.status})`);
  return j.improved;
}

async function sharpenComposer() {
  const box = $('prompt');
  const note = $('sharpenNote');
  const btn = $('sharpenBtn');
  const current = box.value.trim();
  if (!current) { note.textContent = 'write a prompt first'; return; }
  if (box.dataset.sharpened === current) {
    box.value = box.dataset.original || current;
    box.dataset.sharpened = '';
    note.textContent = 'back to your wording';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Sharpening…';
  note.textContent = 'asking claude to tighten it (read-only, one turn)';
  try {
    const improved = await sharpenPrompt(current, $('cwd').value.trim() || undefined);
    box.dataset.original = current;
    box.dataset.sharpened = improved;
    box.value = improved;
    note.textContent = 'rewritten — click Sharpen again to undo, or edit it';
  } catch (err) {
    note.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sharpen prompt';
  }
}

function activeIso() {
  return room === 'dorm' ? dorm.iso : office.iso;
}

function setGroup(group) {
  dorm.setGroup(group);
  $('grpAgents').classList.toggle('on', group === 'agent');
  $('grpSkills').classList.toggle('on', group === 'skill');
  markDirty();
}

function showRoom(next) {
  room = next === 'dorm' ? 'dorm' : 'office';
  history.replaceState(null, '', room === 'dorm' ? '#dorm' : location.pathname);
  const dormOn = room === 'dorm';
  office.active = !dormOn;
  dorm.active = dormOn;
  $('office').hidden = dormOn;
  $('dorm').hidden = !dormOn;
  $('dormTools').hidden = !dormOn;
  $('stageHint').textContent = dormOn
    ? 'drag to pan · wheel to zoom · double-click to fit · search to find a specific bed'
    : 'drag to pan · wheel to zoom · double-click to fit · click a person to inspect';
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('on', tab.dataset.room === room);
  // the hidden canvas never got its size, so re-fit as it becomes visible
  dorm.iso.resize();
  office.iso.resize();
  markDirty();
}

const CHIP = {
  booting: ['starting up', '#8ab4ff'], walking: ['walking in', '#8ab4ff'], idle: ['standing by', '#9aa7b8'],
  thinking: ['thinking', '#ffd166'], working: ['working', '#4de1c1'], blocked: ['needs you', '#ff8fa3'],
  error: ['hit a problem', '#ff5e7a'], done: ['finished', '#7ce4a8'], coffee: ['on a break', '#c8a276'], leaving: ['leaving', '#9aa7b8'],
};

// Where a session came from, in words a person already knows.
const ORIGIN = {
  claude: 'started by this page',
  'claude-hook': 'started in your editor or terminal',
  external: 'sent from another app',
};

// The server scrubs harness frames before it stores anything, but a row written by an
// older build can still be wearing its wire format. Nothing reaches the page raw twice.
const TAGS = /<\/?[a-zA-Z_][A-Za-z0-9_.:-]*(?:\s[^<>]{0,200})?\/?>/g;

function readable(s) {
  return String(s == null ? '' : s)
    .replace(TAGS, ' ')
    // A session id is a handle for the machine, never a fact for a person.
    .replace(/\bsession\s+[0-9a-f]{6,}\b/gi, 'session')
    // A model's answer arrives in markdown. A person reads the words, not the asterisks.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cut on a space, never inside a word — `pytest-q -p --no-cacheprovided…` is unreadable.
function clipWords(s, n) {
  const t = readable(s);
  if (t.length <= n) return t;
  const window = t.slice(0, n + 1);
  const space = window.lastIndexOf(' ');
  return `${(space > n * 0.5 ? window.slice(0, space) : window.trimEnd().slice(0, n - 1)).trimEnd()}…`;
}

const GROUPS = ['Needs you', 'Working', 'Standing by', 'Finished'];
function groupRank(a) {
  if (a.state === 'blocked') return 0;
  if (['booting', 'walking', 'thinking', 'working', 'coffee'].includes(a.state)) return 1;
  return a.state === 'idle' ? 2 : 3;
}

function render() {
  const list = [...agents.values()].sort((a, b) => groupRank(a) - groupRank(b) || a.startedAt - b.startedAt);
  office.sync(list);
  dorm.roster();

  $('crewCount').textContent = String(list.length);
  $('tabOfficeN').textContent = String(list.length);
  $('tabDormN').textContent = inventory?.known ? String(dorm.roster().length) : '—';
  $('empty').hidden = list.length > 0;
  $('crewHint').hidden = list.length === 0;
  renderSetup(list.length);
  const roster = $('roster');
  const kids = [];
  let lastRank = -1;
  for (const a of list) {
    const r = groupRank(a);
    if (r !== lastRank) { kids.push(el('li', 'group', GROUPS[r])); lastRank = r; }
    kids.push(row(a));
  }
  roster.replaceChildren(...kids);

  const badge = $('feedBadge');
  if (!health) { badge.className = 'badge neutral'; badge.textContent = 'connecting'; }
  else if (health.claude.found) { badge.className = 'badge real'; badge.textContent = 'real claude feed'; }
  else { badge.className = 'badge off'; badge.textContent = 'feed offline'; }

  const tools = list.reduce((n, a) => n + (a.toolCalls || 0), 0);
  const tok = list.reduce((n, a) => n + (a.tokensIn || 0) + (a.tokensOut || 0), 0);
  const cost = list.reduce((n, a) => n + (a.costUsd || 0), 0);
  // Zeros are left out: a hooked session reports no token count, and "0 tokens" reads
  // as a broken meter rather than as "not measured".
  const bits = [`${list.length} ${list.length === 1 ? 'person' : 'people'} on the floor`];
  if (tools) bits.push(`${tools} ${tools === 1 ? 'thing' : 'things'} done`);
  if (tok) bits.push(`${fmt(tok)} tokens of memory used`);
  if (cost) bits.push(`$${cost.toFixed(2)} spent`);
  if (inventory?.known) bits.push(`upstairs: ${inventory.counts.agents} helpers and ${inventory.counts.skills} skills asleep`);
  $('totals').textContent = bits.join(' · ');

  renderFeed();
  renderDetail(list);
  renderAsks();
  renderFinished();
}

// ---------------------------------------------------------------- approvals --

let lastOpenAsks = 0;
// The ids and deadlines of the rows on screen. Rows are rebuilt only when this changes,
// so ticked options and typed answers survive the agent events that re-render the page.
let askKey = '';

function renderAsks() {
  const open = asks.open || [];
  const card = $('askCard');
  card.hidden = open.length === 0;
  $('askCount').textContent = String(open.length);
  $('askWindow').textContent = String(Math.round((asks.windowMs || 50000) / 1000));
  const key = open.map((a) => `${a.id}:${a.expiresAt}`).join(',');
  if (key !== askKey) {
    askKey = key;
    $('askList').replaceChildren(...open.map(askRow));
  }
  document.body.classList.toggle('needs-you', open.length > 0);

  // The top bar stays on screen even when the panel has scrolled away, so the count
  // lives there too. A card nobody can reach is not an approval flow.
  const chip = $('needsYou');
  chip.hidden = open.length === 0;
  chip.textContent = `${open.length} ${open.length === 1 ? 'person is' : 'people are'} waiting on you`;
  if (open.length > lastOpenAsks) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  lastOpenAsks = open.length;
}

function askRow(ask) {
  const li = el('li', 'askitem');
  li.style.borderLeftColor = ask.color || '#FF8FA3';
  const head = el('div', 'askhead');
  head.append(el('span', 'wname', ask.agentName || 'an agent'));
  head.append(el('span', 'chip', ask.kind === 'question' ? 'a question' : 'wants to act'));
  li.append(head);
  li.append(el('div', 'askline', ask.summary || `It wants to use ${ask.tool}`));
  if (ask.detail) {
    const pre = el('div', 'askdetail');
    pre.textContent = ask.detail;
    li.append(pre);
  }
  if (ask.folder) li.append(el('div', 'meta', ask.folder));

  const btns = el('div', 'askbtns');
  if (ask.kind === 'question') {
    const send = el('button', 'mini answer allow', 'Send answers');
    for (const q of ask.questions || []) {
      if (q.header) li.append(el('span', 'qhead', q.header));
      li.append(el('div', 'qtext', q.question));
      const opts = el('div', 'qopts');
      for (const o of q.options || []) {
        const lab = el('label', 'qopt');
        const inp = document.createElement('input');
        inp.type = q.multiSelect ? 'checkbox' : 'radio';
        inp.name = `q${ask.id}-${q.index}`;
        inp.value = o.label;
        const b = el('b', '', o.label);
        lab.append(inp, b);
        if (o.hint) lab.append(el('span', 'qhint', o.hint));
        opts.append(lab);
      }
      const other = document.createElement('input');
      other.type = 'text';
      other.className = 'qother';
      other.maxLength = 300;
      other.placeholder = 'Or type your own answer';
      opts.append(other);
      opts.addEventListener('change', (e) => {
        if (e.target !== other && e.target.checked) other.value = '';
      });
      other.addEventListener('input', () => {
        if (other.value) for (const c of opts.querySelectorAll('.qopt input')) c.checked = false;
      });
      opts._pics = [];
      opts._busy = 0;
      opts.append(picsBox(opts, ask, li));
      li.append(opts);
    }
    li.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.items || [])]
        .filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean);
      if (!files.length) return;
      e.preventDefault();
      const blocks = [...li.querySelectorAll('.qopts')];
      const target = blocks.find((b) => b.contains(document.activeElement)) || blocks[0];
      if (target) target._addFiles(files);
    });
    const refresh = () => { send.disabled = !collect(li, ask); };
    li.addEventListener('change', refresh);
    li.addEventListener('input', refresh);
    send.onclick = () => {
      const answers = collect(li, ask);
      if (!answers) return;
      const images = {};
      const groups = li.querySelectorAll('.qopts');
      for (const q of ask.questions || []) {
        const ids = (groups[q.index]?._pics || []).map((p) => p.imageId);
        if (ids.length) images[q.question] = ids;
      }
      answerAsk(ask.id, { decision: 'allow', answers, ...(Object.keys(images).length ? { images } : {}) });
    };
    send.disabled = true;
    btns.append(send);
    const inTerminal = el('button', 'mini ghost', 'Answer in the terminal');
    inTerminal.onclick = () => answerAsk(ask.id, { decision: 'allow' });
    btns.append(inTerminal);
  } else {
    const allow = el('button', 'mini answer allow', 'Yes, do it');
    allow.onclick = () => answerAsk(ask.id, { decision: 'allow' });
    const always = el('button', 'mini answer', `Yes, and stop asking about ${ask.tool}`);
    always.onclick = () => answerAsk(ask.id, { decision: 'allow', remember: true });
    const deny = el('button', 'mini answer deny', 'No');
    deny.onclick = () => answerAsk(ask.id, { decision: 'deny', reason: `You said no to the ${ask.tool} call from the office page.` });
    btns.append(allow, always, deny);
  }
  li.append(btns);

  const wait = el('div', 'askwait');
  li.append(wait);
  li.dataset.expires = String(ask.expiresAt);
  tickCountdown(li, ask.expiresAt);
  return li;
}

// The answers typed or ticked on a question card, or null while any question is open.
function collect(li, ask) {
  const answers = {};
  const groups = li.querySelectorAll('.qopts');
  for (const q of ask.questions || []) {
    const box = groups[q.index];
    if (!box) return null;
    const picked = [...box.querySelectorAll('.qopt input:checked')].map((c) => c.value);
    const typed = box.querySelector('.qother').value.trim();
    if (box._busy > 0) return null;
    if (typed) answers[q.question] = typed;
    else if (picked.length) answers[q.question] = q.multiSelect ? picked : picked[0];
    else if (!(box._pics || []).length) return null;
  }
  return answers;
}

// Picture attachments for one question block. State lives on the block: _pics and _busy.
const PIC_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const PIC_HINT = 'Pictures must be PNG, JPEG, GIF or WebP, up to 5 MB, 3 per question';

function picsBox(block, ask, li) {
  const box = el('div', 'qpics');
  const btn = el('button', 'mini ghost', 'Attach image');
  btn.type = 'button';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = PIC_TYPES.join(',');
  input.multiple = true;
  input.hidden = true;
  const hint = el('div', 'meta', PIC_HINT);
  const err = el('p', 'qerr');
  err.hidden = true;
  const thumbs = el('div', 'qthumbs');
  box.append(btn, input, hint, err, thumbs);
  const changed = () => li.dispatchEvent(new Event('change'));
  const fail = (msg) => { err.textContent = msg; err.hidden = !msg; };

  async function upload(file) {
    const holder = el('div', 'qthumb', 'Uploading…');
    thumbs.append(holder);
    block._busy++;
    changed();
    try {
      const data = await new Promise((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(String(rd.result).replace(/^data:[^,]*;base64,/, ''));
        rd.onerror = () => reject(new Error('Could not read that file'));
        rd.readAsDataURL(file);
      });
      const r = await fetch('/api/ask-image', post({ askId: ask.id, name: file.name, data }));
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.imageId) throw new Error(j.error || String(r.status));
      const pic = { imageId: j.imageId, name: file.name, url: URL.createObjectURL(file) };
      block._pics.push(pic);
      holder.textContent = '';
      const img = document.createElement('img');
      img.src = pic.url;
      img.alt = pic.name;
      const x = el('button', 'qx', '×');
      x.type = 'button';
      x.title = 'Remove';
      x.onclick = () => {
        block._pics = block._pics.filter((p) => p !== pic);
        URL.revokeObjectURL(pic.url);
        holder.remove();
        fail('');
        changed();
      };
      holder.append(img, x, el('span', 'qname', pic.name));
    } catch (e) {
      holder.remove();
      fail(e.message);
    } finally {
      block._busy--;
      changed();
    }
  }

  block._addFiles = (files) => {
    fail('');
    for (const f of files) {
      if (!PIC_TYPES.includes(f.type)) { fail('That is not a picture'); continue; }
      if (block._pics.length + block._busy >= 3) { fail('3 pictures at most for one question'); break; }
      upload(f);
    }
  };
  btn.onclick = () => input.click();
  input.onchange = () => { block._addFiles([...input.files]); input.value = ''; };
  block.addEventListener('dragover', (e) => {
    e.preventDefault();
    box.classList.add('drop');
    hint.textContent = 'Drop a picture here';
  });
  const endDrag = () => { box.classList.remove('drop'); hint.textContent = PIC_HINT; };
  block.addEventListener('dragleave', (e) => { if (!block.contains(e.relatedTarget)) endDrag(); });
  block.addEventListener('drop', (e) => {
    e.preventDefault();
    endDrag();
    block._addFiles([...(e.dataTransfer?.files || [])]);
  });
  return box;
}

function tickCountdown(li, expiresAt) {
  const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  const node = li.querySelector('.askwait');
  if (!node) return;
  node.textContent = left > 0
    ? `You have ${left} seconds to answer here — after that it asks you in the terminal`
    : 'timed out — it is asking in the terminal now';
}

function tickAllCountdowns() {
  for (const li of $('askList').children) tickCountdown(li, Number(li.dataset.expires || 0));
}

async function answerAsk(id, payload) {
  for (const li of $('askList').children) li.style.opacity = '0.55';
  try {
    const r = await fetch('/api/ask', post({ askId: id, ...payload }));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) banner(`That answer did not go through: ${j.error || r.status}`, 'bad');
  } catch (err) {
    banner(`Could not reach the office server: ${err.message}`, 'bad');
  }
  refreshAsks();
}

// ----------------------------------------------------------------- finished --

const FINISHED = {
  finished: ['finished', '#7CE4A8'],
  closed: ['wrapped up', '#7CE4A8'],
  error: ['ran into a problem', '#FF5E7A'],
  stopped: ['you stopped it', '#FFB454'],
  quiet: ['went quiet', '#9AA7B8'],
};

let finishedOpen = true;

// A folder named after a session hash is still a handle, not a name to read.
const SESSION_ID = /^[0-9a-f]{8,40}$/i;

function humanName(item) {
  if (item.name && !SESSION_ID.test(item.name)) return item.name;
  if (item.folder && !SESSION_ID.test(item.folder)) return item.folder;
  return 'a Claude session';
}

function renderFinished() {
  const items = shelf.items || [];
  $('finishedCount').textContent = String(items.length);
  $('finishedEmpty').hidden = items.length > 0;
  $('finishedList').hidden = !finishedOpen;
  $('finishedList').replaceChildren(...(finishedOpen ? items.slice(0, 12).map(finishedRow) : []));
}

function finishedRow(item) {
  const li = el('li', 'finitem');
  const [label, color] = FINISHED[item.outcome] || FINISHED.finished;
  li.style.borderLeftColor = color;

  const head = el('div', 'who');
  const dot = el('span', 'wdot');
  dot.style.background = color;
  head.append(dot, el('span', 'wname', humanName(item)));
  head.append(el('span', 'chip', label));
  li.append(head);

  li.append(el('div', 'act', finishedSentence(item, color)));
  if (item.prompt) {
    const ask = el('div', 'ask', `“${clipWords(item.prompt, 120)}”`);
    ask.title = readable(item.prompt);
    li.append(ask);
  }
  if (item.report) {
    const rep = el('div', 'report');
    rep.textContent = clipWords(item.report, 300);
    rep.title = readable(item.report);
    li.append(rep);
  } else if (item.source === 'claude-hook') {
    // The words it typed back stayed in the terminal; only its actions reached the office.
    li.append(el('div', 'report', 'What it typed back to you stayed in your terminal. This is what it actually did.'));
  }
  if (item.problem) li.append(el('div', 'meta', `The problem: ${clipWords(item.problem, 160)}`));
  if (item.helpers?.length || item.skills?.length) {
    const bits = [];
    if (item.helpers?.length) bits.push(`the ${uniq(item.helpers).join(', ')} ${item.helpers.length === 1 ? 'helper' : 'helpers'}`);
    if (item.skills?.length) bits.push(`the ${uniq(item.skills).join(', ')} ${item.skills.length === 1 ? 'skill' : 'skills'}`);
    li.append(el('div', 'helping', `It had help from ${bits.join(' and ')}.`));
  }
  li.append(el('div', 'meta', finishedStats(item)));
  li.onclick = () => {
    const live = [...agents.values()].find((a) => (a.sessionId || a.id) === item.key);
    if (live) { selected = live.id; office.selected = live.id; markDirty(); }
  };
  return li;
}

// Written the way you would say it to someone standing next to you.
function finishedSentence(item) {
  const where = item.folder && !SESSION_ID.test(item.folder) ? `the ${readable(item.folder)} folder` : 'its folder';
  if (item.outcome === 'error') return `It stopped in ${where} after running into a problem.`;
  if (item.outcome === 'stopped') return `You stopped it while it was working in ${where}.`;
  if (item.outcome === 'quiet') return `It went quiet in ${where} and was tidied away.`;
  if (item.outcome === 'closed') return `It finished its work in ${where} and closed.`;
  return `It finished the work it was doing in ${where}.`;
}

function finishedStats(item) {
  const bits = [ago(item.finishedAt)];
  if (item.durationMs) bits.push(`took ${spoken(Math.max(1000, item.durationMs))}`);
  if (item.toolCalls) bits.push(`${item.toolCalls} ${item.toolCalls === 1 ? 'thing' : 'things'} done`);
  if (item.turns) bits.push(`${item.turns} ${item.turns === 1 ? 'round' : 'rounds'} of work`);
  if (item.todoTotal) bits.push(`${item.todoDone} of ${item.todoTotal} planned steps done`);
  if (item.costUsd) bits.push(`$${item.costUsd.toFixed(item.costUsd < 1 ? 3 : 2)} spent`);
  if (item.tokens) bits.push(`${fmt(item.tokens)} tokens used`);
  return bits.filter(Boolean).join(' · ');
}

function ago(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function row(a) {
  const li = el('li');
  const [label, color] = CHIP[a.state] || CHIP.idle;
  li.style.borderLeftColor = color;
  if (selected === a.id) li.classList.add('sel');

  const who = el('div', 'who');
  const left = el('div', 'who');
  const dot = el('span', 'wdot');
  dot.style.background = color;
  left.append(dot, el('span', 'wname', a.name));
  const chip = el('span', 'chip', label);
  chip.style.color = color;
  who.append(left, chip);
  li.append(who);
  li.append(el('div', 'act', readable(a.activity) || 'no news yet'));

  if (a.prompt) {
    const ask = el('div', 'ask', `You asked: “${clipWords(a.prompt, 110)}”`);
    ask.title = readable(a.prompt);
    li.append(ask);
  }

  // Where it came from (or whose helper it is), what it has done, and who is helping it.
  const facts = [a.parent ? `helper working for ${boss(a) || 'another agent'}` : (ORIGIN[a.source] || 'came from somewhere else')];
  const stats = plainStats(a);
  if (stats) facts.push(stats);
  if (!a.parent) {
    const live = [...agents.values()].filter((x) => x.parent === a.id && !['done', 'error'].includes(x.state)).length;
    if (live) facts.push(`${live} ${live === 1 ? 'helper' : 'helpers'} working`);
  }
  li.append(el('div', 'facts', facts.join(' · ')));

  if (a.todoTotal > 0) {
    const meter = el('div', 'meter');
    const bar = el('i');
    bar.style.width = `${Math.round((a.todoDone / a.todoTotal) * 100)}%`;
    bar.style.background = color;
    meter.append(bar);
    li.append(meter);
    li.append(el('div', 'steps', `${a.todoDone} of ${a.todoTotal} steps done`));
  }

  if (!a.parent) {
    const helping = helperLine(a);
    if (helping) li.append(el('div', 'helping', helping));
  }

  // Only a session that owns its own Claude Code process can be asked here: a helper
  // avatar shares its parent's session, so the switch belongs to the parent's card.
  if (!a.parent && ['claude', 'claude-hook'].includes(a.source) && a.state !== 'done') {
    const armed = (asks.armed || []).includes(a.sessionId || a.id);
    const title = 'Questions Claude asks you, and requests to write files or run commands, show up on this page instead of the terminal. You have 50 seconds to answer; after that the terminal asks as usual.';
    const armrow = el('div', 'armrow');
    armrow.title = title;
    const t = el('button', 'armswitch');
    t.type = 'button';
    t.setAttribute('role', 'switch');
    t.setAttribute('aria-checked', armed ? 'true' : 'false');
    t.append(el('i'), el('span', null, 'Ask me here, not in the terminal'));
    t.onclick = (e) => {
      e.stopPropagation();
      fetch('/api/arming', post({ agentId: a.id, on: !armed })).then(() => refreshAsks()).catch(() => {});
    };
    armrow.append(t, el('p', 'armstate' + (armed ? ' on' : ''), armed
      ? 'On — its questions and permission requests appear here.'
      : 'Off — it asks in your terminal or editor.'));
    li.append(armrow);
  }

  const actions = el('div', 'mini');
  actions.style.marginTop = '9px';
  const d = el('button', 'mini', 'Hide card');
  d.title = 'Takes this card off the page. The session keeps running and is not stopped. It stays hidden for 10 minutes.';
  d.onclick = (e) => { e.stopPropagation(); agents.delete(a.id); fetch('/api/dismiss', post({ agentId: a.id })); markDirty(); };
  actions.append(d);
  if (a.source === 'claude' && !a.parent && !['done', 'error'].includes(a.state)) {
    const b = el('button', 'mini stop', 'Stop run');
    b.title = 'Ends this run now. It cannot be resumed.';
    b.style.marginLeft = 'auto';
    b.onclick = (e) => { e.stopPropagation(); fetch('/api/stop', post({ agentId: a.id })); };
    actions.append(b);
  }
  li.append(actions);

  li.onclick = () => { selected = a.id; office.selected = a.id; markDirty(); };
  return li;
}

function post(body) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

// One readable sentence instead of a row of abbreviations. Anything that is zero, or
// that the feed cannot measure, is left out rather than shown as a misleading figure.
function plainStats(a) {
  const bits = [];
  if (a.toolCalls) bits.push(`did ${a.toolCalls} ${a.toolCalls === 1 ? 'thing' : 'things'}`);
  if (a.turns) bits.push(`${a.turns} ${a.turns === 1 ? 'round' : 'rounds'} of work`);
  const tok = (a.tokensIn || 0) + (a.tokensOut || 0);
  if (tok) bits.push(`${fmt(tok)} tokens used`);
  if (a.costUsd) bits.push(`$${a.costUsd.toFixed(2)} spent`);
  const ms = (a.endedAt || Date.now()) - (a.startedAt || Date.now());
  if (ms > 0) bits.push(a.endedAt ? `took ${spoken(Math.max(ms, 1000))}` : `${spoken(ms)} so far`);
  return bits.join(' · ');
}

// Who is helping whom, in the words a person would use out loud.
function helperLine(a) {
  const helpers = uniq((a.agentsUsed || []).map((x) => x.name));
  const skills = uniq((a.skillsUsed || []).map((x) => x.name));
  const parts = [];
  if (helpers.length) parts.push(`being helped by ${helpers.length === 1 ? `the ${helpers[0]} helper` : `the ${helpers.join(' and ')} helpers`}`);
  if (skills.length) parts.push(`using the ${skills.join(' and ')} ${skills.length === 1 ? 'skill' : 'skills'}`);
  return parts.length ? `It is ${parts.join(' and ')}.` : null;
}

function uniq(list) {
  const out = [];
  for (const x of list) if (!out.includes(x)) out.push(x);
  return out;
}

function spoken(ms) {
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} seconds`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  return `${Math.floor(m / 60)} hour${m < 120 ? '' : 's'}`;
}

function fmt(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n | 0);
}

function clip(s, n) {
  s = String(s || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function renderFeed() {
  const ul = $('feed');
  const items = feedItems.slice(0, 70);
  const names = new Set(items.map((f) => f.agentName || ''));
  const single = names.size <= 1;
  ul.replaceChildren(...items.map((f, i) => {
    const showHead = !single && (i === 0 || (f.agentName || '') !== (items[i - 1].agentName || ''));
    const li = el('li', (f.tone || 'info') + (showHead ? '' : ' cont'));
    const text = el('p', 't', readable(f.text) || '');
    if (!showHead) { li.append(text); return li; }
    const head = el('div', 'head');
    const who = el('b', 'who', f.agentName || 'system');
    if (f.color) who.style.color = f.color;
    head.append(who);
    li.append(head, text);
    return li;
  }));
}

function renderDetail(list) {
  const box = $('detail');
  const a = list.find((x) => x.id === selected);
  if (!a) { box.hidden = true; return; }
  box.hidden = false;
  $('detailName').textContent = a.name;
  $('detailLede').textContent = headline(a);
  const [label, color] = CHIP[a.state] || CHIP.idle;
  const stats = [
    ['right now', label],
    ['where it came from', ORIGIN[a.source] || 'somewhere else'],
    ['which model', a.model || 'the default model'],
    ['what it is doing', readable(a.activity) || 'nothing reported yet'],
    ['working folder', a.cwd || '—'],
    ['rounds of work', a.turns ? String(a.turns) : '—'],
    ['things it did', a.toolCalls ? String(a.toolCalls) : '—'],
    ['time on the floor', a.durationMs != null ? spoken(a.durationMs) : `${spoken(Math.max((a.endedAt || Date.now()) - (a.startedAt || Date.now()), 1000))} (still going)`],
    ['time spent thinking', a.apiMs != null ? `${spoken(a.apiMs)} of ${spoken(a.durationMs || a.apiMs)}` : '—'],
    ['memory used', (a.tokensIn || a.tokensOut) ? `${fmt(a.tokensIn)} in / ${fmt(a.tokensOut)} out` : '—'],
    ['money spent', a.costUsd ? `$${a.costUsd.toFixed(4)}` : '—'],
    ['its plan', a.todoTotal ? `${a.todoDone} of ${a.todoTotal} steps done` : 'it has not made one'],
    ['helpers it could call', a.hadAgents ? `${a.hadAgents} agents / ${a.hadSkills} skills / ${a.hadTools} tools` : '—'],
  ];
  const dl = $('detailStats');
  dl.replaceChildren(...stats.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, String(v))]));
  dl.children[1].style.color = color;
  renderExtra(a);
  $('detailLog').textContent = (a.log || [])
    .map((l) => readable(l.human || l.text))
    .join('\n') || 'nothing reported yet';
  $('detailLog').scrollTop = $('detailLog').scrollHeight;
}

// The sentence a person reads first: what this agent is, where it is, and how it is going.
// Everything below it is evidence for that one line.
function headline(a) {
  const where = a.cwd ? readable(shortFolder(a.cwd)) : null;
  const doing = readable(a.activity) || 'no news yet';
  const parts = [];
  if (a.parent) parts.push(`It is a helper${boss(a) ? ` working for ${boss(a)}` : ' working for another agent'}.`);
  parts.push(`${CHIP[a.state] ? capitalise(CHIP[a.state][0]) : 'Standing by'}${where ? ` — working in the ${where} folder` : ''}.`);
  parts.push(`Right now: ${lowerFirstCopy(doing)}.`);
  if (a.prompt) parts.push(`It was asked to “${clipWords(a.prompt, 90)}”.`);
  const helping = helperLine(a);
  if (helping) parts.push(helping);
  const ms = (a.endedAt || Date.now()) - (a.startedAt || Date.now());
  const tally = [];
  if (a.toolCalls) tally.push(`it has done ${a.toolCalls} ${a.toolCalls === 1 ? 'thing' : 'things'}`);
  if (a.todoTotal) tally.push(`${a.todoDone} of ${a.todoTotal} planned steps are done`);
  if (ms > 0) tally.push(a.endedAt ? `it took ${spoken(Math.max(ms, 1000))}` : `it has been going ${spoken(ms)}`);
  if (tally.length) parts.push(`So far, ${tally.join(', ')}.`);
  if (a.state === 'blocked') parts.push(`It is waiting for you — answer it on the right.`);
  return parts.join(' ');
}

// The agent a helper works for, by the name the person sees on its row.
function boss(a) {
  return a.parent ? agents.get(a.parent)?.name : null;
}

function shortFolder(cwd) {
  const parts = String(cwd || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function capitalise(s) {
  return String(s || '').replace(/^./, (c) => c.toUpperCase());
}

function lowerFirstCopy(s) {
  return String(s || '').replace(/^([A-Z][a-z])/, (m) => m.toLowerCase());
}

// The detail panel is rebuilt on every agent:update, so anything the user asks
// for lives here and gets re-painted from state.
const sharpened = new Map();

function promptBlock(a) {
  const wrap = el('div', 'promptcard');
  wrap.append(el('div', 'subhead', a.parent ? 'the job it was given' : 'what it was asked to do'));
  if (!a.prompt) {
    wrap.append(el('p', 'empty', 'Nobody reported the request in words.'));
    return wrap;
  }
  const st = sharpened.get(a.id);
  const original = el('p', 'prose' + (st && st.to ? ' dim' : ''), readable(a.prompt));
  wrap.append(original);

  const copy = el('button', 'mini', 'Copy to composer');
  copy.onclick = () => {
    $('prompt').value = a.prompt;
    $('prompt').focus();
    $('prompt').select();
  };
  const rewrite = el('button', 'mini', st && st.pending ? 'Rewriting…' : 'Sharpen this prompt');
  rewrite.disabled = Boolean(st && st.pending);
  rewrite.onclick = async () => {
    sharpened.set(a.id, { pending: true });
    markDirty();
    try {
      const improved = await sharpenPrompt(a.prompt, a.cwd || undefined);
      sharpened.set(a.id, { to: improved });
    } catch (err) {
      sharpened.set(a.id, { error: err.message });
      banner(`Sharpen failed: ${err.message}`, 'bad');
    }
    markDirty();
  };
  const bar = el('div', 'mini');
  bar.append(copy, rewrite);
  wrap.append(bar);

  if (st && st.to) {
    wrap.append(el('div', 'subhead', 'SHARPENED VERSION'));
    wrap.append(el('p', 'prose better', st.to));
    const use = el('button', 'mini', 'Use this wording');
    use.onclick = () => {
      $('prompt').value = st.to;
      $('prompt').focus();
    };
    const useBar = el('div', 'mini');
    useBar.append(use);
    wrap.append(useBar);
  }
  return wrap;
}

function init2() {}

function secs(ms) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function renderExtra(a) {
  const host = $('detailExtra');
  host.replaceChildren();
  host.append(promptBlock(a));

  const cast = [
    ...(a.skillsUsed || []).map((s) => ['skill', s.name, s.failed]),
    ...(a.agentsUsed || []).map((s) => ['agent', s.name, false]),
  ];
  if (cast.length) {
    host.append(el('div', 'subhead', 'CALLED IN'));
    const ul = el('ul', 'cast');
    for (const [kind, name, failed] of cast.slice(-8).reverse()) {
      const li = el('li');
      li.append(el('span', `tagsrc ${kind}`, kind.toUpperCase()), el('b', null, name));
      if (failed) li.append(el('span', 'fail', 'call failed'));
      ul.append(li);
    }
    host.append(ul);
  }

  const stats = (a.toolStats || []).filter((s) => s.calls);
  if (stats.length) {
    host.append(el('div', 'subhead', 'HOW LONG EACH THING TOOK'));
    const table = el('table', 'ledger');
    const head = el('tr');
    head.append(el('th', null, 'the thing'), el('th', null, 'times'), el('th', null, 'total time'), el('th', null, 'slowest'));
    table.append(head);
    const max = Math.max(...stats.map((s) => s.ms), 1);
    for (const s of stats) {
      const tr = el('tr');
      const name = el('td');
      name.append(el('span', null, s.tool));
      if (s.errors) name.append(el('span', 'meta', ` · ${s.errors} err`));
      const bar = el('i', 'bar');
      bar.style.width = `${Math.max(6, (s.ms / max) * 100)}%`;
      name.append(bar);
      tr.append(name, el('td', 'n', String(s.calls)), el('td', 'n', secs(s.ms)), el('td', 'n', secs(s.maxMs)));
      table.append(tr);
    }
    host.append(table);
  }

  const byModel = a.byModel || [];
  if (byModel.length) {
    host.append(el('div', 'subhead', 'MODEL LEDGER'));
    const table = el('table', 'ledger');
    const head = el('tr');
    head.append(el('th', null, 'model'), el('th', null, 'in'), el('th', null, 'out'), el('th', null, 'cost'));
    table.append(head);
    for (const m of byModel) {
      const tr = el('tr');
      const cell = el('td');
      cell.append(el('span', null, m.model));
      if (m.thinkingTokens) cell.append(el('span', 'meta', ` · ${fmt(m.thinkingTokens)} thought`));
      if (m.cacheRead) cell.append(el('span', 'meta', ` · ${fmt(m.cacheRead)} cached`));
      tr.append(cell, el('td', 'n', fmt(m.inputTokens)), el('td', 'n', fmt(m.outputTokens)), el('td', 'n', `$${m.costUsd.toFixed(4)}`));
      table.append(tr);
    }
    host.append(table);
  } else if (a.source === 'claude') {
    host.append(el('div', 'subhead', 'MODEL LEDGER'), el('p', 'empty', 'appears when the run reports its result.'));
  }
}

init();
