import { Iso, poly, alpha, shade, roundRect, wallRect, box } from './iso.js';

export const DORM = { w: 11.5, h: 8.6, wallH: 150 };

const COLS = 5;
const ROWS = 3;
const BEDS = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    BEDS.push({
      gx: 1.5 + c * 2.25,
      gy: 1.45 + r * 2.85,
      w: 1.45,
      d: 2.45,
      nightstand: { gx: 1.5 + c * 2.25 + 1.0, gy: 1.45 + r * 2.85 - 0.75 },
    });
  }
}

const KIND = {
  agent: { blanket: '#3d5f7d', trim: '#8AB4FF', tag: 'AGENT' },
  skill: { blanket: '#6b4f7a', trim: '#C6A5FF', tag: 'SKILL' },
  model: { blanket: '#7a5c3a', trim: '#FFB454', tag: 'MODEL' },
  tool: { blanket: '#3f6b5c', trim: '#4DE1C1', tag: 'TOOL' },
};

export class Dorm {
  constructor(canvas) {
    this.canvas = canvas;
    this.iso = new Iso(canvas);
    this.iso.room = { w: DORM.w, h: DORM.h };
    this.iso.wallH = DORM.wallH;
    this.iso.fit();
    this.inventory = null;
    this.filter = '';
    this.group = 'agent';
    // showRoom() turns this on; the office is the default view
    this.active = false;
    this.time = 0;
    this.last = performance.now();
    this.hover = null;
    this.bindInput();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  bindInput() {
    new ResizeObserver(() => this.iso.resize()).observe(this.canvas.parentElement || this.canvas);
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.iso.zoom(e.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.offsetX, y: e.offsetY, panX: this.iso.panX, panY: this.iso.panY, moved: 0 };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      this.iso.panX = drag.panX + dx;
      this.iso.panY = drag.panY + dy;
      this.iso.autoFit = false;
      this.iso.applyPan();
    });
    this.canvas.addEventListener('pointerup', () => { drag = null; });
    this.canvas.addEventListener('dblclick', () => { this.iso.autoFit = true; this.iso.fit(); });
  }

  setInventory(inventory) {
    this.inventory = inventory || null;
  }

  setGroup(group) { this.group = group; }
  setFilter(q) { this.filter = String(q || '').trim().toLowerCase(); }

  // Full list for the current group, filtered, with usage merged in.
  roster() {
    if (!this.inventory?.known) return [];
    const names = this.inventory[GROUP_KEY[this.group]] || [];
    const used = new Map((this.inventory.usage || []).map((u) => [u.key, u]));
    const q = this.filter;
    return names
      .map((name) => {
        const key = `${this.group}:${name}`;
        const u = used.get(key);
        const uses = u?.count || 0;
        const errs = u?.errs || 0;
        return { name, key, kind: this.group, uses, errs, worked: Math.max(0, uses - errs), lastAt: u?.lastAt || null };
      })
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => (b.worked > 0) - (a.worked > 0) || (b.uses > 0) - (a.uses > 0) || a.name.localeCompare(b.name));
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.iso.sync();
    if (this.active && this.canvas.offsetParent !== null) this.render();
    requestAnimationFrame(this.loop);
  }

  render() {
    const { iso, ctx } = { iso: this.iso, ctx: this.iso.ctx };
    const t = this.time;
    ctx.setTransform(iso.dpr, 0, 0, iso.dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, iso.h);
    bg.addColorStop(0, '#0a0f1b');
    bg.addColorStop(0.6, '#141a2b');
    bg.addColorStop(1, '#070a12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, iso.w, iso.h);

    // moonlit floor
    for (let gy = 0; gy < DORM.h; gy++) {
      for (let gx = 0; gx < DORM.w; gx++) {
        poly(ctx, [iso.p(gx, gy), iso.p(gx + 1, gy), iso.p(gx + 1, gy + 1), iso.p(gx, gy + 1)],
          (gx + gy) % 2 ? '#3a2c22' : '#332619', alpha('#000000', 0.25), 1);
      }
    }
    const glow = iso.p(DORM.w * 0.5, DORM.h * 0.45, 0);
    const lg = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, 420 * iso.z);
    lg.addColorStop(0, 'rgba(150,180,255,0.14)');
    lg.addColorStop(1, 'rgba(150,180,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, iso.w, iso.h);
    poly(ctx, [iso.p(0, 0), iso.p(DORM.w, 0), iso.p(DORM.w, DORM.h), iso.p(0, DORM.h)], null, alpha('#000000', 0.4), 2);

    walls(iso, ctx, this.inventory);

    const rows = this.roster();
    const shown = rows.slice(0, BEDS.length);
    // Nameplates are collected while the beds are drawn and painted afterwards:
    // a tag drawn with its own bed gets buried under the frame of the bed in front.
    const plates = [];
    for (let i = 0; i < BEDS.length; i++) {
      bed(iso, ctx, BEDS[i], shown[i], t, i, plates);
    }
    nameplates(iso, ctx, plates);
    if (!this.inventory?.known) emptySign(iso, ctx);

    const vg = ctx.createRadialGradient(iso.w / 2, iso.h / 2, Math.min(iso.w, iso.h) * 0.28, iso.w / 2, iso.h / 2, Math.max(iso.w, iso.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,4,10,0.7)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, iso.w, iso.h);
  }
}

const GROUP_KEY = { agent: 'agents', skill: 'skills' };

function walls(iso, ctx, inv) {
  const H = DORM.wallH;
  wallRect(iso, ctx, 'x', 0, DORM.w, 0, H, '#1d2740', alpha('#000000', 0.35));
  wallRect(iso, ctx, 'y', 0, DORM.h, 0, H, '#18213a', alpha('#000000', 0.35));
  wallRect(iso, ctx, 'x', 0, DORM.w, 0, 16, '#2a2018');
  wallRect(iso, ctx, 'y', 0, DORM.h, 0, 16, '#241b14');

  // window with a moon
  wallRect(iso, ctx, 'x', 4.3, 7.2, H - 108, H - 34, '#0d1526', alpha('#8fb6ff', 0.5));
  const moon = iso.p(6.5, 0, H - 62);
  ctx.save();
  ctx.beginPath();
  ctx.arc(moon.x, moon.y, 13 * iso.z, 0, Math.PI * 2);
  ctx.fillStyle = '#dbe7ff';
  ctx.shadowColor = '#9dc0ff';
  ctx.shadowBlur = 26 * iso.z;
  ctx.fill();
  ctx.restore();
  for (const at of [5.25, 6.2]) {
    wallRect(iso, ctx, 'x', at - 0.03, at + 0.03, H - 108, H - 34, alpha('#0d1526', 0.9));
  }
  wallRect(iso, ctx, 'x', 4.3, 7.2, H - 74, H - 71, alpha('#0d1526', 0.9));

  // door on the near-left wall so it reads as the way back to the office
  wallRect(iso, ctx, 'y', 6.5, 7.6, 0, 96, '#3a2b1f', alpha('#000000', 0.4));
  const knob = iso.p(0, 7.42, 48);
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, Math.max(1.5, 2.6 * iso.z), 0, Math.PI * 2);
  ctx.fillStyle = '#c9a25a';
  ctx.fill();

  const counts = inv?.known
    ? `STANDBY · ${inv.counts.agents} agents · ${inv.counts.skills} skills · ${inv.counts.tools} tools`
    : 'DORMITORY · NO SESSION RECORDED';
  sign(iso, ctx, 'x', 0.5, 3.9, H - 44, counts, 11);
  sign(iso, ctx, 'x', 7.7, DORM.w - 0.3, H - 44, inv?.known
    ? `last seen ${new Date(inv.seenAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · session ${String(inv.sessionId || '').slice(0, 8)}`
    : 'run a job to fill the beds', 9);
}

function sign(iso, ctx, wall, from, to, gz, text, size) {
  const w = Math.max(0.4, to - from);
  wallRect(iso, ctx, wall, from, to, gz - size * 1.9, gz + 4, '#0b111d', alpha('#4DE1C1', 0.35));
  const p = wall === 'x' ? iso.p(from + w / 2, 0, gz - size * 0.55) : iso.p(0, from + w / 2, gz - size * 0.55);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.transform(1, wall === 'x' ? 0.5 : -0.5, 0, 1, 0, 0);
  ctx.textAlign = 'center';
  ctx.fillStyle = alpha('#e8f1ff', 0.92);
  ctx.font = `700 ${Math.max(5, size * iso.z)}px ui-monospace, monospace`;
  ctx.fillText(clip(text, Math.floor(w * 15)), 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';
}

function bed(iso, ctx, b, occ, t, i, plates) {
  const frame = { top: '#5a4230', right: '#42301f', left: '#372718' };
  const mattress = { top: '#d8d2c6', right: '#b7b0a4', left: '#a49d92' };
  box(iso, ctx, b.gx, b.gy, b.w, b.d, 14, frame, alpha('#000000', 0.35));
  box(iso, ctx, b.gx, b.gy, b.w - 0.12, b.d - 0.12, 10, mattress, null, 14);

  // headboard at the low-gy end
  box(iso, ctx, b.gx, b.gy - b.d / 2 + 0.06, b.w + 0.1, 0.16, 34, { top: '#6b4f38', right: '#4d3725', left: '#42301f' }, null, 0);

  if (!occ) {
    box(iso, ctx, b.gx, b.gy + 0.55, b.w - 0.3, b.d - 1.5, 8, { top: '#3f4a63', right: '#31394d', left: '#2a3143' }, null, 24);
    plates.push({ b, text: 'empty bed', color: '#7f8ea6', dim: true });
    return;
  }

  const style = KIND[occ.kind] || KIND.agent;
  const onShift = occ.worked > 0;
  const breathe = Math.sin(t * 1.6 + i * 0.9) * 1.6;

  // pillow
  box(iso, ctx, b.gx, b.gy - b.d / 2 + 0.42, b.w - 0.42, 0.62, 8, { top: '#f2eee4', right: '#d3cec2', left: '#c4bfb3' }, null, 24);

  if (onShift) {
    // bed made and vacant: this one is on the floor above
    box(iso, ctx, b.gx, b.gy + 0.35, b.w - 0.2, b.d - 1.1, 9, {
      top: shade(style.blanket, 12), right: style.blanket, left: shade(style.blanket, -14),
    }, alpha('#000000', 0.3), 24);
    plates.push({ b, text: `ON SHIFT ×${occ.worked}${occ.errs ? ` · ${occ.errs} failed` : ''}`, color: '#FFD166' });
    return;
  }

  // blanket over the body, rising slightly as they breathe
  box(iso, ctx, b.gx, b.gy + 0.42, b.w - 0.2, b.d - 1.35, 11 + breathe, {
    top: shade(style.blanket, 16), right: style.blanket, left: shade(style.blanket, -16),
  }, alpha('#000000', 0.28), 24);
  // folded trim at the foot
  box(iso, ctx, b.gx, b.gy + b.d / 2 - 0.32, b.w - 0.2, 0.3, 12.5 + breathe, {
    top: shade(style.trim, -34), right: shade(style.trim, -50), left: shade(style.trim, -58),
  }, null, 24);

  // head resting on the pillow
  const head = iso.p(b.gx, b.gy - b.d / 2 + 0.44, 34);
  const r = Math.max(3, 8.5 * iso.z);
  const skin = ctx.createRadialGradient(head.x - r * 0.3, head.y - r * 0.35, r * 0.15, head.x, head.y, r);
  skin.addColorStop(0, '#f3d3b3');
  skin.addColorStop(1, '#b98a63');
  ctx.beginPath();
  ctx.ellipse(head.x, head.y, r, r * 0.82, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(head.x, head.y - r * 0.5, r * 0.95, r * 0.5, 0, Math.PI, 0);
  ctx.fillStyle = ['#2b2118', '#4a3324', '#1d2530', '#6b4a2f'][i % 4];
  ctx.fill();
  // closed eyes
  ctx.strokeStyle = alpha('#3b2a1e', 0.8);
  ctx.lineWidth = Math.max(0.8, 1.2 * iso.z);
  ctx.beginPath();
  ctx.moveTo(head.x - r * 0.45, head.y + r * 0.1);
  ctx.lineTo(head.x - r * 0.12, head.y + r * 0.1);
  ctx.moveTo(head.x + r * 0.14, head.y + r * 0.1);
  ctx.lineTo(head.x + r * 0.46, head.y + r * 0.1);
  ctx.stroke();

  // Zzz
  const z = iso.p(b.gx + b.w / 2 - 0.1, b.gy - b.d / 2 + 0.5, 48);
  ctx.textAlign = 'left';
  for (let k = 0; k < 3; k++) {
    const phase = ((t * 0.5 + k * 0.34 + i * 0.11) % 1);
    ctx.fillStyle = alpha('#cfe0ff', 0.55 * (1 - phase));
    ctx.font = `700 ${Math.max(6, (8 + k * 3) * iso.z)}px ui-monospace, monospace`;
    ctx.fillText('z', z.x + phase * 16 * iso.z + k * 5 * iso.z, z.y - phase * 30 * iso.z - k * 4 * iso.z);
  }

  plates.push({ b, text: occ.name, color: style.trim, sub: occ.uses > 0 ? `called ${occ.uses}× · all failed` : null });
  nightstand(iso, ctx, b, i);
}

// One legible plate per bed, painted after every piece of furniture exists.
function nameplates(iso, ctx, plates) {
  const size = Math.max(11.5, Math.min(15, 12.5 * iso.z));
  const items = plates.map((pl) => {
    const anchor = iso.p(pl.b.gx, pl.b.gy + pl.b.d / 2 + 0.16, 0);
    const lines = wrap(ctx, pl.text, size);
    const sub = pl.sub ? wrap(ctx, pl.sub, size, true) : [];
    ctx.font = `700 ${size}px ui-sans-serif, system-ui`;
    const all = [...lines, ...sub];
    const w = Math.max(...all.map((l) => ctx.measureText(l).width)) + 16;
    const h = all.length * size * 1.3 + 9;
    const x = Math.max(w / 2 + 4, Math.min(iso.w - w / 2 - 4, anchor.x));
    // The front row has no floor left beneath it, so its plate goes above the headboard.
    const foot = anchor.y + 4;
    const head = iso.p(pl.b.gx, pl.b.gy - pl.b.d / 2, 0).y - h - 8;
    const y = foot + h > iso.h - 6 ? head : foot;
    return { ...pl, anchor, x, lines, sub, size, w, h, y };
  }).sort((a, b) => a.anchor.y - b.anchor.y);

  const placed = [];
  for (const it of items) {
    // Push down until the plate clears anything already painted over its bed.
    for (let guard = 0; guard < 40; guard++) {
      const rect = { x: it.x - it.w / 2, y: it.y, w: it.w, h: it.h };
      const hit = placed.find((r) => r.x < rect.x + rect.w - 4 && rect.x < r.x + r.w - 4 && r.y < rect.y + rect.h - 2 && rect.y < r.y + r.h - 2);
      if (!hit) break;
      it.y = hit.y + hit.h + 5;
    }
    placed.push({ x: it.x - it.w / 2, y: it.y, w: it.w, h: it.h });
    drawPlate(ctx, it);
  }
}

function drawPlate(ctx, it) {
  const x = it.x - it.w / 2;
  ctx.strokeStyle = alpha(it.color, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(it.anchor.x, it.anchor.y);
  ctx.lineTo(it.x, it.y > it.anchor.y ? it.y : it.y + it.h);
  ctx.stroke();
  roundRect(ctx, x, it.y, it.w, it.h, 5, 'rgba(6,10,19,0.94)', alpha(it.color, it.dim ? 0.3 : 0.65), 1);
  ctx.textAlign = 'center';
  it.lines.forEach((line, k) => {
    ctx.fillStyle = it.dim ? alpha('#9fb0c8', 0.85) : '#eef4ff';
    ctx.font = k === 0 ? `800 ${it.size}px ui-sans-serif, system-ui` : `600 ${it.size}px ui-sans-serif, system-ui`;
    ctx.fillText(line, it.x, it.y + 6 + it.size * 1.3 * (k + 0.85));
  });
  it.sub.forEach((line, k) => {
    ctx.fillStyle = alpha('#FF8FA3', 0.9);
    ctx.font = `600 ${it.size - 1}px ui-sans-serif, system-ui`;
    ctx.fillText(line, it.x, it.y + 6 + it.size * 1.3 * (it.lines.length + k + 0.85));
  });
  ctx.textAlign = 'left';
}

// Word-wrapped, never chopped mid-word: an unreadable name is the same as no name.
function wrap(ctx, text, size, small = false) {
  const px = small ? size - 1 : size;
  ctx.font = `700 ${px}px ui-sans-serif, system-ui`;
  const budget = 15 * px;
  // Skill names arrive as one long token ("agent-skills:web-performance"), so they
  // also break after : / - rather than losing their tail to an ellipsis.
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
    .flatMap((w) => (w.length > 15 ? w.split(/(?<=[/:/-])/).filter(Boolean) : [w]));
  const lines = [];
  let cur = '';
  for (const word of words) {
    const join = /[:/-]$/.test(cur) ? '' : ' ';
    const next = cur ? `${cur}${join}${word}` : word;
    if (ctx.measureText(next).width > budget && cur) { lines.push(cur); cur = word; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length <= 2) return lines.map((l) => ellipsize(ctx, l, budget));
  const rest = lines.slice(1).reduce((a, l) => a + (/[:/-]$/.test(a) ? '' : ' ') + l);
  return [ellipsize(ctx, lines[0], budget), ellipsize(ctx, rest, budget)];
}

function ellipsize(ctx, s, px) {
  if (ctx.measureText(s).width <= px) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > px) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function nightstand(iso, ctx, b, i) {
  const n = b.nightstand;
  box(iso, ctx, n.gx, n.gy, 0.5, 0.5, 20, { top: '#6b4f38', right: '#4d3725', left: '#42301f' }, alpha('#000000', 0.3));
  // a dim lamp that flickers slowly, different phase per bed
  const on = 0.35 + 0.25 * Math.sin(i * 1.7 + performance.now() / 2600);
  const lamp = iso.p(n.gx, n.gy, 26);
  ctx.beginPath();
  ctx.arc(lamp.x, lamp.y, Math.max(2, 4 * iso.z), 0, Math.PI * 2);
  ctx.fillStyle = alpha('#FFB454', on);
  ctx.fill();
}

function emptySign(iso, ctx) {
  const c = iso.p(DORM.w / 2, DORM.h / 2 + 0.5, 60);
  ctx.textAlign = 'center';
  ctx.fillStyle = alpha('#ff8fa3', 0.9);
  ctx.font = `700 ${Math.max(9, 15 * iso.z)}px ui-sans-serif, system-ui`;
  ctx.fillText('NO CLAUDE SESSION RECORDED YET', c.x, c.y);
  ctx.fillStyle = alpha('#c9d6ea', 0.8);
  ctx.font = `500 ${Math.max(8, 11 * iso.z)}px ui-sans-serif, system-ui`;
  ctx.fillText('Run an agent on the office floor: its session reports the agents and', c.x, c.y + 18 * iso.z);
  ctx.fillText('skills it had available, and they are put to bed here.', c.x, c.y + 33 * iso.z);
  ctx.textAlign = 'left';
}

function clip(s, n) {
  s = String(s ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
