import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map([['office.alerts', '1']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
const docListeners = [];
globalThis.document = { title: 't', hidden: false, addEventListener: (t) => docListeners.push(t), removeEventListener() {}, hasFocus: () => true };
let resumed = 0;
globalThis.window = {
  addEventListener() {}, removeEventListener() {},
  AudioContext: class { async resume() { resumed++; } },
};
let requested = 0;
globalThis.Notification = class { static permission = 'default'; static async requestPermission() { requested++; return 'granted'; } };
window.Notification = Notification;

const n = await import('./notify.js');
const NOW = Date.now();
const item = (o) => ({ name: 'x', outcome: 'done', finishedAt: NOW - 1000, ...o });
const collect = () => { const m = []; const say = (t) => m.push(t); return { m, say }; };

test('registers unlock listeners when alerts are on', () => {
  assert.deepEqual(docListeners.sort(), ['keydown', 'pointerdown']);
});

test('first run announces nothing and stores office.seen', () => {
  const { m, say } = collect();
  n.catchUp({ history: { items: [item()] }, asks: { open: [] } }, say);
  assert.equal(m.length, 0);
  assert.ok(Number(store.get('office.seen')) > 0);
});

test('one missed finish is announced', () => {
  store.set('office.seen', String(NOW - 5000));
  const { m, say } = collect();
  n.catchUp({ history: { items: [item({ folder: 'proj' })] } }, say);
  assert.equal(m.length, 1);
  assert.match(m[0], /proj finished/);
  assert.equal(store.get('office.seen'), String(NOW - 1000));
});

test('three missed finishes give one summary', () => {
  store.set('office.seen', String(NOW - 5000));
  const { m, say } = collect();
  n.catchUp({ history: { items: [item(), item({ finishedAt: NOW - 900 }), item({ finishedAt: NOW - 800 })] } }, say);
  assert.equal(m.length, 1);
  assert.match(m[0], /3 sessions finished while you were away/);
});

test('stopped and older than 6h are ignored', () => {
  store.set('office.seen', '1');
  const { m, say } = collect();
  n.catchUp({ history: { items: [item({ outcome: 'stopped' }), item({ finishedAt: NOW - 7 * 3600 * 1000 })] } }, say);
  assert.equal(m.length, 0);
});

test('open question announced once across two catchUps', () => {
  const { m, say } = collect();
  const asks = { open: [{ id: 'a1', kind: 'question', questions: [{ question: 'Which?' }] }, { id: 'a2', kind: 'tool' }] };
  n.catchUp({ asks }, say);
  n.catchUp({ asks }, say);
  assert.equal(m.length, 1);
  assert.match(m[0], /Which\?/);
});

test('unlockAlerts resumes audio and requests permission only when default', async () => {
  await n.unlockAlerts();
  assert.equal(resumed, 1);
  assert.equal(requested, 1);
  Notification.permission = 'denied';
  await n.unlockAlerts();
  assert.equal(requested, 1);
  assert.equal(n.popupState(), 'denied');
});
