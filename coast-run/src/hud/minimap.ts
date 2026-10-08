import { ROAD_HALF } from '../game/constants';
import type { Pools } from '../entities/pools';
import type { State } from '../game/state';
import { curve } from '../world/curve';

const W = 132, H = 190, SPAN = 170, TAIL = 10;   // shows 170 m ahead, 10 m behind

export function createMinimap(canvas: HTMLCanvasElement, S: State, pools: Pools): () => void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const px = (x: number) => W / 2 + x * 2.6;
  const py = (dz: number) => H - 26 - (dz / SPAN) * (H - 40);

  return () => {
    const base = curve(S.dist);
    const off = (trackZ: number) => curve(trackZ) - base;
    const seen = (dz: number) => dz >= -TAIL && dz <= SPAN;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#F5F7FA'; ctx.fillRect(0, 0, W, H);

    ctx.beginPath();
    for (let dz = -TAIL; dz <= SPAN; dz += 10) {
      const X = px(off(S.dist + dz) - ROAD_HALF), Y = py(dz);
      if (dz === -TAIL) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    for (let dz = SPAN; dz >= -TAIL; dz -= 10) ctx.lineTo(px(off(S.dist + dz) + ROAD_HALF), py(dz));
    ctx.closePath();
    ctx.fillStyle = '#DADFE7'; ctx.fill();

    ctx.strokeStyle = '#E8A03C'; ctx.lineWidth = 1;                // centre line
    ctx.beginPath();
    for (let dz = -TAIL; dz <= SPAN; dz += 10) {
      const X = px(off(S.dist + dz)), Y = py(dz);
      if (dz === -TAIL) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    for (const t of pools.traffic) {
      const dz = t.trackZ - S.dist;
      if (!t.active || !seen(dz)) continue;
      ctx.fillStyle = t.dir < 0 ? '#D8443C' : '#5A6478';
      ctx.fillRect(px(t.laneX + off(t.trackZ)) - 2.5, py(dz) - 4, 5, 8);
    }
    ctx.fillStyle = '#E8A03C';
    for (const o of pools.obstacles) {
      const dz = o.trackZ - S.dist;
      if (!o.active || !seen(dz)) continue;
      ctx.fillRect(px(o.laneX + off(o.trackZ)) - 3, py(dz) - 2, 6, 4);
    }
    for (const c of pools.coins) {
      const dz = c.trackZ - S.dist;
      if (!c.active || !seen(dz)) continue;
      ctx.beginPath();
      ctx.arc(px(c.laneX + off(c.trackZ)), py(dz), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#7FAAF0';
    for (const p of pools.pads) {
      const dz = p.trackZ - S.dist;
      if (!p.active || !seen(dz)) continue;
      ctx.fillRect(px(p.laneX + off(p.trackZ)) - 3, py(dz) - 3, 6, 6);
    }
    ctx.fillStyle = '#1F5BD6';                                     // player
    ctx.fillRect(px(S.x) - 3, py(0) - 5, 6, 10);
  };
}
