export const TILE_W = 128;
export const TILE_H = 64;

export const C = {
  void0: '#0b1020',
  void1: '#141b2e',
  floor: '#e6d9c3',
  floorAlt: '#ddcfb7',
  floorLine: 'rgba(90,70,45,0.16)',
  grout: 'rgba(255,255,255,0.30)',
  wall: '#cfd6df',
  wallShade: '#b9c2cd',
  wallTop: '#eef2f7',
  baseboard: '#8d97a5',
  wood: '#c08a55',
  woodMid: '#9d6c40',
  woodDark: '#7a5230',
  metal: '#8d99a8',
  metalDark: '#5c6875',
  plastic: '#33415a',
  plasticDark: '#232d3f',
  fabric: '#4f6d8f',
  fabricDark: '#3c5370',
  leafA: '#4fa876',
  leafB: '#2f7d57',
  pot: '#c1714b',
  glass: '#bfe6ff',
  paper: '#fbf7ef',
  ink: '#2b3444',
  rug: '#b45c6c',
  rugAlt: '#9c4a59',
};

const STATE_COLORS = {
  booting: '#7FE0FF',
  idle: '#9aa7b8',
  walking: '#8AB4FF',
  thinking: '#FFD166',
  working: '#4DE1C1',
  blocked: '#FF8FA3',
  error: '#FF5E7A',
  done: '#7CE4A8',
  coffee: '#C8A276',
  leaving: '#9aa7b8',
};

export function stateColor(state) {
  return STATE_COLORS[state] || STATE_COLORS.idle;
}

export function shade(hex, amt) {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { const k = 1 + amt; r *= k; g *= k; b *= k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function alpha(hex, a) {
  if (hex.startsWith('rgb')) return hex.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class Iso {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.autoFit = true;
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.room = { w: 12, h: 8 };
    this.resize();
  }

  sync() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width));
    const h = Math.max(240, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.w && h === this.h && dpr === this.dpr) return false;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.autoFit) this.fit();
    else this.applyPan();
    return true;
  }

  resize() {
    this.w = 0;
    this.sync();
  }

  fit() {
    const { w, h } = this.room;
    const wallH = this.wallH || 172;
    const zW = (this.w - 44) / ((w + h) * (TILE_W / 2));
    const zH = (this.h - 44) / ((w + h) * (TILE_H / 2) + wallH);
    this.base = Math.max(0.22, Math.min(1.2, Math.min(zW, zH)));
    this.applyPan();
  }

  zoom(factor) {
    this.autoFit = false;
    this.base = Math.max(0.2, Math.min(1.8, (this.base || 1) * factor));
    this.applyPan();
  }

  applyPan() {
    const { w, h } = this.room;
    const wallH = this.wallH || 172;
    const z = (this.base || 1) * this.scale;
    this.k = { a: (TILE_W / 2) * z, b: (TILE_H / 2) * z };
    this.z = z;
    this.ox = this.w / 2 - ((w - h) / 2) * this.k.a + this.panX;
    this.oy = this.h / 2 - ((w + h) * this.k.b - wallH * z) / 2 + this.panY;
  }

  p(gx, gy, gz = 0) {
    return {
      x: this.ox + (gx - gy) * this.k.a,
      y: this.oy + (gx + gy) * this.k.b - gz * this.z,
    };
  }

  px(gx, gy, gz = 0) { return this.p(gx, gy, gz).x; }
  py(gx, gy, gz = 0) { return this.p(gx, gy, gz).y; }

  // Inverse of the ground-plane projection; used for hit testing.
  unproject(sx, sy) {
    const dx = sx - this.ox, dy = sy - this.oy;
    return { gx: (dy / this.k.b + dx / this.k.a) / 2, gy: (dy / this.k.b - dx / this.k.a) / 2 };
  }

  depth(gx, gy) { return gx + gy; }
}

export function poly(ctx, pts, fill, stroke, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

export function box(iso, ctx, gx, gy, w, d, h, faces, stroke = null, gz = 0) {
  const hw = w / 2, hd = d / 2;
  const A = iso.p(gx - hw, gy - hd, gz + h), B = iso.p(gx + hw, gy - hd, gz + h);
  const Cc = iso.p(gx + hw, gy + hd, gz + h), D = iso.p(gx - hw, gy + hd, gz + h);
  const bB = iso.p(gx + hw, gy - hd, gz), bC = iso.p(gx + hw, gy + hd, gz), bD = iso.p(gx - hw, gy + hd, gz);
  poly(ctx, [B, Cc, bC, bB], faces.right, stroke);
  poly(ctx, [Cc, D, bD, bC], faces.left, stroke);
  poly(ctx, [A, B, Cc, D], faces.top, stroke);
}

export function floorTile(iso, ctx, gx, gy, fill, alt) {
  const pts = [iso.p(gx, gy), iso.p(gx + 1, gy), iso.p(gx + 1, gy + 1), iso.p(gx, gy + 1)];
  poly(ctx, pts, fill, alt);
}

export function ellipseShadow(iso, ctx, gx, gy, rx = 0.34, ry = 0.16, color = 'rgba(24,16,8,0.28)') {
  const c = iso.p(gx, gy);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * iso.k.a * 2, ry * iso.k.a * 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.filter = 'blur(1px)';
  ctx.fill();
  ctx.restore();
}

export function cyl(iso, ctx, gx, gy, r, h, colors, gz = 0) {
  const rr = r * iso.k.a * 2;
  const top = iso.p(gx, gy, gz + h);
  const bot = iso.p(gx, gy, gz);
  const body = ctx.createLinearGradient(bot.x - rr, 0, bot.x + rr, 0);
  body.addColorStop(0, colors.side0);
  body.addColorStop(0.5, colors.side1);
  body.addColorStop(1, colors.side0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(bot.x - rr, Math.min(top.y, bot.y) - rr * 0.6, rr * 2, Math.abs(bot.y - top.y) + rr * 1.2);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(bot.x - rr, bot.y);
  ctx.lineTo(top.x - rr, top.y);
  ctx.ellipse(top.x, top.y, rr, rr * 0.5, 0, Math.PI, 0, true);
  ctx.lineTo(bot.x + rr, bot.y);
  ctx.ellipse(bot.x, bot.y, rr, rr * 0.5, 0, 0, Math.PI);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(top.x, top.y, rr, rr * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = colors.top;
  ctx.fill();
}

// A rectangle living in a wall plane. wall 'x' runs along gx at gy=0; wall 'y' along gy at gx=0.
export function wallRect(iso, ctx, wall, from, to, gz0, gz1, fill, stroke = null) {
  const pts = wall === 'x'
    ? [iso.p(from, 0, gz1), iso.p(to, 0, gz1), iso.p(to, 0, gz0), iso.p(from, 0, gz0)]
    : [iso.p(0, from, gz1), iso.p(0, to, gz1), iso.p(0, to, gz0), iso.p(0, from, gz0)];
  poly(ctx, pts, fill, stroke);
}

export function roundRect(ctx, x, y, w, h, r, fill, stroke, lineWidth = 1) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
