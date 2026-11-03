// "Tell me when it's done": a desktop notification, a short chime and a flashing tab
// title, so nobody has to watch the page to know a session finished or needs them.
// Everything degrades: no permission still gives the chime, the title and an on-page note.

const KEY = 'office.alerts';
let on = false;
let audio = null;
let flashTimer = null;
let baseTitle = document.title;

try { on = localStorage.getItem(KEY) === '1'; } catch { /* private window */ }

export const alertsOn = () => on;
export const canNotify = () => 'Notification' in window;

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
  if (!document.hidden) return;
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
  if (canNotify() && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
    try { new Notification(title, { body, tag: `office-${title}`, silent: true }); } catch { /* ignore */ }
  }
}

const took = (ms) => {
  if (ms == null) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} seconds` : `${Math.round(s / 60)} minutes`;
};

// A finished run, as the Finished shelf stores it.
export function announceFinished(item, say) {
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
  const first = ask?.kind === 'question' ? ask.questions?.[0]?.question : '';
  if (first) {
    let q = String(first).trim();
    if (q.length > 80) q = `${q.slice(0, 80).replace(/\s+\S*$/, '')}…`;
    return alert(`Claude asks: ${q}`, 'Answer it on the Agent Office page.', { kind: 'bad', say });
  }
  alert('Claude needs your answer', 'It is waiting on you in the office.', { kind: 'bad', say });
}
