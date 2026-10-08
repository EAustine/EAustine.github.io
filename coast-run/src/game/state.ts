import { BEST_KEY } from './constants';

export type Mode = 'menu' | 'playing' | 'over';

export interface State {
  mode: Mode;
  dist: number; speed: number; x: number; steer: number; steerSmooth: number;
  score: number; coins: number; time: number; strikes: number;
  invuln: number; boost: number; shake: number;
  spawnIn: number; padIn: number; coinIn: number; obsIn: number;   // countdown timers, s
  paint: number;   // index into PAINTS
  best: number;
}

// Storage can be blocked (private mode, sandboxed frames); the game still runs.
function readBest(): number {
  try { return +(localStorage.getItem(BEST_KEY) || 0) || 0; } catch { return 0; }
}
export function saveBest(best: number): void {
  try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* not persisted this session */ }
}

export function createState(): State {
  return {
    mode: 'menu', dist: 0, speed: 0, x: 0, steer: 0, steerSmooth: 0,
    score: 0, coins: 0, time: 0, strikes: 0, invuln: 0, boost: 0, shake: 0,
    spawnIn: 1.4, padIn: 5, coinIn: 3, obsIn: 8,
    paint: 0, best: readBest(),
  };
}

/** Everything resets except best and paint. */
export function resetRun(S: State): void {
  Object.assign(S, {
    mode: 'playing', dist: 0, speed: 26, x: 2.0, steer: 0, steerSmooth: 0,
    score: 0, coins: 0, time: 0, strikes: 0, invuln: 0, boost: 0, shake: 0,
    spawnIn: 1.0, padIn: 4, coinIn: 2, obsIn: 7,
  } satisfies Partial<State>);
}
