import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ID_PATTERN = /^[A-Za-z0-9_-]+-[0-9a-f]{8}\.(png|jpg|gif|webp)$/;
export const NOT_A_PICTURE = 'that is not a PNG, JPEG, GIF or WebP picture';

// Pictures attached to answers live in the temp folder for a day so Claude can
// read them by path after the hook has returned.
export class Images {
  constructor({ dir = path.join(os.tmpdir(), 'claude-office-images'), now = Date.now } = {}) {
    this.dir = dir;
    this.now = now;
  }

  save(askId, buf) {
    if (!Buffer.isBuffer(buf) || !buf.length) return { error: NOT_A_PICTURE };
    if (buf.length > MAX_BYTES) return { error: 'that picture is too big (5 MB at most)' };
    const ext = detect(buf);
    if (!ext) return { error: NOT_A_PICTURE };
    const safe = String(askId).replace(/[^A-Za-z0-9_-]/g, '') || 'ask';
    const imageId = `${safe}-${randomBytes(4).toString('hex')}.${ext}`;
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const file = path.join(this.dir, imageId);
    fs.writeFileSync(file, buf, { mode: 0o600 });
    return { imageId, path: file, bytes: buf.length };
  }

  pathFor(imageId) {
    if (typeof imageId !== 'string' || !ID_PATTERN.test(imageId)) return null;
    const file = path.resolve(this.dir, imageId);
    return fs.existsSync(file) ? file : null;
  }

  sweep() {
    let n = 0;
    let names;
    try { names = fs.readdirSync(this.dir); } catch { return 0; }
    for (const name of names) {
      if (!ID_PATTERN.test(name)) continue;
      const file = path.join(this.dir, name);
      try {
        if (this.now() - fs.statSync(file).mtimeMs > MAX_AGE_MS) { fs.unlinkSync(file); n += 1; }
      } catch { /* already gone */ }
    }
    return n;
  }
}

function detect(b) {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  const head = b.subarray(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}
