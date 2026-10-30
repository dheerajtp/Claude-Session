import { C, box, poly, wallRect, shade, alpha, cyl, stateColor, ellipseShadow } from './iso.js';

const px = (iso, v) => v * iso.z;

export const paint = {
  rug(iso, ctx, it) {
    const pts = [
      iso.p(it.gx - it.w / 2, it.gy - it.d / 2),
      iso.p(it.gx + it.w / 2, it.gy - it.d / 2),
      iso.p(it.gx + it.w / 2, it.gy + it.d / 2),
      iso.p(it.gx - it.w / 2, it.gy + it.d / 2),
    ];
    poly(ctx, pts, it.color || C.rug);
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = shade(it.color || C.rug, 0.4);
    ctx.lineWidth = Math.max(1, px(iso, 2.5));
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const p = pts[i];
      const cx = (pts[0].x + pts[2].x) / 2, cy = (pts[0].y + pts[2].y) / 2;
      const q = { x: cx + (p.x - cx) * 0.82, y: cy + (p.y - cy) * 0.82 };
      i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  },

  desk(iso, ctx, it, t, agent) {
    const { gx, gy } = it;
    const top = 30;
    ellipseShadow(iso, ctx, gx, gy + 0.12, 0.62, 0.26);
    box(iso, ctx, gx, gy, 1.55, 0.92, 4, { top: shade(C.wood, 0.1), right: C.woodMid, left: C.woodDark }, alpha(C.ink, 0.12), top - 4);
    box(iso, ctx, gx, gy, 1.55, 0.92, top - 4, { top: alpha(C.woodDark, 0.35), right: shade(C.woodDark, -0.25), left: shade(C.woodDark, -0.35) }, null);
    box(iso, ctx, gx + 0.5, gy + 0.05, 0.45, 0.62, top - 5, { top: shade(C.wood, -0.1), right: C.woodDark, left: shade(C.woodDark, -0.14) }, alpha(C.ink, 0.12));
    for (let i = 0; i < 2; i++) {
      box(iso, ctx, gx + 0.5, gy + 0.22 - i * 0.22, 0.02, 0.16, 2, { top: C.metal, right: C.metalDark, left: C.metalDark }, null, top - 16 + i * 11);
    }

    const mx = gx - 0.2, my = gy - 0.2;
    const glow = stateColor(agent ? agent.state : 'idle');
    const live = agent && ['working', 'thinking', 'blocked', 'booting'].includes(agent.state);
    box(iso, ctx, mx, my, 0.3, 0.22, 3, { top: C.metalDark, right: '#1a2130', left: '#161d29' }, null, top);
    box(iso, ctx, mx, my, 0.09, 0.09, 11, { top: C.metal, right: C.metalDark, left: C.metalDark }, null, top + 3);
    monitor(iso, ctx, mx, my, 0.66, 42, top + 14, glow, live ? t : null, agent);

    // keyboard + mouse sit between the screen and the seat, on the same screen axis
    box(iso, ctx, gx + 0.16, gy + 0.16, 0.5, 0.16, 2, { top: '#eceef4', right: '#c3c9d4', left: '#aeb5c2' }, alpha(C.ink, 0.1), top);
    box(iso, ctx, gx + 0.44, gy + 0.3, 0.11, 0.15, 2, { top: '#dfe3ea', right: '#b3bac6', left: '#a7aebb' }, null, top);
    cyl(iso, ctx, gx - 0.62, gy - 0.1, 0.07, 9, { top: '#f6f7fa', side0: shade(C.pot, -0.15), side1: C.pot }, top);
    box(iso, ctx, gx + 0.3, gy - 0.3, 0.36, 0.28, 1.6, { top: C.paper, right: shade(C.paper, -0.16), left: shade(C.paper, -0.24) }, alpha(C.ink, 0.08), top);
    if (agent) statusLamp(iso, ctx, mx - 0.4, my - 0.06, glow, live, t);
  },

  chair(iso, ctx, it) {
    const { gx, gy } = it;
    const back = it.back == null ? -0.21 : it.back;
    ellipseShadow(iso, ctx, gx, gy, 0.3, 0.13);
    box(iso, ctx, gx, gy, 0.44, 0.44, 2, { top: C.plasticDark, right: '#1a2130', left: '#161d29' }, null, 16);
    box(iso, ctx, gx, gy, 0.44, 0.44, 14, { top: shade(C.fabric, 0.14), right: C.fabricDark, left: shade(C.fabricDark, -0.12) }, alpha(C.ink, 0.12), 2);
    cyl(iso, ctx, gx, gy, 0.05, 14, { top: C.metal, side0: '#232c3a', side1: '#394455' });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      box(iso, ctx, gx + Math.cos(a) * 0.17, gy + Math.sin(a) * 0.17, 0.09, 0.09, 2, { top: '#222a38', right: '#161d29', left: '#161d29' });
    }
    box(iso, ctx, gx, gy + back, 0.44, 0.1, 22, { top: shade(C.fabric, 0.2), right: shade(C.fabric, -0.06), left: C.fabricDark }, alpha(C.ink, 0.12), 16);
    box(iso, ctx, gx - 0.24, gy - 0.02, 0.07, 0.3, 8, { top: C.fabric, right: C.fabricDark, left: C.fabricDark }, null, 18);
    box(iso, ctx, gx + 0.24, gy - 0.02, 0.07, 0.3, 8, { top: C.fabric, right: C.fabricDark, left: C.fabricDark }, null, 18);
  },

  plant(iso, ctx, it, t) {
    const { gx, gy } = it;
    ellipseShadow(iso, ctx, gx, gy, 0.24, 0.1);
    const sway = Math.sin(t * 0.7 + gx * 1.7) * 0.02;
    cyl(iso, ctx, gx, gy, 0.2, 18, { top: shade(C.pot, 0.2), side0: shade(C.pot, -0.24), side1: C.pot });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + sway;
      const len = 0.2 + (i % 3) * 0.06;
      const root = iso.p(gx, gy, 20);
      const tip = iso.p(gx + Math.cos(a) * len, gy + Math.sin(a) * len, 44 + (i % 2) * 14);
      ctx.beginPath();
      ctx.moveTo(root.x, root.y);
      ctx.quadraticCurveTo(root.x + (tip.x - root.x) * 0.45, tip.y - px(iso, 20), tip.x, tip.y);
      ctx.strokeStyle = i % 2 ? C.leafA : C.leafB;
      ctx.lineWidth = Math.max(1.4, px(iso, 4));
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(tip.x, tip.y, px(iso, 8), px(iso, 4.5), a, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? shade(C.leafA, 0.1) : C.leafB;
      ctx.fill();
    }
  },

  cooler(iso, ctx, it, t) {
    const { gx, gy } = it;
    ellipseShadow(iso, ctx, gx, gy, 0.24, 0.11);
    box(iso, ctx, gx, gy, 0.36, 0.36, 42, { top: '#e4eaf2', right: '#c4cedb', left: '#a9b5c5' }, alpha(C.ink, 0.12));
    cyl(iso, ctx, gx, gy - 0.01, 0.15, 28, { top: alpha(C.glass, 0.95), side0: 'rgba(143,201,238,0.8)', side1: 'rgba(196,229,255,0.9)' }, 42);
    box(iso, ctx, gx + 0.19, gy + 0.19, 0.08, 0.08, 1.5, { top: C.paper, right: shade(C.paper, -0.2), left: shade(C.paper, -0.2) }, null, 44);
    const drip = iso.p(gx, gy + 0.19, 34 - ((t * 22) % 20));
    ctx.beginPath();
    ctx.arc(drip.x, drip.y, px(iso, 2.2), 0, Math.PI * 2);
    ctx.fillStyle = alpha('#8fd8ff', 0.75);
    ctx.fill();
  },

  table(iso, ctx, it) {
    const { gx, gy } = it;
    ellipseShadow(iso, ctx, gx, gy, 0.7, 0.32);
    cyl(iso, ctx, gx, gy, 0.13, 26, { top: C.metalDark, side0: '#2a3342', side1: C.plasticDark });
    cyl(iso, ctx, gx, gy, 0.74, 5, { top: shade(C.wood, 0.26), side0: C.woodDark, side1: C.woodMid }, 26);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      box(iso, ctx, gx + Math.cos(a) * 0.24, gy + Math.sin(a) * 0.24, 0.16, 0.12, 1.5, { top: C.paper, right: shade(C.paper, -0.2), left: shade(C.paper, -0.25) }, null, 31);
    }
    cyl(iso, ctx, gx + 0.06, gy - 0.1, 0.06, 7, { top: '#f2f4f8', side0: shade(C.pot, -0.15), side1: C.pot }, 31);
  },

  sofa(iso, ctx, it) {
    const { gx, gy } = it;
    ellipseShadow(iso, ctx, gx, gy + 0.1, 0.78, 0.34);
    box(iso, ctx, gx, gy + 0.06, 1.5, 0.62, 12, { top: shade(C.fabric, 0.16), right: C.fabricDark, left: shade(C.fabricDark, -0.1) }, alpha(C.ink, 0.1), 6);
    box(iso, ctx, gx, gy + 0.06, 1.5, 0.62, 6, { top: shade(C.fabricDark, -0.2), right: '#26303f', left: '#1e2734' });
    box(iso, ctx, gx, gy - 0.3, 1.5, 0.2, 26, { top: shade(C.fabric, 0.22), right: shade(C.fabric, -0.04), left: C.fabricDark }, alpha(C.ink, 0.1), 18);
    box(iso, ctx, gx - 0.72, gy, 0.16, 0.72, 20, { top: shade(C.fabric, 0.08), right: C.fabricDark, left: shade(C.fabricDark, -0.12) }, null, 12);
    box(iso, ctx, gx + 0.72, gy, 0.16, 0.72, 20, { top: shade(C.fabric, 0.08), right: C.fabricDark, left: shade(C.fabricDark, -0.12) }, null, 12);
    for (let i = -1; i <= 1; i += 2) {
      box(iso, ctx, gx + i * 0.34, gy + 0.16, 0.42, 0.3, 4, { top: shade(C.fabric, 0.3), right: shade(C.fabric, 0.02), left: shade(C.fabric, -0.08) }, alpha(C.ink, 0.08), 18);
    }
  },

  cabinet(iso, ctx, it) {
    const { gx, gy } = it;
    ellipseShadow(iso, ctx, gx, gy + 0.05, 0.34, 0.16);
    box(iso, ctx, gx, gy, 0.62, 0.5, 46, { top: shade(C.metal, 0.22), right: C.metalDark, left: shade(C.metalDark, -0.14) }, alpha(C.ink, 0.16));
    for (let i = 0; i < 3; i++) {
      box(iso, ctx, gx + 0.32, gy - 0.12 + i * 0.12, 0.02, 0.1, 2, { top: '#dfe4ec', right: '#9aa4b2', left: '#9aa4b2' }, null, 38 - i * 13);
      wallRect(iso, ctx, 'x', gx - 0.3, gx + 0.3, 44 - i * 14, 45 - i * 14, alpha(C.ink, 0.1));
    }
  },

  printer(iso, ctx, it, t) {
    const { gx, gy } = it;
    box(iso, ctx, gx, gy, 0.56, 0.48, 16, { top: '#e9edf3', right: '#c5ccd8', left: '#adb5c2' }, alpha(C.ink, 0.14), 44);
    box(iso, ctx, gx, gy, 0.5, 0.4, 6, { top: '#dfe4ec', right: '#b8c0cd', left: '#a6afbd' }, alpha(C.ink, 0.1), 60);
    box(iso, ctx, gx - 0.02, gy + 0.3, 0.4, 0.03, 1.5, { top: C.paper, right: shade(C.paper, -0.2), left: shade(C.paper, -0.25) }, null, 50);
    const led = iso.p(gx + 0.24, gy + 0.2, 62);
    ctx.beginPath();
    ctx.arc(led.x, led.y, Math.max(1.4, px(iso, 2.6)), 0, Math.PI * 2);
    ctx.fillStyle = Math.sin(t * 5) > 0 ? '#7ce4a8' : '#414c5e';
    ctx.fill();
  },

  rack(iso, ctx, it, t) {
    const { gx, gy } = it;
    ellipseShadow(iso, ctx, gx, gy + 0.05, 0.44, 0.2);
    box(iso, ctx, gx, gy, 0.72, 0.6, 66, { top: '#46536a', right: '#232c3b', left: '#1a2130' }, alpha(C.ink, 0.3));
    for (let i = 0; i < 8; i++) {
      const gz = 8 + i * 7.6;
      box(iso, ctx, gx + 0.37, gy + 0.31, 0.02, 0.5, 5, { top: '#6a7a92', right: '#33405a', left: '#2b3648' }, null, gz);
      const led = iso.p(gx + 0.38, gy + 0.52, gz + 2.5);
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(t * 3 + i * 0.9));
      ctx.beginPath();
      ctx.arc(led.x, led.y, Math.max(1.2, px(iso, 2.4)), 0, Math.PI * 2);
      ctx.fillStyle = i % 3 === 0 ? alpha('#4DE1C1', pulse) : alpha('#FFB454', pulse * 0.8);
      ctx.fill();
    }
    const label = iso.p(gx + 0.37, gy - 0.02, 74);
    ctx.fillStyle = alpha('#dbe4f0', 0.75);
    ctx.font = `700 ${Math.max(7, 9 * iso.z)}px ui-sans-serif, system-ui`;
    ctx.fillText('MODEL', label.x - 14, label.y);
  },

  lamp(iso, ctx, it, t) {
    const { gx, gy } = it;
    cyl(iso, ctx, gx, gy, 0.16, 4, { top: C.metalDark, side0: '#232c3a', side1: '#2f3948' });
    box(iso, ctx, gx, gy, 0.05, 0.05, 72, { top: C.metal, right: C.metalDark, left: C.metalDark }, null, 4);
    cyl(iso, ctx, gx + 0.14, gy, 0.22, 16, { top: '#f7e2ad', side0: '#d8b76f', side1: '#efce8e' }, 68);
    const c = iso.p(gx + 0.14, gy, 0);
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, px(iso, 78));
    g.addColorStop(0, `rgba(255,214,138,${0.2 + 0.03 * Math.sin(t * 1.3)})`);
    g.addColorStop(1, 'rgba(255,214,138,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, px(iso, 78), px(iso, 38), 0, 0, Math.PI * 2);
    ctx.fill();
  },

  bin(iso, ctx, it) {
    const { gx, gy } = it;
    cyl(iso, ctx, gx, gy, 0.17, 22, { top: '#3d4859', side0: '#28313f', side1: '#384457' });
    box(iso, ctx, gx + 0.05, gy - 0.04, 0.12, 0.07, 3, { top: C.paper, right: shade(C.paper, -0.2), left: C.paper }, null, 22);
  },

  coffee(iso, ctx, it, t) {
    const { gx, gy } = it;
    box(iso, ctx, gx, gy, 0.9, 0.5, 34, { top: shade(C.wood, 0.18), right: C.woodMid, left: C.woodDark }, alpha(C.ink, 0.12));
    box(iso, ctx, gx - 0.2, gy - 0.02, 0.3, 0.24, 18, { top: '#e8ecf2', right: '#cfd6e0', left: '#b9c1cd' }, alpha(C.ink, 0.12), 34);
    cyl(iso, ctx, gx + 0.22, gy, 0.11, 12, { top: '#3a2b22', side0: '#5a4235', side1: '#6b4e3d' }, 34);
    const s = iso.p(gx + 0.22, gy, 50);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#e9eef5';
    ctx.lineWidth = Math.max(1, px(iso, 2));
    for (let i = 0; i < 2; i++) {
      const ph = t * 1.2 + i * 1.9;
      ctx.beginPath();
      ctx.moveTo(s.x + i * px(iso, 6) - px(iso, 3), s.y);
      ctx.quadraticCurveTo(s.x + Math.sin(ph) * px(iso, 7), s.y - px(iso, 14), s.x + Math.sin(ph + 1) * px(iso, 5), s.y - px(iso, 28));
      ctx.stroke();
    }
    ctx.restore();
  },
};

function monitor(iso, ctx, gx, gy, w, hPx, gz, glow, t, agent) {
  const shell = [
    iso.p(gx - w / 2, gy + 0.02, gz + hPx), iso.p(gx + w / 2, gy + 0.02, gz + hPx),
    iso.p(gx + w / 2, gy + 0.02, gz), iso.p(gx - w / 2, gy + 0.02, gz),
  ];
  poly(ctx, shell, '#1c2431', alpha(C.ink, 0.35));
  const face = [
    iso.p(gx - w / 2 + 0.03, gy + 0.05, gz + hPx - 5), iso.p(gx + w / 2 - 0.03, gy + 0.05, gz + hPx - 5),
    iso.p(gx + w / 2 - 0.03, gy + 0.05, gz + 4), iso.p(gx - w / 2 + 0.03, gy + 0.05, gz + 4),
  ];
  const grad = ctx.createLinearGradient(face[0].x, face[0].y, face[2].x, face[2].y);
  grad.addColorStop(0, '#0e1626');
  grad.addColorStop(1, tint(glow, 0.16));
  poly(ctx, face, grad);

  ctx.save();
  ctx.beginPath();
  face.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
  if (t !== null) {
    const rows = 5;
    for (let i = 0; i < rows; i++) {
      const frac = (i + 1) / (rows + 1.4);
      const a = iso.p(gx - w / 2 + 0.08, gy + 0.05, gz + hPx * (1 - frac));
      const len = (0.16 + 0.52 * ((Math.sin(t * 2.4 + i * 2.3) + 1) / 2)) * w;
      const b = iso.p(gx - w / 2 + 0.08 + len, gy + 0.05, gz + hPx * (1 - frac));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = alpha(glow, i === rows - 1 ? 0.95 : 0.45);
      ctx.lineWidth = Math.max(1, px(iso, 2.2));
      ctx.stroke();
    }
    if (agent?.todoTotal > 0) {
      const ratio = agent.todoDone / agent.todoTotal;
      const p0 = iso.p(gx - w / 2 + 0.07, gy + 0.05, gz + 9);
      const p1 = iso.p(gx - w / 2 + 0.07 + (w - 0.14) * ratio, gy + 0.05, gz + 9);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1.5, px(iso, 3));
      ctx.stroke();
    }
  }
  ctx.restore();

  if (t !== null) {
    const c = iso.p(gx, gy + 0.06, gz + hPx / 2);
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, px(iso, 30));
    g.addColorStop(0, alpha(glow, 0.22));
    g.addColorStop(1, alpha(glow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, px(iso, 30), 0, Math.PI * 2);
    ctx.fill();
  }
}

function tint(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)},0.75)`;
}

function statusLamp(iso, ctx, gx, gy, glow, live, t) {
  box(iso, ctx, gx, gy, 0.05, 0.05, 10, { top: C.metal, right: C.metalDark, left: C.metalDark }, null, 30);
  const c = iso.p(gx, gy, 42);
  const pulse = live ? 0.5 + 0.5 * Math.sin(t * 5) : 0.28;
  ctx.beginPath();
  ctx.arc(c.x, c.y, Math.max(1.6, px(iso, 3.2)), 0, Math.PI * 2);
  ctx.fillStyle = alpha(glow, pulse);
  ctx.fill();
  if (!live) return;
  const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, px(iso, 16));
  g.addColorStop(0, alpha(glow, 0.32));
  g.addColorStop(1, alpha(glow, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, px(iso, 16), 0, Math.PI * 2);
  ctx.fill();
}

export function paintWallBody(iso, ctx, roomW, roomH, wallH) {
  poly(ctx, [iso.p(0, 0, wallH), iso.p(roomW, 0, wallH), iso.p(roomW, 0, 0), iso.p(0, 0, 0)], C.wallShade);
  poly(ctx, [iso.p(0, 0, wallH), iso.p(0, roomH, wallH), iso.p(0, roomH, 0), iso.p(0, 0, 0)], C.wall);
  poly(ctx, [iso.p(0, 0, wallH), iso.p(roomW, 0, wallH), iso.p(roomW, 0.16, wallH - 7), iso.p(0.16, 0, wallH - 7)], shade(C.wallTop, 0.18));
  poly(ctx, [iso.p(0, 0, wallH), iso.p(0, roomH, wallH), iso.p(0, roomH + 0.16, wallH - 7), iso.p(0, 0.16, wallH - 7)], C.wallTop);
  wallRect(iso, ctx, 'x', 0, roomW, 0, 10, C.baseboard);
  wallRect(iso, ctx, 'y', 0, roomH, 0, 10, shade(C.baseboard, -0.1));
  for (let i = 1; i < roomW; i++) wallRect(iso, ctx, 'x', i - 0.012, i + 0.012, 10, wallH - 12, alpha(C.ink, 0.055));
  for (let i = 1; i < roomH; i++) wallRect(iso, ctx, 'y', i - 0.012, i + 0.012, 10, wallH - 12, alpha(C.ink, 0.075));

  const fade = ctx.createLinearGradient(iso.p(0, 0, wallH).x, iso.p(0, 0, wallH).y, iso.p(roomW, 0, 0).x, iso.p(roomW, 0, 0).y);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,0.14)');
  poly(ctx, [iso.p(0, 0, wallH), iso.p(roomW, 0, wallH), iso.p(roomW, 0, 0), iso.p(0, 0, 0)], fade);
  const glowFloor = iso.p(roomW * 0.5, 0, 0);
  const amb = ctx.createRadialGradient(glowFloor.x, glowFloor.y, 0, glowFloor.x, glowFloor.y, px(iso, 300));
  amb.addColorStop(0, 'rgba(255,246,224,0.10)');
  amb.addColorStop(1, 'rgba(255,246,224,0)');
  poly(ctx, [iso.p(0, 0, wallH), iso.p(roomW, 0, wallH), iso.p(roomW, 0, 0), iso.p(0, 0, 0)], amb);
}

// Text lying in a wall plane. Wall 'x' descends to the right (+gx), wall 'y' descends to the
// left (+gy), so 'y' text is anchored at its high-gy end and advances up-right.
function wallText(iso, ctx, wall, at, gz, text, font, color) {
  const p = wall === 'x' ? iso.p(at, 0, gz) : iso.p(0, at, gz);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.transform(1, wall === 'x' ? 0.5 : -0.5, 0, 1, 0, 0);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function paintWallItems(iso, ctx, items, api) {
  const H = 172;
  for (const item of items) {
    const { wall, from, to } = item;
    if (item.kind === 'window') {
      wallRect(iso, ctx, wall, from + 0.14, to - 0.14, 64, H - 34, alpha(C.glass, 0.55), alpha('#ffffff', 0.4));
      const sky = ctx.createLinearGradient(0, iso.p(from, 0, H - 34).y, 0, iso.p(from, 0, 64).y);
      sky.addColorStop(0, 'rgba(168,214,255,0.85)');
      sky.addColorStop(1, 'rgba(236,248,255,0.5)');
      wallRect(iso, ctx, wall, from + 0.2, to - 0.2, 66, H - 36, sky);
      wallRect(iso, ctx, wall, (from + to) / 2 - 0.035, (from + to) / 2 + 0.035, 64, H - 34, shade(C.wall, -0.12));
      wallRect(iso, ctx, wall, from + 0.14, to - 0.14, (64 + H - 34) / 2, (64 + H - 34) / 2 + 5, shade(C.wall, -0.12));
      wallRect(iso, ctx, wall, from + 0.06, to - 0.06, H - 32, H - 24, shade(C.wall, 0.14));
      wallRect(iso, ctx, wall, from + 0.06, to - 0.06, 58, 66, shade(C.wall, 0.1));
    } else if (item.kind === 'kanban') {
      wallRect(iso, ctx, wall, from, to, 54, H - 16, '#f8f5ee', alpha(C.ink, 0.25));
      const cols = [['pending', 'QUEUED', '#e9e4da'], ['in_progress', 'DOING', '#ffe3a3'], ['completed', 'SHIPPED', '#c3e9cd']];
      const cw = (to - from - 0.34) / 3;
      cols.forEach(([status, label, noteColor], i) => {
        const c0 = from + 0.17 + i * cw, c1 = c0 + cw - 0.1;
        const list = api.todos.filter((t) => t.status === status);
        wallRect(iso, ctx, wall, c0, c1, 60, H - 40, shade('#ded8cd', -0.02 * i), alpha(C.ink, 0.12));
        list.slice(0, 7).forEach((todo, n) => {
          const topY = H - 46 - n * 14;
          wallRect(iso, ctx, wall, c0 + 0.04, c1 - 0.04, topY - 12, topY, noteColor, alpha(C.ink, 0.16));
          wallText(iso, ctx, wall, c1 - 0.07, topY - 5,
            String(todo.content || '').slice(0, Math.max(5, Math.floor(cw * 13))),
            `${Math.max(5, 6.5 * iso.z)}px ui-sans-serif, system-ui`, alpha(C.ink, 0.75));
        });
        wallText(iso, ctx, wall, c1 - 0.02, H - 31, `${label} ${list.length}`,
          `700 ${Math.max(6, 8 * iso.z)}px ui-sans-serif, system-ui`, C.ink);
      });
      wallText(iso, ctx, wall, to - 0.12, H - 20, 'TEAM BOARD · TodoWrite',
        `800 ${Math.max(7, 10.5 * iso.z)}px ui-sans-serif, system-ui`, C.ink);
    } else if (item.kind === 'sign') {
      wallRect(iso, ctx, wall, from, to, H - 66, H - 40, C.plasticDark, alpha('#ffffff', 0.14));
      wallText(iso, ctx, wall, from + 0.14, H - 55, item.text || 'AGENT OPS',
        `800 ${Math.max(7, 11 * iso.z)}px ui-sans-serif, system-ui`, '#eef4fb');
    } else if (item.kind === 'clock') {
      const at = (from + to) / 2;
      const c = wall === 'x' ? iso.p(at, 0, H - 52) : iso.p(0, at, H - 52);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.transform(1, wall === 'x' ? 0.5 : -0.5, 0, 1, 0, 0);
      const r = Math.max(4, px(iso, 14));
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = '#fbf9f4';
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      const mins = ((api.now % 3600000) / 3600000) * Math.PI * 2 - Math.PI / 2;
      const hrs = ((api.now % 43200000) / 43200000) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(hrs) * r * 0.5, Math.sin(hrs) * r * 0.5);
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(mins) * r * 0.75, Math.sin(mins) * r * 0.75);
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.stroke();
      ctx.restore();
    } else if (item.kind === 'poster') {
      wallRect(iso, ctx, wall, from, to, 70, H - 44, item.color || '#2b3a52', alpha(C.ink, 0.25));
      wallRect(iso, ctx, wall, from + 0.08, to - 0.08, 78, H - 52, alpha('#ffffff', 0.06));
      wallText(iso, ctx, wall, wall === 'x' ? from + 0.12 : to - 0.12, H - 62, item.text || '',
        `700 ${Math.max(6, 8.5 * iso.z)}px ui-sans-serif, system-ui`, alpha('#eef4fb', 0.92));
    }
  }
}
