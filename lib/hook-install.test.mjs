import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EVENTS, installHooks, uninstallHooks, hookStatus } from './hook-install.js';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hook-install-')), 'settings.json');
const write = (p, o) => fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o));
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

test('fresh install adds all events and keeps other keys', () => {
  const p = tmp(); write(p, { theme: 'dark' });
  assert.equal(hookStatus({ settingsPath: p }).installed, false);
  const r = installHooks({ settingsPath: p });
  assert.equal(r.added.length, 11);
  assert.equal(EVENTS.length, 11);
  assert.equal(read(p).theme, 'dark');
  assert.equal(r.status.installed, true);
});

test('second install is idempotent', () => {
  const p = tmp(); write(p, {});
  installHooks({ settingsPath: p });
  assert.equal(installHooks({ settingsPath: p }).added.length, 0);
  for (const e of EVENTS) assert.equal(read(p).hooks[e].length, 1);
});

test('foreign Notification hook survives install and uninstall', () => {
  const p = tmp();
  const foreign = { matcher: '', hooks: [{ type: 'command', command: '/bin/other' }] };
  write(p, { hooks: { Notification: [foreign] } });
  installHooks({ settingsPath: p });
  assert.equal(read(p).hooks.Notification.length, 2);
  uninstallHooks({ settingsPath: p });
  assert.deepEqual(read(p).hooks, { Notification: [foreign] });
});

test('invalid JSON is rejected and left untouched', () => {
  const p = tmp(); write(p, '{ nope');
  assert.throws(() => installHooks({ settingsPath: p }), { code: 'BAD_JSON' });
  assert.equal(fs.readFileSync(p, 'utf8'), '{ nope');
  assert.equal(hookStatus({ settingsPath: p }).installed, false);
});

test('absent file gives NO_SETTINGS', () => {
  const p = tmp();
  assert.throws(() => installHooks({ settingsPath: p }), { code: 'NO_SETTINGS' });
  assert.equal(hookStatus({ settingsPath: p }).installed, false);
});

test('backup is created once', () => {
  const p = tmp(); write(p, { a: 1 });
  installHooks({ settingsPath: p });
  const bak = `${p}.agent-office.bak`;
  assert.deepEqual(read(bak), { a: 1 });
  installHooks({ settingsPath: p });
  assert.deepEqual(read(bak), { a: 1 });
});
