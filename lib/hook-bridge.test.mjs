import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './room.js';
import { handleHook, reapStaleHooks } from './hook-bridge.js';

const ev = (room, hook_event_name, extra = {}) =>
  handleHook(room, { session_id: 's1', cwd: '/tmp/proj', hook_event_name, ...extra }, {});
const get = (room) => room.agents.get('s1');
const age = (room, ms) => room.upsert('s1', { endedAt: Date.now() - ms });
const finished = async () => {
  const room = new Room();
  await ev(room, 'UserPromptSubmit', { prompt: 'hi' });
  await ev(room, 'Stop');
  return room;
};

test('finished turn leaves the floor after 10 s, not before', async () => {
  const room = await finished();
  assert.equal(get(room).state, 'done');
  age(room, 5_000);
  reapStaleHooks(room, {});
  assert.ok(get(room));
  age(room, 11_000);
  reapStaleHooks(room, {});
  assert.equal(get(room), undefined);
});

test('idle_prompt after Stop keeps state done', async () => {
  const room = await finished();
  await ev(room, 'Notification', { notification_type: 'idle_prompt', message: 'waiting' });
  assert.equal(get(room).state, 'done');
});

test('permission_prompt after Stop keeps done and is swept', async () => {
  const room = await finished();
  await ev(room, 'Notification', { notification_type: 'permission_prompt', message: 'needs ok' });
  assert.equal(get(room).state, 'done');
  age(room, 11_000);
  reapStaleHooks(room, {});
  assert.equal(get(room), undefined);
});

test('permission_prompt during a live turn blocks', async () => {
  const room = new Room();
  await ev(room, 'UserPromptSubmit', { prompt: 'hi' });
  await ev(room, 'Notification', { notification_type: 'permission_prompt', message: 'needs ok' });
  assert.equal(get(room).state, 'blocked');
});

test('native error run stays 45 s', () => {
  const room = new Room();
  room.upsert('e1', { source: 'claude', state: 'error', endedAt: Date.now() - 20_000 });
  reapStaleHooks(room, {});
  assert.ok(room.agents.get('e1'));
  room.upsert('e1', { endedAt: Date.now() - 46_000 });
  reapStaleHooks(room, {});
  assert.equal(room.agents.get('e1'), undefined);
});
