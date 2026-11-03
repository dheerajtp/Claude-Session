import test from 'node:test';
import assert from 'node:assert/strict';
import { Asks } from './asks.js';

const room = () => ({ clients: new Set([1]), touch() {}, syncAgent() {}, broadcast() {} });
const agent = { id: 'a', name: 'a', sessionId: 's' };
const Q = 'Which one?';
const body = { tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: Q, header: 'h', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] }] } };

test('needs() only asks for armed sessions', () => {
  const asks = new Asks(room());
  assert.equal(asks.needs(body, 's'), null);
  assert.equal(asks.needs({ tool_name: 'Bash' }, 's'), null);
  asks.setArmed('s', true);
  assert.equal(asks.needs(body, 's'), 'question');
});

async function reply(answers) {
  const asks = new Asks(room());
  const p = asks.hold(agent, body, 'question');
  const [id] = [...asks.open.keys()];
  asks.answer(id, { decision: 'allow', answers });
  return (await p).updatedInput.answers[Q];
}

test('typed answers keep up to 300 chars', async () => {
  assert.equal((await reply({ [Q]: 'x'.repeat(250) })).length, 250);
  assert.ok((await reply({ [Q]: 'x'.repeat(400) })).length <= 301);
});

test('typed answers keep git SHAs and other hex tokens', async () => {
  const text = `use commit ${'deadbeef'.repeat(5)}`;
  assert.equal(await reply({ [Q]: text }), text);
});

test('multiSelect arrays stay arrays', async () => {
  assert.deepEqual(await reply({ [Q]: ['A', 'B'] }), ['A', 'B']);
});

async function withImages(answers, images, ids) {
  const asks = new Asks(room());
  const p = asks.hold(agent, body, 'question');
  const [id] = [...asks.open.keys()];
  const fake = { pathFor: (x) => (x.startsWith('zz-') ? null : `/tmp/${x}`) };
  asks.answer(id, { decision: 'allow', answers, images: { [Q]: (ids || images).map((i) => (i.startsWith('@') ? id + i.slice(1) : i)) } }, fake);
  return (await p).updatedInput.answers[Q];
}

test('images are appended to string answers', async () => {
  assert.match(await withImages({ [Q]: 'hi' }, ['@-aaaaaaaa.png']), /^hi \[image: \/tmp\/.+-aaaaaaaa\.png\]$/);
});

test('images add elements to array answers', async () => {
  const r = await withImages({ [Q]: ['A'] }, ['@-aaaaaaaa.png']);
  assert.equal(r.length, 2);
  assert.match(r[1], /^\[image: /);
});

test('image-only answer', async () => {
  assert.match(await withImages({}, ['@-aaaaaaaa.png']), /^See the attached image: \/tmp\//);
});

test('three images per question, other asks ignored', async () => {
  const r = await withImages({ [Q]: 'x' }, ['@-aaaaaaa1.png', '@-aaaaaaa2.png', '@-aaaaaaa3.png', '@-aaaaaaa4.png', 'other-aaaaaaa5.png']);
  assert.equal(r.split('[image:').length - 1, 3);
  assert.ok(!r.includes('other-'));
});
