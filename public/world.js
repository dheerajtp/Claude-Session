import { Iso, TILE_W, C, poly, alpha, shade, stateColor, ellipseShadow, roundRect } from './iso.js';
import { paint, paintWallBody, paintWallItems } from './furniture.js';

export const ROOM = { w: 12, h: 8, wallH: 172 };

const DESKS = [
  { gx: 2, gy: 2 }, { gx: 4, gy: 2 }, { gx: 6, gy: 2 }, { gx: 8, gy: 2 }, { gx: 10, gy: 2 },
];
// A seat at equal +gx/+gy sits directly below its monitor in screen space, so the
// person reads as facing the screen instead of parked beside the desk.
const SEATS = DESKS.map((d) => ({ gx: d.gx + 0.62, gy: d.gy + 0.62, back: 0.21 }));
const MEETING = [
  { gx: 8.1, gy: 5.5 }, { gx: 9.9, gy: 5.5 }, { gx: 8.1, gy: 6.6 }, { gx: 9.9, gy: 6.6 },
  { gx: 9, gy: 4.6 }, { gx: 9, gy: 7.3 },
];
const DOOR = { gx: 5.6, gy: 7.7 };
const WATER = { gx: 1.5, gy: 7.3 };
const COFFEE = { gx: 11.4, gy: 7.2 };

const WALL_ITEMS = [
  { kind: 'sign', wall: 'x', from: 0.5, to: 3.4, text: 'AGENT OPS · FLOOR 2' },
  { kind: 'window', wall: 'x', from: 5.6, to: 8.4 },
  { kind: 'clock', wall: 'x', from: 10.6, to: 11.4 },
  { kind: 'poster', wall: 'x', from: 3.9, to: 5.1, text: '"SHIP THE Diff"', color: '#2f4160' },
  { kind: 'kanban', wall: 'y', from: 1.4, to: 6.4 },
  { kind: 'poster', wall: 'y', from: 7.1, to: 7.9, text: 'MEMORY ≠ PROGRESS', color: '#43304f' },
];

const FURNITURE = [
  ...SEATS.map((s) => ({ kind: 'chair', ...s })),
  ...DESKS.map((d, i) => ({ kind: 'desk', ...d, index: i })),
  { kind: 'rug', gx: 1.7, gy: 6.1, w: 3.2, d: 3.4, color: C.rug },
  { kind: 'rug', gx: 9, gy: 6.05, w: 3.4, d: 3.0, color: '#4b6b7d' },
  { kind: 'sofa', gx: 1.05, gy: 5.5 },
  { kind: 'coffee', gx: 1.95, gy: 6.6 },
  { kind: 'plant', gx: 0.9, gy: 4.4 },
  { kind: 'plant', gx: 11.4, gy: 1.2 },
  { kind: 'plant', gx: 4.4, gy: 7.35 },
  { kind: 'cooler', gx: 0.85, gy: 7.2 },
  { kind: 'table', gx: 9, gy: 6.05 },
  ...MEETING.map((m) => ({ kind: 'chair', ...m })),
  { kind: 'rack', gx: 11.3, gy: 3.4 },
  { kind: 'cabinet', gx: 0.85, gy: 3.4 },
  { kind: 'printer', gx: 0.85, gy: 3.4 },
  { kind: 'coffee', gx: 11.3, gy: 6.4 },
  { kind: 'lamp', gx: 2.9, gy: 7.25 },
  { kind: 'lamp', gx: 10.5, gy: 4.4 },
  { kind: 'bin', gx: 3.15, gy: 3.1 },
  { kind: 'bin', gx: 5.15, gy: 3.1 },
  { kind: 'bin', gx: 7.15, gy: 3.1 },
  { kind: 'bin', gx: 11.5, gy: 4.6 },
];

const SKIN = ['#f0c9a5', '#d9a273', '#b3784f', '#8a5a3b', '#5f3d2b', '#f7dcc0'];
const HAIR = ['#2b2118', '#4a3324', '#1d2530', '#6b4a2f', '#2f2a3a', '#8d6b4a'];

export class Office {
  constructor(canvas) {
    this.canvas = canvas;
    this.iso = new Iso(canvas);
    this.iso.room = { w: ROOM.w, h: ROOM.h };
    this.iso.wallH = ROOM.wallH;
    this.iso.fit();
    this.avatars = new Map();
    this.agents = new Map();
    this.todos = [];
    this.selected = null;
    this.time = 0;
    this.last = performance.now();
    this.active = true;
    this.bindInput();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  bindInput() {
    const ro = new ResizeObserver(() => {
      this.iso.resize();
    });
    ro.observe(this.canvas.parentElement || this.canvas);

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
    const up = (e) => {
      if (drag && drag.moved < 6) this.click(e.offsetX, e.offsetY);
      drag = null;
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', () => { drag = null; });
    this.canvas.addEventListener('dblclick', () => { this.iso.autoFit = true; this.iso.fit(); });
  }

  click(x, y) {
    let best = null, bestD = Infinity;
    for (const a of this.avatars.values()) {
      const p = this.iso.p(a.gx, a.gy);
      const d = Math.hypot(p.x - x, p.y - y - 26 * this.iso.z);
      if (d < 40 * this.iso.z && d < bestD) { bestD = d; best = a.id; }
    }
    this.selected = best;
    this.onselect?.(best);
  }

  sync(agents) {
    this.agents = new Map(agents.map((a) => [a.id, a]));
    for (const a of agents) if (!this.avatars.has(a.id)) this.avatars.set(a.id, new Avatar(this, a));
    for (const id of [...this.avatars.keys()]) {
      if (!this.agents.has(id)) {
        const av = this.avatars.get(id);
        av.gone = true;
        if (!av.alive) { this.avatars.delete(id); this.onselect?.(null); }
      }
    }
    this.todos = [];
    for (const a of agents) {
      for (const t of a.todos || []) this.todos.push({ ...t, agentName: a.name, color: a.color });
    }
  }

  claimDesk(id) {
    const used = new Set([...this.avatars.values()].map((a) => a.desk).filter((n) => n !== null));
    for (let i = 0; i < DESKS.length; i++) if (!used.has(i)) return i;
    return null;
  }

  claimSeat(id) {
    const used = new Set([...this.avatars.values()].map((a) => a.seat).filter((n) => n !== null));
    for (let i = 0; i < MEETING.length; i++) if (!used.has(i)) return i;
    return null;
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.iso.sync();
    this.step(dt);
    if (this.active && this.canvas.offsetParent !== null) this.render();
    requestAnimationFrame(this.loop);
  }

  step(dt) {
    for (const av of this.avatars.values()) av.update(dt, this.agents.get(av.id));
  }

  render() {
    const { iso, ctx } = { iso: this.iso, ctx: this.iso.ctx };
    const t = this.time;
    ctx.setTransform(iso.dpr, 0, 0, iso.dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, iso.h);
    bg.addColorStop(0, '#0c1220');
    bg.addColorStop(0.55, '#151d31');
    bg.addColorStop(1, '#090d17');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, iso.w, iso.h);
    this.spotlight(ctx, iso);

    // floor
    for (let gy = 0; gy < ROOM.h; gy++) {
      for (let gx = 0; gx < ROOM.w; gx++) {
        const alt = (gx + gy) % 2 === 0;
        poly(ctx, [iso.p(gx, gy), iso.p(gx + 1, gy), iso.p(gx + 1, gy + 1), iso.p(gx, gy + 1)],
          alt ? C.floor : C.floorAlt, C.floorLine, 1);
      }
    }
    const light = iso.p(ROOM.w * 0.35, ROOM.h * 0.3, 0);
    const lg = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, TILE_W * iso.z * 5);
    lg.addColorStop(0, 'rgba(255,248,228,0.20)');
    lg.addColorStop(1, 'rgba(255,248,228,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, iso.w, iso.h);
    poly(ctx, [iso.p(0, 0), iso.p(ROOM.w, 0), iso.p(ROOM.w, ROOM.h), iso.p(0, ROOM.h)], null, alpha(C.ink, 0.22), 2);
    this.door(ctx, iso, t);

    paintWallBody(iso, ctx, ROOM.w, ROOM.h, ROOM.wallH);
    paintWallItems(iso, ctx, WALL_ITEMS, { todos: this.todos, now: Date.now() });

    const drawables = [];
    for (const it of FURNITURE) {
      if (it.kind === 'rug') { paint.rug(iso, ctx, it); continue; }
      drawables.push({ d: iso.depth(it.gx, it.gy) - 0.001, kind: 'item', it });
    }
    for (const av of this.avatars.values()) {
      drawables.push({ d: iso.depth(av.gx, av.gy) + (av.seated ? 0.02 : 0.03), kind: 'avatar', av });
    }
    drawables.sort((a, b) => a.d - b.d);

    for (const item of drawables) {
      if (item.kind === 'item') {
        const agent = item.it.kind === 'desk' ? this.deskAgent(item.it) : null;
        paint[item.it.kind]?.(iso, ctx, item.it, t, agent);
      } else {
        item.av.draw(iso, ctx, t);
      }
    }

    this.drawBubbles(iso, ctx, t);
    if (this.selected && this.avatars.has(this.selected)) this.ring(ctx, iso, this.avatars.get(this.selected), t);
    this.vignette(ctx, iso);
  }

  // Two people at neighbouring desks otherwise get bubbles printed on top of each
  // other, so the boxes are laid out first and stacked clear of one another.
  drawBubbles(iso, ctx, t) {
    const list = [];
    for (const av of this.avatars.values()) {
      const agent = this.agents.get(av.id);
      const geo = av.bubbleGeo(iso, agent);
      if (geo) list.push({ av, agent, geo });
    }
    list.sort((a, b) => a.geo.g.y - b.geo.g.y);
    const placed = [];
    for (const item of list) {
      const { geo } = item;
      const box = () => ({ x: geo.cx - (geo.w / 2) * geo.k, y: geo.cy - geo.h * geo.k, w: geo.w * geo.k, h: geo.h * geo.k });
      const collide = (r) => placed.find((p) => p.x < r.x + r.w - 6 && r.x < p.x + p.w - 6 && p.y < r.y + r.h - 3 && r.y < p.y + p.h - 3);
      for (let guard = 0; guard < 24; guard++) {
        const r = box();
        const hit = collide(r);
        if (!hit) break;
        const liftedTop = hit.y - 8 - r.h;
        if (liftedTop >= 6) {
          geo.cy -= r.y - liftedTop;
        } else {
          // The ceiling is reached — a busy floor has no room left to stack upward — so
          // the box slides into the empty margin beside the one it hits instead.
          const right = hit.x + hit.w + 8 + r.w / 2;
          const left = hit.x - 8 - r.w / 2;
          const fitsRight = right + r.w / 2 <= iso.w - 4;
          geo.cx = fitsRight ? right : left;
          geo.cx = Math.max(r.w / 2 + 4, Math.min(iso.w - r.w / 2 - 4, geo.cx));
        }
      }
      geo.cy = Math.max(geo.cy, geo.h * geo.k + 6);
      placed.push(box());
      item.av.bubble(iso, ctx, t, item.agent, geo);
    }
  }

  deskAgent(desk) {
    for (const av of this.avatars.values()) {
      if (av.desk !== null && av.desk === desk.index) return this.agents.get(av.id);
    }
    return null;
  }

  ring(ctx, iso, av, t) {
    const p = iso.p(av.gx, av.gy);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, (26 + Math.sin(t * 4) * 2) * iso.z, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 * iso.z;
    ctx.setLineDash([7 * iso.z, 6 * iso.z]);
    ctx.stroke();
    ctx.restore();
  }

  spotlight(ctx, iso) {
    const c = iso.p(ROOM.w / 2, ROOM.h / 2);
    const g = ctx.createRadialGradient(c.x, c.y - 40, 10, c.x, c.y, Math.max(iso.w, iso.h) * 0.72);
    g.addColorStop(0, 'rgba(120,160,220,0.16)');
    g.addColorStop(1, 'rgba(8,11,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, iso.w, iso.h);
  }

  vignette(ctx, iso) {
    const g = ctx.createRadialGradient(iso.w / 2, iso.h / 2, Math.min(iso.w, iso.h) * 0.32, iso.w / 2, iso.h / 2, Math.max(iso.w, iso.h) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(3,6,14,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, iso.w, iso.h);
  }

  door(ctx, iso, t) {
    const pts = [iso.p(DOOR.gx - 0.7, DOOR.gy - 0.5), iso.p(DOOR.gx + 0.7, DOOR.gy - 0.5), iso.p(DOOR.gx + 0.7, DOOR.gy + 0.4), iso.p(DOOR.gx - 0.7, DOOR.gy + 0.4)];
    poly(ctx, pts, '#3b4d63', alpha('#ffffff', 0.18));
    const c = iso.p(DOOR.gx, DOOR.gy - 0.05);
    ctx.fillStyle = alpha('#9fd8ff', 0.55 + 0.2 * Math.sin(t * 2));
    ctx.font = `700 ${Math.max(6, 9 * iso.z)}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('ENTRANCE', c.x, c.y);
    ctx.textAlign = 'left';
  }
}

const STATE_LABEL = {
  booting: 'STARTING UP', idle: 'IDLE', walking: 'WALKING', thinking: 'THINKING',
  working: 'WORKING', blocked: 'NEEDS INPUT', error: 'ERRORED', done: 'DONE',
  coffee: 'BREAK', leaving: 'WRAPPING UP',
};

class Avatar {
  constructor(office, agent) {
    this.id = agent.id;
    this.office = office;
    this.desk = agent.parent ? null : office.claimDesk(agent.id);
    this.seat = agent.parent ? office.claimSeat(agent.id) : null;
    this.gx = DOOR.gx;
    this.gy = DOOR.gy;
    this.tx = this.gx;
    this.ty = this.gy;
    this.phase = Math.random() * 6.28;
    this.dir = 1;
    this.seated = false;
    this.gone = false;
    this.fade = 1;
    this.mood = 'walk';
    this.holdTimer = 0;
    this.break = null;
    this.scr = 0;
    this.skin = SKIN[hash(agent.id) % SKIN.length];
    this.hair = HAIR[hash(agent.id + 'h') % HAIR.length];
    this.shirt = agent.color;
    const slot = this.desk !== null ? this.desk : this.seat !== null ? this.seat + 5 : hash(agent.id) % 4;
    this.lift = (slot % 2) * 38;
    this.lastToolCalls = agent.toolCalls || 0;
    this.burst = [];
    this.running = false;
    this.jump = 0;
    this.arrivedAt = 0;
    this.targetFor = null;
  }

  home() {
    if (this.desk !== null) return { gx: SEATS[this.desk].gx, gy: SEATS[this.desk].gy };
    if (this.seat !== null) return MEETING[this.seat];
    return { gx: 5.2 + (hash(this.id) % 5) * 0.4, gy: 6.9 };
  }

  update(dt, agent) {
    const state = this.gone ? 'leaving' : (agent?.state || 'idle');
    if (!this.gone && agent) this.trackBurst(agent);

    let want = this.home();
    if (this.gone) want = DOOR;
    else if (state === 'booting' || state === 'walking') want = this.home();
    else if (state === 'coffee' || this.break) want = this.break || (this.break = pickBreak(this.id));
    else if (state === 'leaving') want = DOOR;
    else if (state === 'idle') {
      this.holdTimer += dt;
      if (this.holdTimer > 7 && !this.break) { this.break = pickBreak(this.id); this.holdTimer = 0; }
      want = this.break || this.home();
    } else if (this.break) {
      this.break = null;
    }

    if (state === 'working' || state === 'thinking' || state === 'blocked' || state === 'error' || state === 'done') {
      if (this.desk !== null || this.seat !== null) want = this.home();
    }

    this.seated = !this.gone && this.at(want) && ['working', 'thinking', 'blocked', 'error'].includes(state) && (this.desk !== null);
    if (this.targetFor !== state + JSON.stringify(want)) {
      this.targetFor = state + JSON.stringify(want);
      this.tx = want.gx;
      this.ty = want.gy;
    }

    const dx = this.tx - this.gx, dy = this.ty - this.gy;
    const dist = Math.hypot(dx, dy);
    const speed = (this.running ? 2.6 : 1.55) * (state === 'done' ? 0.8 : 1);
    if (dist > 0.04) {
      const step = Math.min(dist, speed * dt);
      const nx = this.gx + (dx / dist) * step;
      const ny = this.gy + (dy / dist) * step;
      this.gx = this.gx + (avoid(nx, ny).gx - this.gx) * 0.75;
      this.gy = this.gy + (avoid(nx, ny).gy - this.gy) * 0.75;
      const spd = this.isoScreenSpeed();
      this.dir = spd >= 0 ? 1 : -1;
      this.phase += dt * (this.running ? 17 : 11);
      this.mood = 'walk';
      this.scr = 0;
    } else {
      this.mood = state;
      this.phase += dt * 3;
      this.arrivedAt += dt;
    }
    if (state === 'done' && this.jump <= 0 && this.at(want) && Math.random() < dt * 0.7) this.jump = 1;
    if (this.jump > 0) this.jump = Math.max(0, this.jump - dt * 1.7);
    // Seated, the camera is behind them: they face the screen, not us.
    if (this.seated) this.dir = 0;
    if (this.gone) {
      this.fade -= dt * 0.35;
      if (this.fade <= 0 || (this.at(DOOR) && this.fade < 0.6)) this.alive = false;
    }
    this.running = this.burst.length > 0 && Date.now() - this.burst[this.burst.length - 1] < 2600 && this.burst.length >= 3;
  }

  trackBurst(agent) {
    const now = Date.now();
    if ((agent.toolCalls || 0) > this.lastToolCalls) {
      this.burst.push(now);
      this.lastToolCalls = agent.toolCalls || 0;
    }
    this.burst = this.burst.filter((t) => now - t < 4000);
  }

  isoScreenSpeed() {
    const a = this.office.iso.p(this.gx, this.gy);
    const b = this.office.iso.p(this.gx + (this.tx - this.gx), this.gy + (this.ty - this.gy));
    return b.x - a.x;
  }

  at(p) { return Math.hypot(p.gx - this.gx, p.gy - this.gy) < 0.09; }

  ground(iso) { return iso.p(this.gx, this.gy); }

  draw(iso, ctx, t) {
    const s = iso.z;
    const g = this.ground(iso);
    const walking = this.mood === 'walk';
    const bob = walking ? Math.abs(Math.sin(this.phase)) * 2.4 * s : Math.sin(t * 1.6 + this.phase) * 0.9 * s;
    const jump = this.jump > 0 ? Math.sin((1 - this.jump) * Math.PI) * 16 * s : 0;
    const shake = this.mood === 'error' ? Math.sin(t * 26) * 1.6 * s : 0;
    const x = g.x + shake;
    const baseY = g.y - jump;
    const sitLift = this.seated ? 13 * s : 0;
    const y = baseY - bob - sitLift;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.fade));
    ellipseShadow(iso, ctx, this.gx, this.gy, 0.2, 0.09, 'rgba(18,12,6,0.34)');

    if (this.running && walking) {
      ctx.strokeStyle = alpha('#ffffff', 0.4);
      ctx.lineWidth = 1.6 * s;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x - this.dir * (10 + i * 8) * s, y - (12 + i * 5) * s);
        ctx.lineTo(x - this.dir * (20 + i * 9) * s, y - (12 + i * 5) * s);
        ctx.stroke();
      }
    }

    // legs
    const swing = walking ? Math.sin(this.phase) * 5.5 * s : 0;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2a3342';
    ctx.lineWidth = 4.6 * s;
    if (this.seated) {
      ctx.beginPath();
      ctx.moveTo(x - 3 * s, y - 12 * s);
      ctx.lineTo(x - 3 * s + this.dir * 6 * s, y - 2 * s);
      ctx.moveTo(x + 3 * s, y - 12 * s);
      ctx.lineTo(x + 3 * s + this.dir * 6 * s, y - 2 * s);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - 2.6 * s, y - 15 * s);
      ctx.lineTo(x - 2.6 * s + swing, y);
      ctx.moveTo(x + 2.6 * s, y - 15 * s);
      ctx.lineTo(x + 2.6 * s - swing, y);
      ctx.stroke();
    }

    // torso
    const torsoH = 20 * s;
    roundRect(ctx, x - 7 * s, y - 15 * s - torsoH, 14 * s, torsoH, 4 * s, this.shirt, alpha('#000000', 0.28), 1.2 * s);
    poly(ctx, [{ x: x - 7 * s, y: y - 15 * s - torsoH }, { x, y: y - 15 * s - torsoH + 4 * s }, { x: x + 7 * s, y: y - 15 * s - torsoH }],
      alpha('#ffffff', 0.16));

    // arms
    const shoulderY = y - 30 * s;
    ctx.strokeStyle = shade(this.shirt, -0.18);
    ctx.lineWidth = 3.6 * s;
    if (this.seated) {
      const tap = Math.sin(this.phase * 3.4) * 2 * s;
      ctx.beginPath();
      ctx.moveTo(x - 6.5 * s, shoulderY);
      ctx.lineTo(x - 12 * s + this.dir * 4 * s, shoulderY + 9 * s + tap);
      ctx.moveTo(x + 6.5 * s, shoulderY);
      ctx.lineTo(x + 12 * s + this.dir * 4 * s, shoulderY + 9 * s - tap);
      ctx.stroke();
    } else if (walking) {
      const arm = Math.sin(this.phase + Math.PI) * 5 * s;
      ctx.beginPath();
      ctx.moveTo(x - 6.5 * s, shoulderY);
      ctx.lineTo(x - 8 * s - arm * 0.4, shoulderY + 11 * s + arm);
      ctx.moveTo(x + 6.5 * s, shoulderY);
      ctx.lineTo(x + 8 * s + arm * 0.4, shoulderY + 11 * s - arm);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - 6.5 * s, shoulderY);
      ctx.lineTo(x - 8.5 * s, shoulderY + 12 * s);
      ctx.moveTo(x + 6.5 * s, shoulderY);
      ctx.lineTo(x + 8.5 * s, shoulderY + 12 * s);
      ctx.stroke();
    }

    // head
    const headY = y - 40 * s;
    ctx.beginPath();
    ctx.arc(x, headY, 7.2 * s, 0, Math.PI * 2);
    ctx.fillStyle = this.skin;
    ctx.fill();
    ctx.strokeStyle = alpha('#000000', 0.25);
    ctx.lineWidth = 1 * s;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, headY - 1.6 * s, 7.4 * s, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(x, headY - 1.6 * s);
    ctx.fillStyle = this.hair;
    ctx.fill();
    if (this.dir > 0) {
      ctx.fillStyle = 'rgba(30,25,20,0.85)';
      ctx.beginPath();
      ctx.arc(x + 2.4 * s, headY + 0.6 * s, 0.95 * s, 0, Math.PI * 2);
      ctx.arc(x + 4.6 * s, headY + 0.6 * s, 0.95 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.break) {
      ctx.fillStyle = '#c98a5a';
      roundRect(ctx, x + 9 * s, y - 30 * s, 6 * s, 6 * s, 1.5 * s, '#e8e2d6', alpha('#000', 0.3), 1 * s);
    }
    ctx.restore();
  }

  bubbleGeo(iso, agent) {
    if (!agent || this.gone) return null;
    const g = this.ground(iso);
    // Never let the bubble shrink below ~9px text: a name nobody can read is not a name.
    const k = Math.max(0.8, Math.min(1.05, iso.z * 1.6));
    const w = 210;
    // 89 is what name + activity + bar + the two stats rows actually need; the activity
    // line now wraps to two rows, so the box carries room for both.
    const h = 89 + 11 + (castLine(agent) ? 11 : 0);
    const halfW = (w / 2) * k;
    const cx = Math.max(halfW + 6, Math.min(iso.w - halfW - 6, g.x));
    const cy = Math.max(h * k + 14, g.y - 104 * k) - this.lift * k;
    return { g, k, w, h, cx, cy, accent: stateColor(agent.state) };
  }

  bubble(iso, ctx, t, agent, geo) {
    if (!agent || this.gone) return;
    const box = geo || this.bubbleGeo(iso, agent);
    if (!box) return;
    const { g, k, w, h, cx, cy, accent } = box;
    const cast = castLine(agent);
    const hasProgress = agent.todoTotal > 0;

    ctx.save();
    ctx.strokeStyle = alpha(accent, 0.45);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y - 46 * k);
    ctx.lineTo(cx, cy + 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    const x = -w / 2;
    const y = -h;
    const pad = 11;

    roundRect(ctx, x, y, w, h, 11, 'rgba(11,17,29,0.94)', accent, 1.7);
    poly(ctx, [{ x: -6, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 9 }], 'rgba(11,17,29,0.94)');

    ctx.textBaseline = 'top';
    ctx.font = '800 12px ui-sans-serif, system-ui';
    ctx.fillStyle = '#f2f6ff';
    ctx.fillText(fit(agent.name, 23), x + pad, y + 9);
    ctx.font = '700 9px ui-monospace, monospace';
    ctx.fillStyle = accent;
    const label = this.running ? 'SPRINTING' : (STATE_LABEL[agent.state] || 'IDLE');
    ctx.fillText(label, x + w - pad - ctx.measureText(label).width, y + 11);

    ctx.font = '600 10px ui-sans-serif, system-ui';
    ctx.fillStyle = 'rgba(226,235,248,0.88)';
    const said = wrapWords(agent.activity || 'no news yet', 40, 2);
    said.forEach((line, i) => ctx.fillText(line, x + pad, y + 27 + i * 11));

    let barY = y + 43 + Math.max(0, said.length - 1) * 11;
    if (hasProgress) {
      const ratio = Math.max(0, Math.min(1, agent.todoDone / agent.todoTotal));
      roundRect(ctx, x + pad, barY, w - pad * 2, 7, 3.5, 'rgba(255,255,255,0.14)');
      roundRect(ctx, x + pad, barY, (w - pad * 2) * ratio, 7, 3.5, accent);
      ctx.font = '700 8.5px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(236,243,255,0.82)';
      const eta = estRemaining(agent);
      ctx.fillText(`${Math.round(ratio * 100)}% of its plan${eta ? ` · about ${eta} left` : ''}`, x + pad, barY + 10);
      barY += 22;
    } else {
      shimmer(ctx, x + pad, barY, w - pad * 2, 7, accent, t);
      ctx.font = '700 8.5px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(210,222,240,0.72)';
      ctx.fillText('no plan yet', x + pad, barY + 10);
      barY += 22;
    }
    if (cast) {
      ctx.font = '700 8.5px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(255,209,102,0.9)';
      ctx.fillText(cast, x + pad, barY + 1);
      barY += 11;
    }
    ctx.font = '600 8.5px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(198,212,235,0.75)';
    const tokens = (agent.tokensIn || 0) + (agent.tokensOut || 0);
    const took = agent.durationMs != null ? `${Math.round(agent.durationMs / 100) / 10}s` : '';
    const money = agent.costUsd ? `$${agent.costUsd.toFixed(4)}` : '';
    ctx.fillText(`${shortModel(agent.model)} · ${agent.turns} ${agent.turns === 1 ? 'round' : 'rounds'} · ${agent.toolCalls} ${agent.toolCalls === 1 ? 'thing done' : 'things done'}`, x + pad, barY + 2);
    ctx.fillStyle = 'rgba(198,212,235,0.6)';
    const usage = [tokens ? `${kfmt(tokens)} tokens` : '', money, took].filter(Boolean).join(' · ');
    ctx.fillText(usage || 'nothing measured yet', x + pad, barY + 12);
    ctx.restore();
  }
}

function castLine(agent) {
  const skills = uniq((agent.skillsUsed || []).slice(-2).map((s) => `${s.name}${s.failed ? ' (did not work)' : ''}`));
  const subs = uniq((agent.agentsUsed || []).slice(-2).map((a) => a.name));
  const parts = [];
  if (subs.length) parts.push(`with ${subs.join(' + ')}`);
  if (skills.length) parts.push(`using ${skills.join(' + ')}`);
  return parts.length ? fit(`It ${parts.join(' · ')}.`, 46) : '';
}

function uniq(list) {
  const out = [];
  for (const x of list) if (x && !out.includes(x)) out.push(x);
  return out;
}

// Break on spaces, never inside a word, and stop at `max` lines with an ellipsis.
function wrapWords(text, width, max) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
      if (lines.length === max) { lines[max - 1] = `${lines[max - 1].slice(0, width - 1)}…`; return lines; }
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, max);
}

function shortModel(m) {
  if (!m) return 'default model';
  return String(m).replace(/^claude-/, '').replace(/-\d{4}.*$/, '');
}

function shimmer(ctx, x, y, w, h, color, t) {
  roundRect(ctx, x, y, w, h, 3, 'rgba(255,255,255,0.10)');
  const pos = ((t * 0.35) % 1) * (w + 40) - 20;
  const g = ctx.createLinearGradient(x + pos - 30, 0, x + pos + 30, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, alpha(color, 0.85));
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  roundRect(ctx, x, y, w, h, 3, null);
  ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function estRemaining(agent) {
  if (!agent.todoTotal || !agent.todoDone) return null;
  const elapsed = (Date.now() - agent.startedAt) / 1000;
  if (elapsed < 12) return null;
  const remain = (elapsed / agent.todoDone) * (agent.todoTotal - agent.todoDone);
  if (remain < 1 || remain > 7200) return null;
  return remain > 120 ? `${Math.round(remain / 60)}m` : `${Math.round(remain)}s`;
}

function pickBreak(id) {
  return hash(id) % 2 ? { ...WATER } : { ...COFFEE };
}

function avoid(gx, gy) {
  for (const block of [{ gx: 6, gy: 4.2, r: 0.9 }, { gx: 9, gy: 3.9, r: 0.7 }]) {
    const dx = gx - block.gx, dy = gy - block.gy;
    const d = Math.hypot(dx, dy);
    if (d < block.r && d > 0.001) return { gx: block.gx + (dx / d) * block.r, gy: block.gy + (dy / d) * block.r };
  }
  return { gx, gy };
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

function kfmt(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function fit(s, n) {
  s = String(s || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
