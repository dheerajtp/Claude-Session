import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Images } from './images.js';

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
