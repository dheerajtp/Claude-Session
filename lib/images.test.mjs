import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Images, composePrompt } from './images.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const fresh = (extra = {}) => new Images({ dir: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'img-test-')), 'imgs'), ...extra });

test('saves a PNG privately and finds it again', () => {
  const images = fresh();
  const r = images.save('abc12345', PNG);
  assert.ok(!r.error);
  assert.ok(r.imageId.startsWith('abc12345-') && r.imageId.endsWith('.png'));
  assert.equal(fs.statSync(r.path).mode & 0o777, 0o600);
  assert.equal(fs.statSync(images.dir).mode & 0o777, 0o700);
  assert.equal(images.pathFor(r.imageId), r.path);
});

test('rejects non-pictures and oversize', () => {
  const images = fresh();
  assert.match(images.save('a', Buffer.from('hello world, not a png')).error, /not a PNG/);
  const big = Buffer.alloc(5 * 1024 * 1024 + 1);
  PNG.copy(big);
  assert.ok(images.save('a', big).error);
});

test('pathFor refuses traversal', () => {
  const images = fresh();
  images.save('a', PNG);
  assert.equal(images.pathFor('../x'), null);
  assert.equal(images.pathFor('../../etc/passwd'), null);
  assert.equal(images.pathFor('b-00000000.png'), null);
});

test('sweep removes day-old files only', () => {
  let t = Date.now();
  const images = fresh({ now: () => t });
  const old = images.save('a', PNG);
  t += 25 * 3600 * 1000;
  fs.utimesSync(old.path, new Date(Date.now()), new Date(Date.now()));
  const keep = images.save('b', PNG);
  fs.utimesSync(keep.path, new Date(t), new Date(t));
  assert.equal(images.sweep(), 1);
  assert.equal(images.pathFor(old.imageId), null);
  assert.ok(images.pathFor(keep.imageId));
});

test('composePrompt leaves a prompt alone without pictures', () => {
  const images = fresh();
  assert.deepEqual(composePrompt('hi', undefined, images), { prompt: 'hi' });
  assert.deepEqual(composePrompt('hi', [], images), { prompt: 'hi' });
});

test('composePrompt appends the saved paths', () => {
  const images = fresh();
  const a = images.save('draft', PNG);
  const b = images.save('draft', PNG);
  const r = composePrompt('hi', [a.imageId, b.imageId], images);
  assert.equal(r.prompt, `hi\n\nReference pictures — open each one with your Read tool before you start:\n- ${a.path}\n- ${b.path}`);
});

test('composePrompt rejects unknown, non-draft and too many ids', () => {
  const images = fresh();
  const gone = 'a picture is no longer available, attach it again';
  assert.equal(composePrompt('hi', ['draft-deadbeef.png'], images).error, gone);
  const ask = images.save('ask1', PNG);
  assert.equal(composePrompt('hi', [ask.imageId], images).error, gone);
  const d = images.save('draft', PNG).imageId;
  assert.equal(composePrompt('hi', Array(6).fill(d), images).error, '5 pictures at most');
});
