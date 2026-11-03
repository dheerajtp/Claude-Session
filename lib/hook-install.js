// Detects, installs and removes the Agent Office hook bridge in ~/.claude/settings.json.
// Shared by the CLI (hooks/install-hooks.mjs) and the server routes. Returns data, never exits or logs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BRIDGE = path.join(HERE, '..', 'hooks', 'claude-office-bridge.sh');

// Events the office listens for. "" matches every matcher value for that event.
export const EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'SubagentStart', 'SubagentStop', 'PreCompact',
  'Notification', 'Stop', 'SessionEnd',
];

const defaultPath = () => path.join(os.homedir(), '.claude', 'settings.json');
const has = (name) => spawnSync('which', [name], { stdio: 'ignore' }).status === 0;
const fail = (code, message) => Object.assign(new Error(message), { code });
const cmdOf = (h) => String(h?.command ?? '');
const isOurs = (group) => (group?.hooks ?? []).some((h) => cmdOf(h).includes(BRIDGE));

function load(settingsPath) {
  if (!fs.existsSync(settingsPath)) throw fail('NO_SETTINGS', `no settings file at ${settingsPath}`);
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw fail('BAD_JSON', `${settingsPath} is not valid JSON, so it was left alone`);
  }
}

function save(settingsPath, next) {
  const tmp = `${settingsPath}.agent-office.tmp`;
  const mode = fs.statSync(settingsPath).mode & 0o777;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode });
  fs.renameSync(tmp, settingsPath);
}

export function hookStatus({ settingsPath = defaultPath() } = {}) {
  let hooks = {};
  try { hooks = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))?.hooks ?? {}; } catch { hooks = {}; }
  const missing = EVENTS.filter((e) => !(Array.isArray(hooks?.[e]) && hooks[e].some(isOurs)));
  return { installed: missing.length === 0, missing, settingsPath, bridgePath: BRIDGE, jq: has('jq'), curl: has('curl') };
}

export function installHooks({ settingsPath = defaultPath() } = {}) {
  const settings = load(settingsPath);
  if (!has('jq') || !has('curl')) throw fail('NO_TOOLS', 'jq and curl are both needed by the hook bridge');
  if (!fs.existsSync(BRIDGE)) throw fail('NO_BRIDGE', `bridge script missing at ${BRIDGE}`);
  fs.chmodSync(BRIDGE, 0o755);
  const backup = `${settingsPath}.agent-office.bak`;
  if (!fs.existsSync(backup)) fs.copyFileSync(settingsPath, backup);

  const hooks = (settings.hooks ??= {});
  const added = [];
  for (const event of EVENTS) {
    const existing = (hooks[event] ??= []).find(isOurs);
    if (existing) {
      existing.hooks = [
        { type: 'command', command: BRIDGE },
        ...(existing.hooks ?? []).filter((h) => !cmdOf(h).includes(BRIDGE)),
      ];
    } else {
      hooks[event] = [...hooks[event], { matcher: '', hooks: [{ type: 'command', command: BRIDGE }] }];
      added.push(event);
    }
  }
  save(settingsPath, settings);
  return { added, status: hookStatus({ settingsPath }) };
}

export function uninstallHooks({ settingsPath = defaultPath() } = {}) {
  const settings = load(settingsPath);
  const hooks = (settings.hooks ??= {});
  let removed = 0;
  for (const event of Object.keys(hooks)) {
    const before = hooks[event].length;
    hooks[event] = hooks[event]
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((h) => !cmdOf(h).includes(BRIDGE)) }))
      .filter((group) => group.hooks.length > 0);
    removed += before - hooks[event].length;
    if (!hooks[event].length) delete hooks[event];
  }
  if (!Object.keys(hooks).length) delete settings.hooks;
  save(settingsPath, settings);
  return { removed, status: hookStatus({ settingsPath }) };
}
