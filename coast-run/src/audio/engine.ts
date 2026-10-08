import { MAX_SPEED } from '../game/constants';

// WebAudio engine and wind. Nothing is created until the first user gesture,
// because browsers refuse to start an AudioContext before one.

interface Graph {
  ctx: AudioContext; master: GainNode; o1: OscillatorNode; o2: OscillatorNode;
  lp: BiquadFilterNode; windGain: GainNode;
}

export interface EngineAudio {
  /** Safe to call on every gesture: builds the graph once, then resumes it. */
  wake(): void;
  update(speed: number, throttle: number): void;
  readonly muted: boolean;
  toggleMute(): boolean;
}

export function createEngineAudio(): EngineAudio {
  let g: Graph | null = null;
  let muted = false;

  function build(): Graph | null {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);

    const engGain = ctx.createGain(); engGain.gain.value = 0.16;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.detune.value = -12;
    o1.connect(lp); o2.connect(lp); lp.connect(engGain); engGain.connect(master);
    o1.start(); o2.start();

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    const windGain = ctx.createGain(); windGain.gain.value = 0;
    noise.connect(bp); bp.connect(windGain); windGain.connect(master);
    noise.start();

    master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);
    return { ctx, master, o1, o2, lp, windGain };
  }

  return {
    wake() {
      try {
        g ??= build();
        if (g && g.ctx.state === 'suspended') void g.ctx.resume();
      } catch { /* no audio on this device; the game runs silent */ }
    },
    update(speed, throttle) {
      if (!g) return;
      const t = g.ctx.currentTime, r = speed / MAX_SPEED;
      g.o1.frequency.setTargetAtTime(58 + r * 150, t, 0.08);
      g.o2.frequency.setTargetAtTime(29 + r * 75, t, 0.08);
      g.lp.frequency.setTargetAtTime(500 + r * 1900 + throttle * 400, t, 0.1);
      g.windGain.gain.setTargetAtTime(Math.max(0, r - 0.25) * 0.1, t, 0.2);
      g.master.gain.setTargetAtTime(muted ? 0 : 0.5, t, 0.15);
    },
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
  };
}
