// Keyboard, touch and gamepad, folded into one set of controls.
// Whichever device was used last decides which legend and HUD layout show.

export type InputMode = 'keys' | 'touch' | 'pad';
export interface Controls { throttle: number; brake: number; steer: number }

export interface InputHandlers {
  onStart(): void;                  // Enter, pad A or Start
  onMute(): void;                   // M, pad Y
  onPaint(delta: number): void;     // pad LB / RB
  onGesture(): void;                // any real input; used to wake audio
  onMode(mode: InputMode): void;
}

export interface Input {
  readonly mode: InputMode;
  /** Poll once per frame. Also fires the gamepad's edge-triggered handlers. */
  sample(): Controls;
  /** Hit feedback: rumble on a gamepad, a short buzz on a phone. */
  rumble(strength: number, ms: number): void;
}

type TouchKey = 'left' | 'right' | 'gas' | 'brake';
const STICK_DEADZONE = 0.15;
// Standard gamepad mapping
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9, LEFT: 14, RIGHT: 15 };

export function createInput(h: InputHandlers): Input {
  const keys = new Set<string>();
  const touch: Record<TouchKey, boolean> = { left: false, right: false, gas: false, brake: false };
  let mode: InputMode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys';
  const setMode = (m: InputMode) => { if (m !== mode) { mode = m; h.onMode(m); } };

  /* ---- keyboard ---- */
  addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    const k = e.key.toLowerCase();
    if (!e.repeat) {
      if (k === 'm') h.onMute();
      if (e.key === 'Enter') h.onStart();
    }
    keys.add(k);
    setMode('keys');
    h.onGesture();
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());   // no stuck keys after alt-tab
  const down = (...k: string[]) => k.some(x => keys.has(x));

  /* ---- touch: each thumb gets a zone, and sliding across it switches button ---- */
  function bindZone(zoneId: string, buttons: [id: string, key: TouchKey][]) {
    const zone = document.getElementById(zoneId)!;
    const btns = buttons.map(([id, key]) => ({ el: document.getElementById(id)!, key }));
    const held = new Map<number, TouchKey>();
    const nearest = (x: number): TouchKey => {
      let best = btns[0], gap = Infinity;
      for (const b of btns) {
        const r = b.el.getBoundingClientRect();
        const d = Math.abs(x - (r.left + r.width / 2));
        if (d < gap) { gap = d; best = b; }
      }
      return best.key;
    };
    const sync = () => {
      const on = new Set(held.values());
      for (const b of btns) { touch[b.key] = on.has(b.key); b.el.classList.toggle('is-down', on.has(b.key)); }
    };
    zone.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      held.set(e.pointerId, nearest(e.clientX));
      sync();
      h.onGesture();
    });
    zone.addEventListener('pointermove', e => {
      if (held.has(e.pointerId)) { held.set(e.pointerId, nearest(e.clientX)); sync(); }
    });
    const end = (e: PointerEvent) => { held.delete(e.pointerId); sync(); };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    zone.addEventListener('contextmenu', e => e.preventDefault());
  }
  bindZone('steerZone', [['steerLeft', 'left'], ['steerRight', 'right']]);
  bindZone('pedalZone', [['brakeBtn', 'brake'], ['gasBtn', 'gas']]);
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch') setMode('touch'); }, true);

  /* ---- gamepad ---- */
  let prev: boolean[] = [];
  const activePad = (): Gamepad | null => {
    if (!navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p && p.connected && p.mapping === 'standard') return p;
    return null;
  };
  function pollPad(): Controls | null {
    const gp = activePad();
    if (!gp) { prev = []; return null; }
    const pressed = (i: number) => gp.buttons[i]?.pressed ?? false;
    const value = (i: number) => gp.buttons[i]?.value ?? 0;
    const edge = (i: number) => pressed(i) && !prev[i];

    const raw = gp.axes[0] ?? 0;
    let steer = Math.abs(raw) > STICK_DEADZONE
      ? Math.sign(raw) * (Math.abs(raw) - STICK_DEADZONE) / (1 - STICK_DEADZONE) : 0;
    if (pressed(PAD.LEFT)) steer = -1;
    if (pressed(PAD.RIGHT)) steer = 1;
    const throttle = Math.max(value(PAD.RT), pressed(PAD.A) ? 1 : 0);
    const brake = Math.max(value(PAD.LT), pressed(PAD.B) || pressed(PAD.X) ? 1 : 0);

    const used = steer !== 0 || gp.buttons.some(b => b.pressed);
    if (used) { setMode('pad'); h.onGesture(); }
    if (edge(PAD.START) || edge(PAD.A)) h.onStart();
    if (edge(PAD.Y)) h.onMute();
    if (edge(PAD.LB)) h.onPaint(-1);
    if (edge(PAD.RB)) h.onPaint(1);
    prev = gp.buttons.map(b => b.pressed);
    return { throttle, brake, steer };
  }

  return {
    get mode() { return mode; },
    sample() {
      const pad = pollPad();
      const keySteer = (down('a', 'arrowleft') ? -1 : 0) + (down('d', 'arrowright') ? 1 : 0);
      const touchSteer = (touch.left ? -1 : 0) + (touch.right ? 1 : 0);
      return {
        throttle: Math.max(down('w', 'arrowup') ? 1 : 0, touch.gas ? 1 : 0, pad?.throttle ?? 0),
        brake: Math.max(down('s', 'arrowdown') ? 1 : 0, touch.brake ? 1 : 0, pad?.brake ?? 0),
        steer: Math.max(-1, Math.min(1, keySteer + touchSteer + (pad?.steer ?? 0))),
      };
    },
    rumble(strength, ms) {
      try {
        if (mode === 'pad') {
          const act = (activePad() as unknown as { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } } | null)?.vibrationActuator;
          void act?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 })?.catch(() => {});
        } else if (mode === 'touch') {
          navigator.vibrate?.(ms * 0.4);
        }
      } catch { /* haptics are optional */ }
    },
  };
}
