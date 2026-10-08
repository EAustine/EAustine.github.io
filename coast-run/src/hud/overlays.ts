import { PAINTS } from '../game/constants';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const TOAST_HOLD = 1.1;   // s

export interface Hud {
  toast(msg: string): void;
  /** Runs the toast timer; call every frame in every mode. */
  tick(dt: number): void;
  setScore(score: number): void;
  setCoins(coins: number): void;
  setTime(seconds: number): void;
  setBest(best: number): void;
  setStrikes(lost: number): void;
  setMuted(muted: boolean): void;
  selectPaint(index: number): void;
  hideOverlays(): void;
  showOver(result: { score: number; dist: number; best: number }): void;
}

export interface HudHandlers {
  onStart(): void;
  onPaint(index: number): void;
  onMute(): void;
}

export function createHud(h: HudHandlers): Hud {
  const scoreEl = el('score'), coinsEl = el('coins'), timeEl = el('time'), bestEl = el('best');
  const toastEl = el('toast'), soundBtn = el<HTMLButtonElement>('soundBtn');
  const dots = [...document.querySelectorAll<HTMLElement>('#strikes .dot')];
  const swatchWrap = el('swatches');
  let toastT = 0;

  // Only touch the DOM when the text actually changes
  const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };

  PAINTS.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sw';
    b.style.background = p.hex;
    b.title = p.name;
    b.setAttribute('aria-label', p.name + ' paint');
    b.setAttribute('aria-pressed', String(i === 0));
    b.addEventListener('click', () => h.onPaint(i));
    swatchWrap.appendChild(b);
  });
  el('startBtn').addEventListener('click', h.onStart);
  el('againBtn').addEventListener('click', h.onStart);
  soundBtn.addEventListener('click', h.onMute);

  return {
    toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); toastT = TOAST_HOLD; },
    tick(dt) {
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('show'); }
    },
    setScore(score) { text(scoreEl, Math.round(score).toLocaleString()); },
    setCoins(coins) { text(coinsEl, String(coins)); },
    setTime(s) { text(timeEl, Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0')); },
    setBest(best) { text(bestEl, best.toLocaleString()); },
    setStrikes(lost) { dots.forEach((d, i) => d.classList.toggle('lost', i < lost)); },
    setMuted(muted) {
      soundBtn.setAttribute('aria-pressed', String(muted));
      soundBtn.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
    },
    selectPaint(index) {
      [...swatchWrap.children].forEach((c, j) => c.setAttribute('aria-pressed', String(j === index)));
    },
    hideOverlays() { el('startOverlay').hidden = true; el('overOverlay').hidden = true; },
    showOver({ score, dist, best }) {
      el('finalScore').textContent = Math.round(score).toLocaleString();
      el('finalDist').textContent = (dist / 1000).toFixed(2) + ' km';
      el('finalBest').textContent = best.toLocaleString();
      el('overOverlay').hidden = false;
    },
  };
}
