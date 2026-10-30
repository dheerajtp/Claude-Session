import { Office } from './world.js';
import { Dorm } from './dorm.js';

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

async function init() {
  try {
    health = await fetch('/api/health').then((r) => r.json());
    const snap = await fetch('/api/state').then((r) => r.json());
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
      refreshAsks();
      return;
    }
    if (msg.kind === 'run:finished') { refreshShelf(); markDirty(); }
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

function render() {
  const list = [...agents.values()].sort((a, b) => (a.state === 'done') - (b.state === 'done') || a.startedAt - b.startedAt);
  office.sync(list);
  dorm.roster();

  $('crewCount').textContent = String(list.length);
  $('tabOfficeN').textContent = String(list.length);
  $('tabDormN').textContent = inventory?.known ? String(dorm.roster().length) : '—';
  $('empty').hidden = list.length > 0;
  const roster = $('roster');
  roster.replaceChildren(...list.map(row));

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

function renderAsks() {
  const open = asks.open || [];
  const card = $('askCard');
  card.hidden = open.length === 0;
  $('askCount').textContent = String(open.length);
  $('askWindow').textContent = String(Math.round((asks.windowMs || 50000) / 1000));
  $('askList').replaceChildren(...open.map(askRow));
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
    for (const q of ask.questions || []) {
      for (const o of q.options || []) {
        const b = el('button', 'mini answer', o.label);
        b.title = o.hint || '';
        b.onclick = () => answerAsk(ask.id, { decision: 'allow', answers: { [q.question]: o.label } });
        btns.append(b);
      }
    }
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
  // Which machine the session came from, and whose sub-agent this is, in plain words.
  li.append(el('div', 'src', a.parent ? `helper working for ${boss(a) || 'another agent'}` : (ORIGIN[a.source] || 'came from somewhere else')));

  li.append(el('div', 'act', readable(a.activity) || 'no news yet'));

  if (a.prompt) {
    const ask = el('div', 'ask', `“${clipWords(a.prompt, 110)}”`);
    ask.title = readable(a.prompt);
    li.append(ask);
  }

  const meter = el('div', 'meter' + (a.todoTotal ? '' : ' unknown'));
  const bar = el('i');
  bar.style.width = a.todoTotal ? `${Math.round((a.todoDone / a.todoTotal) * 100)}%` : '34%';
  bar.style.background = color;
  meter.append(bar);
  li.append(meter);
  li.append(el('div', 'steps', a.todoTotal
    ? `${a.todoDone} of ${a.todoTotal} steps done`
    : 'It has not made a plan yet.'));

  const helping = helperLine(a);
  if (helping) li.append(el('div', 'helping', helping));

  li.append(el('div', 'meta', plainStats(a)));

  const actions = el('div', 'mini');
  actions.style.marginTop = '9px';
  if (a.source === 'claude' && !['done', 'error'].includes(a.state)) {
    const b = el('button', 'mini stop', 'Stop');
    b.onclick = (e) => { e.stopPropagation(); fetch('/api/stop', post({ agentId: a.id })); };
    actions.append(b);
  }
  // Only a session that owns its own Claude Code process can be asked here: a helper
  // avatar shares its parent's session, so arming belongs to the parent's card.
  if (!a.parent && ['claude', 'claude-hook'].includes(a.source) && a.state !== 'done') {
    const armed = (asks.armed || []).includes(a.sessionId || a.id);
    const t = el('button', 'mini route' + (armed ? ' armed' : ''), armed ? 'Approvals here ✓' : 'Route approvals here');
    t.title = armed
      ? 'While it is working, this agent asks the office before it writes or runs anything. Click again to send those questions back to the terminal.'
      : 'Let the office answer this agent’s questions before it writes or runs anything, instead of the terminal.';
    t.onclick = (e) => {
      e.stopPropagation();
      fetch('/api/arming', post({ agentId: a.id, on: !armed })).then(() => refreshAsks()).catch(() => {});
    };
    actions.append(t);
  }
  const d = el('button', 'mini', 'Dismiss');
  d.onclick = (e) => { e.stopPropagation(); agents.delete(a.id); fetch('/api/dismiss', post({ agentId: a.id })); markDirty(); };
  actions.append(d);
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
  ul.replaceChildren(...feedItems.slice(0, 70).map((f) => {
    const li = el('li', f.tone || 'info');
    const head = el('div', 'head');
    const who = el('b', 'who', f.agentName || 'system');
    if (f.color) who.style.color = f.color;
    head.append(who);
    // Who on the first line, the plain sentence across the full width. The feed is
    // already in order, so a timestamp adds noise rather than information.
    li.append(head, el('p', 't', readable(f.text) || ''));
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
