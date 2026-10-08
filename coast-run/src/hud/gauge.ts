import { MAX_KMH } from '../game/constants';

const SIZE = 168, R = 66;
const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;   // 270 degree sweep
const ang = (v: number) => A0 + (Math.min(v, MAX_KMH) / MAX_KMH) * (A1 - A0);

/** Speed dial. Drawn in a 168 unit square, backed at device resolution. */
export function createGauge(canvas: HTMLCanvasElement): (kmh: number) => void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = SIZE * dpr; canvas.height = SIZE * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const cx = SIZE / 2, cy = SIZE / 2;
  let needle = 0;

  return kmh => {
    needle += (kmh - needle) * 0.18;
    ctx.clearRect(0, 0, SIZE, SIZE);

    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#ECEFF4';                                   // track
    ctx.beginPath(); ctx.arc(cx, cy, R, A0, A1); ctx.stroke();
    ctx.strokeStyle = '#D8443C';                                   // red zone
    ctx.beginPath(); ctx.arc(cx, cy, R, ang(285), A1); ctx.stroke();
    ctx.strokeStyle = '#1F5BD6';                                   // progress
    ctx.beginPath(); ctx.arc(cx, cy, R, A0, ang(needle)); ctx.stroke();

    ctx.strokeStyle = '#B8BFCC'; ctx.lineWidth = 2;                // ticks
    for (let v = 0; v <= MAX_KMH; v += 40) {
      const a = ang(v), i0 = R - 15, i1 = R - 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * i0, cy + Math.sin(a) * i0);
      ctx.lineTo(cx + Math.cos(a) * i1, cy + Math.sin(a) * i1);
      ctx.stroke();
    }

    const na = ang(needle);
    ctx.strokeStyle = '#0E1B30'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(na) * 9, cy - Math.sin(na) * 9);
    ctx.lineTo(cx + Math.cos(na) * (R - 19), cy + Math.sin(na) * (R - 19));
    ctx.stroke();
    ctx.fillStyle = '#0E1B30';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#0E1B30';
    ctx.font = '650 34px Archivo, system-ui, sans-serif';
    ctx.fillText(String(Math.round(kmh)), cx, cy + 40);
    ctx.fillStyle = '#5A6478';
    ctx.font = '600 10px Archivo, system-ui, sans-serif';
    ctx.fillText('KM/H', cx, cy + 54);
  };
}
