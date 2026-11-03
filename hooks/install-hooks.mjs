// Installs (or removes) the Agent Office hook bridge in ~/.claude/settings.json.
//
//   node hooks/install-hooks.mjs             install
//   node hooks/install-hooks.mjs --uninstall
//
// It merges rather than replaces: every other setting and every hook you already have
// stays exactly as it was, and the file is backed up once before the first install.
// The merge logic lives in lib/hook-install.js, shared with the page's install button.

import fs from 'node:fs';
import { EVENTS, installHooks, uninstallHooks, hookStatus } from '../lib/hook-install.js';

const uninstall = process.argv.includes('--uninstall');
const { settingsPath } = hookStatus();

try {
  if (uninstall) {
    const { removed } = uninstallHooks();
    console.log(`removed our hook groups from ${removed} event(s); other settings untouched`);
  } else {
    const hadBackup = fs.existsSync(`${settingsPath}.agent-office.bak`);
    const { added } = installHooks();
    if (!hadBackup) console.log(`backed up settings to ${settingsPath}.agent-office.bak`);
    const keptElsewhere = (JSON.parse(fs.readFileSync(settingsPath, 'utf8')).hooks?.Notification ?? [])
      .filter((g) => !(g.hooks ?? []).some((h) => String(h.command ?? '').includes(hookStatus().bridgePath))).length;
    console.log(`installed on ${EVENTS.length} events (${added.length} new, ${EVENTS.length - added.length} already present)`);
    console.log(`pre-existing Notification groups left intact: ${keptElsewhere}`);
  }
} catch (err) {
  if (err.code === 'NO_SETTINGS') console.error(`no settings file at ${settingsPath} — start Claude Code once, then re-run`);
  else console.error(err.message);
  process.exit(1);
}
