import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './room.js';
import { handleHook, reapStaleHooks, HELPER_ON_FLOOR_MS } from './hook-bridge.js';

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

const HAND_BACK = '<agent-message from="x">the report follows: all good</agent-message>';

test('late events after Stop keep done and the same endedAt, and are swept', async () => {
  const cases = [
    ['SubagentStop', { agent_type: 'Explore' }],
    ['PostToolUse', { tool_name: 'Read', tool_use_id: 'z' }],
    ['UserPromptSubmit', { prompt: HAND_BACK }],
  ];
  for (const [name, extra] of cases) {
    const room = await finished();
    const endedAt = get(room).endedAt;
    await ev(room, name, extra);
    assert.equal(get(room).state, 'done', name);
    assert.equal(get(room).endedAt, endedAt, name);
    age(room, 11_000);
    reapStaleHooks(room, {});
    assert.equal(get(room), undefined, name);
  }
});

test('new work after Stop revives the session and it is not swept', async () => {
  const room = await finished();
  await ev(room, 'PreToolUse', { tool_name: 'Read', tool_use_id: 'r1', tool_input: {} });
  assert.equal(get(room).state, 'working');
  assert.equal(get(room).endedAt, null);
  age(room, 11_000);
  room.upsert('s1', { endedAt: null });
  reapStaleHooks(room, {});
  assert.ok(get(room));
});

const withHelpers = async (...types) => {
  const room = new Room();
  room.onSubagent = (parent, { subagent_type }) => {
    const id = `h-${subagent_type}`;
    room.upsert(id, { parent: parent.id, source: 'claude-hook', name: subagent_type, state: 'walking', startedAt: Date.now() });
    return id;
  };
  await ev(room, 'UserPromptSubmit', { prompt: 'hi' });
  for (const t of types) {
    await ev(room, 'PreToolUse', { tool_name: 'Agent', tool_use_id: `t-${t}`, tool_input: { subagent_type: t, description: 'x' } });
  }
  return room;
};

test('Stop ends helpers and they leave 15 s later', async () => {
  const room = await withHelpers('slice-worker');
  assert.equal(room.agents.get('h-slice-worker').state, 'walking');
  await ev(room, 'Stop');
  const h = room.agents.get('h-slice-worker');
  assert.equal(h.state, 'done');
  room.upsert(h.id, { endedAt: Date.now() - HELPER_ON_FLOOR_MS - 1000 });
  room.upsert('s1', { endedAt: Date.now() });
  reapStaleHooks(room, {});
  assert.equal(room.agents.get('h-slice-worker'), undefined);
  assert.ok(get(room));
});

test('helper goes in the same pass as its swept boss', async () => {
  const room = await withHelpers('slice-worker');
  await ev(room, 'Stop');
  age(room, 11_000);
  reapStaleHooks(room, {});
  assert.equal(get(room), undefined);
  assert.equal(room.agents.get('h-slice-worker'), undefined);
});

test('SubagentStop ends only the matching helper', async () => {
  const room = await withHelpers('slice-worker', 'Explore');
  await ev(room, 'SubagentStop', { agent_type: 'Explore' });
  assert.equal(room.agents.get('h-Explore').state, 'done');
  assert.notEqual(room.agents.get('h-slice-worker').state, 'done');
});
