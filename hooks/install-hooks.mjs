// Installs (or removes) the Agent Office hook bridge in ~/.claude/settings.json.
//
//   node hooks/install-hooks.mjs             install
//   node hooks/install-hooks.mjs --uninstall
//
// It merges rather than replaces: every other setting and every hook you already have
// stays exactly as it was, and the file is backed up once before the first install.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(HERE, 'claude-office-bridge.sh');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const BACKUP = `${SETTINGS}.agent-office.bak`;

// Events the office listens for. "" matches every matcher value for that event.
const EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'SubagentStart', 'SubagentStop', 'PreCompact',
  'Notification', 'Stop', 'SessionEnd',
];

const uninstall = process.argv.includes('--uninstall');

if (!fs.existsSync(SETTINGS)) {
  console.error(`no settings file at ${SETTINGS} — start Claude Code once, then re-run`);
  process.exit(1);
}

const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
const hooks = (settings.hooks ??= {});
const isOurs = (group) => (group.hooks ?? []).some((h) => String(h.command ?? '').includes(BRIDGE));

function save(next) {
  const tmp = `${SETTINGS}.agent-office.tmp`;
  const mode = fs.statSync(SETTINGS).mode & 0o777;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode });
  fs.renameSync(tmp, SETTINGS);
}

if (uninstall) {
  let removed = 0;
  for (const event of Object.keys(hooks)) {
    const before = hooks[event].length;
    hooks[event] = hooks[event]
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((h) => !String(h.command ?? '').includes(BRIDGE)) }))
      .filter((group) => group.hooks.length > 0);
    removed += before - hooks[event].length;
    if (!hooks[event].length) delete hooks[event];
  }
  if (!Object.keys(hooks).length) delete settings.hooks;
  save(settings);
  console.log(`removed our hook groups from ${removed} event(s); other settings untouched`);
  process.exit(0);
}

if (!fs.existsSync(BRIDGE)) {
  console.error(`bridge script missing at ${BRIDGE}`);
  process.exit(1);
}
fs.chmodSync(BRIDGE, 0o755);
if (!fs.existsSync(BACKUP)) {
  fs.copyFileSync(SETTINGS, BACKUP);
  console.log(`backed up settings to ${BACKUP}`);
}

const added = [];
for (const event of EVENTS) {
  const existing = (hooks[event] ??= []).find(isOurs);
  if (existing) {
    existing.hooks = [
      { type: 'command', command: BRIDGE },
      ...(existing.hooks ?? []).filter((h) => !String(h.command ?? '').includes(BRIDGE)),
    ];
  } else {
    hooks[event] = [...hooks[event], { matcher: '', hooks: [{ type: 'command', command: BRIDGE }] }];
    added.push(event);
  }
}

save(settings);
const keptElsewhere = (hooks.Notification ?? []).filter((g) => !isOurs(g)).length;
console.log(`installed on ${EVENTS.length} events (${added.length} new, ${EVENTS.length - added.length} already present)`);
console.log(`pre-existing Notification groups left intact: ${keptElsewhere}`);
