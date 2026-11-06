// "Tell me when it's done": a desktop notification, a short chime and a flashing tab
// title, so nobody has to watch the page to know a session finished or needs them.
// Everything degrades: no permission still gives the chime, the title and an on-page note.

const KEY = 'office.alerts';
let on = false;
let audio = null;
let flashTimer = null;
let baseTitle = typeof document === 'undefined' ? '' : document.title;
const SEEN = 'office.seen';
const SIX_HOURS = 6 * 60 * 60 * 1000;
const announcedAsks = new Set();

try { on = localStorage.getItem(KEY) === '1'; } catch { /* private window */ }

if (on) armUnlock();

export const alertsOn = () => on;
export const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

export function popupState() {
  if (!canNotify() || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

// Creates/resumes the chime and asks for pop-up permission. Needs a user gesture to work.
export async function unlockAlerts() {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); } catch { /* silent is fine */ }
  let permission = popupState();
  if (permission === 'default') {
    try { permission = await Notification.requestPermission(); } catch { permission = 'denied'; }
  }
  return { permission };
}

function armUnlock() {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  const once = () => { unlockAlerts(); };
  for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, once, { once: true, capture: true });
}

export async function setAlerts(next) {
  on = next;
  try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* ignore */ }
  if (!next) return { permission: null };
  // Both need a click to start, which is why this runs from the button.
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); } catch { /* silent is fine */ }
  let permission = canNotify() ? Notification.permission : 'unsupported';
  if (permission === 'default') {
    try { permission = await Notification.requestPermission(); } catch { permission = 'denied'; }
  }
  return { permission };
}

function chime() {
  if (!audio || audio.state !== 'running') return;
  const t0 = audio.currentTime;
  [[660, 0], [880, 0.16]].forEach(([freq, at]) => {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.32);
    o.connect(g).connect(audio.destination);
    o.start(t0 + at);
    o.stop(t0 + at + 0.34);
  });
}

function flashTitle(text) {
  if (typeof document === 'undefined' || !document.hidden) return;
  clearInterval(flashTimer);
  baseTitle = baseTitle || document.title;
  let flip = false;
  flashTimer = setInterval(() => { document.title = (flip = !flip) ? text : baseTitle; }, 1000);
  const stop = () => {
    if (document.hidden) return;
    clearInterval(flashTimer);
    document.title = baseTitle;
    document.removeEventListener('visibilitychange', stop);
    window.removeEventListener('focus', stop);
  };
  document.addEventListener('visibilitychange', stop);
  window.addEventListener('focus', stop);
}

// `say` is the on-page fallback (the existing banner), so the message is never lost.
export function alert(title, body, { kind = 'ok', say } = {}) {
  if (!on) return;
  chime();
  flashTitle(`${kind === 'bad' ? '⚠' : '✅'} ${title}`);
  if (say) say(`${title} — ${body}`, kind === 'bad' ? 'bad' : 'ok');
  if (canNotify() && Notification.permission === 'granted' && (document.hidden || !document.hasFocus?.())) {
    try { new Notification(title, { body, tag: `office-${title}`, silent: true }); } catch { /* ignore */ }
  }
}

const readSeen = () => { try { return Number(localStorage.getItem(SEEN)) || null; } catch { return null; } };
const writeSeen = (ms) => {
  try {
    const cur = Number(localStorage.getItem(SEEN)) || 0;
    if (ms > cur) localStorage.setItem(SEEN, String(ms));
  } catch { /* ignore */ }
};

const took = (ms) => {
  if (ms == null) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} seconds` : `${Math.round(s / 60)} minutes`;
};

// A finished run, as the Finished shelf stores it.
export function announceFinished(item, say) {
  if (item?.finishedAt) writeSeen(item.finishedAt);
  if (!item || item.outcome === 'stopped') return; // the person stopped it themselves
  const what = item.folder || item.name || 'a session';
  const bits = [
    item.toolCalls ? `did ${item.toolCalls} ${item.toolCalls === 1 ? 'thing' : 'things'}` : '',
    took(item.durationMs) ? `took ${took(item.durationMs)}` : '',
  ].filter(Boolean).join(' · ');
  if (item.outcome === 'error') return alert(`${what} hit a problem`, item.problem || 'Open the office to see what went wrong.', { kind: 'bad', say });
  if (item.outcome === 'quiet') return alert(`${what} went quiet`, 'It stopped reporting — it may be stuck or closed.', { kind: 'bad', say });
  alert(`${what} finished`, bits || 'Its work is on the Finished shelf.', { say });
}

export function announceNeedsYou(say, ask) {
  if (ask?.id != null) announcedAsks.add(ask.id);
  const first = ask?.kind === 'question' ? ask.questions?.[0]?.question : '';
  if (first) {
    let q = String(first).trim();
    if (q.length > 80) q = `${q.slice(0, 80).replace(/\s+\S*$/, '')}…`;
    return alert(`Claude asks: ${q}`, 'Answer it on the Agent Office page.', { kind: 'bad', say });
  }
  alert('Claude needs your answer', 'It is waiting on you in the office.', { kind: 'bad', say });
}

// On (re)connect: tell the person about anything that finished or asked while the page was away.
export function catchUp({ history, asks } = {}, say) {
  if (!on) return;
  const now = Date.now();
  const seen = readSeen();
  if (seen == null) {
    try { localStorage.setItem(SEEN, String(now)); } catch { /* ignore */ }
  } else {
    const missed = (history?.items || []).filter((i) =>
      i && i.finishedAt > seen && i.outcome !== 'stopped' && i.finishedAt >= now - SIX_HOURS);
    if (missed.length === 1) announceFinished(missed[0], say);
    else if (missed.length > 1) {
      alert(`${missed.length} sessions finished while you were away`, 'Open the Finished shelf to read them.', { say });
    }
    if (missed.length) writeSeen(Math.max(...missed.map((i) => i.finishedAt)));
  }
  for (const ask of asks?.open || []) {
    if (ask.kind !== 'question' || announcedAsks.has(ask.id)) continue;
    announcedAsks.add(ask.id);
    announceNeedsYou(say, ask);
  }
}
