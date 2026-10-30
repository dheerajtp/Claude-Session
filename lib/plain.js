// Machine text → one readable sentence.
//
// Claude Code's harness wraps some of what it feeds the model in XML frames and hands the
// whole block to the hooks. Shown as-is, the page prints `<agent-message from="a547034…">`
// where a person expects to read what happened. Everything that reaches the room, the
// ledger or an approval card goes through here first, so raw markup is never stored and
// never painted.

// The bridge caps every string, so the closing tag is usually gone by the time the
// office sees the frame — an unterminated match has to run to the end of the text.
const HAND_BACK = /<agent-message\s+[^>]*>([\s\S]*?)(?:<\/agent-message>|$)/gi;
const TASK_NOTIFY = /<task-notification>([\s\S]*?)(?:<\/task-notification>|$)/gi;
const TAG = /<\/?[a-zA-Z_][a-zA-Z0-9_.:-]*(?:\s[^<>]{0,200})?\/?>/g;
const IDs = /\b(?:toolu|tooluse|call|msg|req)_[a-z0-9]{6,}\b/gi;
const HEX = /\b[0-9a-f]{24,}\b/gi;

const HAND_BOILERPLATE = /^\s*\[?subagent hand-back\]?\s*[:.-]*\s*/i;
const REPORT_FOLLOWS = /the report follows\s*:/i;

// Returns { text, kind } — kind lets the caller choose its own lead-in words.
export function humanize(raw) {
  const source = String(raw == null ? '' : raw);
  let kind = 'plain';
  let out = source;

  out = out.replace(HAND_BACK, (_m, body) => {
    kind = 'helper';
    return ` ${cleanHandBack(body)} `;
  });

  out = out.replace(TASK_NOTIFY, (_m, body) => {
    if (kind === 'plain') kind = 'background';
    return ` ${backgroundLine(body)} `;
  });

  out = stripJunk(out);
  const text = out.trim();
  if (!text) return { text: null, kind };
  return { text, kind };
}

// The hand-back frame carries a long warning about whose words these are, then the report.
// A viewer needs the report and one clause of context, not the legal frame.
function cleanHandBack(body) {
  let text = String(body || '').replace(HAND_BOILERPLATE, ' ');
  const at = text.search(REPORT_FOLLOWS);
  if (at >= 0) text = text.slice(at).replace(REPORT_FOLLOWS, '');
  text = stripJunk(text);
  if (!text) return 'a helper finished its job and said nothing useful.';
  return `a helper finished and reported: ${lowerFirst(text)}`;
}

function backgroundLine(body) {
  const file = String(body || '').match(/<output-file>\s*([^\s<]+)\s*<\/output-file>/i);
  const status = String(body || '').match(/<status>\s*([^\s<]+)\s*<\/status>/i);
  const state = status?.[1] === 'completed' ? 'finished' : status?.[1] || 'came back';
  return `a job it left running in the background ${state}${file ? ` — its notes are in ${shortPath(file[1])}` : ''}.`;
}

function stripJunk(text) {
  return String(text || '')
    .replace(TAG, ' ')
    .replace(IDs, ' ')
    .replace(HEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lowerFirst(text) {
  return text.replace(/^([A-Z][a-z])/, (m) => m.toLowerCase());
}

// Truncate on a space, never inside a word: `pytest-q -p --no-cacheprovided…` is unreadable.
export function words(text, max) {
  const s = stripJunk(text);
  if (s.length <= max) return s;
  const window = s.slice(0, max + 1);
  const space = window.lastIndexOf(' ');
  const cut = space > max * 0.5 ? window.slice(0, space) : window.trimEnd().slice(0, max - 1);
  return `${cut.trimEnd()}…`;
}

function shortPath(p) {
  const parts = String(p).split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(p);
}
