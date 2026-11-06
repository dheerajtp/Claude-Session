import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { History, SHELF_ITEMS } from './history.js';

const fresh = () => new History({ broadcast() {} }, { file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hist-test-')), 'history.json') });
const run = (n, extra = {}) => ({ id: `a${n}`, sessionId: `s${n}`, name: 'n', cwd: '/tmp/x', prompt: `do thing ${n}`, ...extra });

test('stores sessionId, ask and pinned', () => {
  const h = fresh();
  const item = h.record(run(1), 'finished');
  assert.equal(item.sessionId, 's1');
  assert.equal(item.ask, 'do thing 1');
  assert.equal(item.pinned, false);
});

test('re-recording keeps pinned', () => {
  const h = fresh();
  h.record(run(1), 'finished');
  assert.equal(h.setPinned('s1', true), true);
  const again = h.record(run(1), 'finished');
  assert.equal(again.pinned, true);
});

test('trimming keeps pinned items', () => {
  const h = fresh();
  h.record(run(0), 'finished');
  h.record(run(1), 'finished');
  h.setPinned('s0', true);
  h.setPinned('s1', true);
  for (let i = 2; i < 207; i++) h.record(run(i), 'finished');
  assert.ok(h.items.some((i) => i.key === 's0' && i.pinned));
  assert.ok(h.items.some((i) => i.key === 's1' && i.pinned));
  assert.ok(h.items.length <= 200);
});

test('snapshot defaults to the shelf size', () => {
  const h = fresh();
  for (let i = 0; i < 90; i++) h.record(run(i), 'finished');
  assert.ok(h.snapshot().items.length <= SHELF_ITEMS);
});

test('setPinned toggles and rejects unknown keys', () => {
  const h = fresh();
  h.record(run(1), 'finished');
  assert.equal(h.setPinned('s1', true), true);
  assert.equal(h.setPinned('s1', false), true);
  assert.equal(h.items[0].pinned, false);
  assert.equal(h.setPinned('nope', true), false);
});
