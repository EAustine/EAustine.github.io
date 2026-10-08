import * as THREE from 'three';
import type { EngineAudio } from '../audio/engine';
import type { Car } from '../car/buildCar';
import type { CarFx } from '../car/carFx';
import type { Pools } from '../entities/pools';
import type { Hud } from '../hud/overlays';
import { bend, curve } from '../world/curve';
import type { Props } from '../world/props';
import type { Ribbons } from '../world/ribbons';
import type { Scenery } from '../world/scenery';
import type { Terrain } from '../world/terrain';
import { AHEAD, BEHIND, BOOST_SPEED, EDGE, MAX_SPEED } from './constants';
import type { Input } from './input';
import { resetRun, saveBest, type State } from './state';

export interface GameDeps {
  S: State;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  player: Car;
  carFx: CarFx;
  ribbons: Ribbons;
  scenery: Scenery;
  terrain: Terrain;
  props: Props;
  pools: Pools;
  hud: Hud;
  drawGauge(kmh: number): void;
  drawMap(): void;
  audio: EngineAudio;
  input: Input;
  /** Called when a second of frames averaged under about 42 fps. */
  onSlow(): void;
}

export interface Game {
  start(): void;
  run(): void;
  /** One simulation step; exposed for tests and the dev console. */
  step(dt: number): void;
  /** One whole frame (simulate, HUD, render) without the animation loop; for tests. */
  tick(dt: number): void;
}

const MIN_HALF_VIEW = Math.tan(19 * Math.PI / 180);   // narrowest horizontal half-angle the chase camera may have
const deg = (rad: number) => rad * 180 / Math.PI;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function createGame(d: GameDeps): Game {
  const { S, renderer, scene, camera, player, carFx, ribbons, scenery, terrain, props, pools, hud, audio, input } = d;
  let clock = 0;   // wall-clock seconds for purely visual motion (water, flames); never read by gameplay
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;   // no camera shake

  /* ---- portrait screens ----
   * The chase camera is tuned for landscape. Below an aspect of about 0.65
   * the horizontal view gets too narrow to hold the car in an outer lane, so
   * the FOV widens to keep a minimum horizontal angle and the camera follows
   * the car more tightly. On landscape screens none of this applies. */
  const widen = (fovDeg: number, refFovDeg: number, minHalfTan: number) => {
    const k = Math.max(1, minHalfTan / (camera.aspect * Math.tan(refFovDeg * Math.PI / 360)));
    return Math.min(100, deg(2 * Math.atan(Math.tan(fovDeg * Math.PI / 360) * k)));
  };
  const narrow = () => Math.max(0, Math.min(1, (0.65 - camera.aspect) / 0.2));

  function start() {
    if (S.mode === 'playing') return;
    resetRun(S);
    pools.reset();
    hud.setCoins(0);
    hud.setStrikes(0);
    hud.hideOverlays();
  }

  function gameOver() {
    S.mode = 'over';
    S.best = Math.max(S.best, Math.round(S.score));
    saveBest(S.best);
    hud.setBest(S.best);
    hud.showOver({ score: S.score, dist: S.dist, best: S.best });
  }

  /** Costs a strike. Returns true when it was the last one. */
  function strike(label: string, speedFactor: number, shake: number): boolean {
    S.strikes++;
    S.invuln = 1.6;
    S.shake = shake;
    S.speed *= speedFactor;
    hud.setStrikes(S.strikes);
    hud.toast(S.strikes < 3 ? `${label}: strike ${S.strikes}` : 'Out');
    input.rumble(0.9, 260);
    if (S.strikes >= 3) { gameOver(); return true; }
    return false;
  }

  /* ---- menu and run-over turntable ---- */
  function idleStep(dt: number) {
    S.time += dt;
    input.sample();   // keeps gamepad Start, mute and paint buttons live
    carFx.update(dt, clock, 0, 0, 0, 0);
    player.visible = true;
    player.position.set(0, 0, 0);
    player.rotation.set(0, S.mode === 'menu' ? S.time * 0.35 : player.rotation.y, 0);
    const a = S.mode === 'menu' ? S.time * 0.35 : 0;
    camera.position.set(Math.sin(a) * 9, 2.4, Math.cos(a) * 9);
    camera.lookAt(0, 0.7, 0);
    camera.fov = widen(48, 48, 0.3);
    camera.updateProjectionMatrix();
    scenery.aimSun(0, 0);
    audio.update(6, 0);
    d.drawGauge(0);
  }

  function step(dt: number) {
    S.time += dt;

    /* input */
    const { throttle, brake, steer } = input.sample();
    S.steer += (steer - S.steer) * Math.min(1, dt * 9);
    S.steerSmooth += (S.steer - S.steerSmooth) * Math.min(1, dt * 6);

    /* speed. Analog triggers scale the pedal; keys and touch are all-or-nothing. */
    S.boost = Math.max(0, S.boost - dt);
    const cap = S.boost > 0 ? BOOST_SPEED : MAX_SPEED;
    const accel = throttle > 0 ? 11 * throttle : brake > 0 ? Math.min(-3.2, -26 * brake) : -3.2;
    S.speed += accel * dt;
    if (S.speed > cap) S.speed += (cap - S.speed) * Math.min(1, dt * 1.6);
    S.speed = Math.max(8, Math.min(BOOST_SPEED, S.speed));
    S.dist += S.speed * dt;

    /* steering and guardrails. Corners push the car to the outside. */
    S.x += S.steer * (5.2 + S.speed * 0.045) * dt;
    S.x -= bend(S.dist) * S.speed * 20 * dt;
    const limit = EDGE - 1.2;
    if (Math.abs(S.x) > limit) {
      S.x = Math.sign(S.x) * limit;
      S.speed *= 0.985;
      if (Math.random() < 0.3) pools.spawnSkid(S.dist, S.x, Math.sign(S.x));
    }

    /* score */
    S.score += S.speed * dt * 0.55 * (S.boost > 0 ? 1.6 : 1);

    /* spawns, on a gentle difficulty ramp */
    const ramp = Math.min(1, S.time / 150);
    S.spawnIn -= dt;
    if (S.spawnIn <= 0) { pools.spawnTraffic(S.dist); S.spawnIn = 2.4 - ramp * 1.15 + Math.random() * 0.7; }
    S.padIn -= dt;
    if (S.padIn <= 0) { pools.spawnPad(S.dist); S.padIn = 7 + Math.random() * 6; }
    S.coinIn -= dt;
    if (S.coinIn <= 0) { pools.spawnCoinArc(S.dist); S.coinIn = 5 + Math.random() * 5; }
    S.obsIn -= dt;
    if (S.obsIn <= 0) { pools.spawnObstacle(S.dist); S.obsIn = 6.5 - ramp * 2.5 + Math.random() * 4; }

    /* everything below is placed relative to the road line at the player */
    const base = curve(S.dist);
    const worldX = (t: number) => curve(t) - base;

    /* traffic */
    S.invuln = Math.max(0, S.invuln - dt);
    for (let i = 0; i < pools.traffic.length; i++) {
      const u = pools.traffic[i];
      if (!u.active) continue;
      u.trackZ += u.speed * u.dir * dt;
      const dz = u.trackZ - S.dist;
      if (dz < -BEHIND - 6 || dz > AHEAD + 90) { u.active = false; pools.hideTraffic(i); continue; }
      const wx = worldX(u.trackZ);
      pools.placeTraffic(i, u.laneX + wx, -dz,
        (u.dir < 0 ? Math.PI : 0) + (worldX(u.trackZ + 8) - wx) * -0.08 * u.dir);

      const dx = u.laneX - S.x;
      if (Math.abs(dz) < 4.3 && Math.abs(dx) < 2.15 && S.invuln <= 0) {
        if (strike(u.dir < 0 ? 'Head-on' : 'Contact', 0.42, 0.5)) return;
      }
      if (!u.passed && dz < 0) {
        u.passed = true;
        if (Math.abs(dx) < 3.4) {
          const bonus = u.dir < 0 ? 110 : 60;
          S.score += bonus;
          hud.toast((u.dir < 0 ? 'Head-on miss +' : 'Near miss +') + bonus);
        }
      }
    }

    /* boost pads */
    for (const p of pools.pads) {
      if (!p.active) continue;
      const dz = p.trackZ - S.dist;
      if (dz < -BEHIND) { p.active = false; p.mesh.visible = false; continue; }
      p.mesh.position.set(p.laneX + worldX(p.trackZ), 0.03, -dz);
      if (Math.abs(dz) < 4.3 && Math.abs(p.laneX - S.x) < 2.15) {
        p.active = false; p.mesh.visible = false;
        S.boost = 2.6; S.score += 120;
        hud.toast('Boost +120');
      }
    }

    /* coins */
    for (let i = 0; i < pools.coins.length; i++) {
      const c = pools.coins[i];
      if (!c.active) continue;
      const dz = c.trackZ - S.dist;
      if (dz < -BEHIND) { c.active = false; pools.hideCoin(i); continue; }
      c.spin += dt * 3.4;
      pools.placeCoin(i, c.laneX + worldX(c.trackZ), -dz);
      if (Math.abs(dz) < 3.2 && Math.abs(c.laneX - S.x) < 1.9) {
        c.active = false; pools.hideCoin(i);
        S.coins++; S.score += 45;
        hud.setCoins(S.coins);
      }
    }

    /* cones and barriers */
    for (const o of pools.obstacles) {
      if (!o.active) continue;
      const dz = o.trackZ - S.dist;
      if (dz < -BEHIND) { o.active = false; o.mesh.visible = false; continue; }
      o.mesh.position.set(o.laneX + worldX(o.trackZ), 0, -dz);
      if (Math.abs(dz) < 2.6 && Math.abs(o.laneX - S.x) < (o.wide ? 2.2 : 1.4) && S.invuln <= 0) {
        if (strike(o.wide ? 'Barrier' : 'Cone', 0.5, 0.45)) return;
      }
    }

    /* skid marks */
    if (Math.abs(S.steer) > 0.65 && S.speed > 34 && Math.random() < 0.6) pools.spawnSkid(S.dist, S.x, -Math.sign(S.steer));
    for (const s of pools.skids) {
      if (!s.active) continue;
      const dz = s.trackZ - S.dist;
      s.life -= dt * 0.22;
      if (dz < -BEHIND || s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.mesh.position.set(s.laneX + worldX(s.trackZ), 0.012, -dz);
      s.mesh.material.opacity = 0.4 * s.life;
    }

    /* player pose: blinks at 12 Hz while invulnerable */
    player.visible = !(S.invuln > 0 && Math.floor(S.invuln * 12) % 2 === 0);
    player.position.set(S.x, 0, 0);
    player.rotation.set(
      -Math.min(0.03, S.speed * 0.0004) - 0.012 * throttle,
      -S.steerSmooth * 0.10,
      -S.steerSmooth * 0.055);
    carFx.update(dt, clock, S.speed, S.steerSmooth, throttle > 0 ? 0 : brake, S.boost);

    /* camera: low chase */
    S.shake = Math.max(0, S.shake - dt * 1.4);
    const sh = calm ? 0 : S.shake * 0.35;
    const n = narrow();
    const camX = S.x * lerp(0.55, 0.9, n) + (Math.random() - 0.5) * sh;
    camera.position.x += (camX - camera.position.x) * Math.min(1, dt * 4);
    camera.position.y += ((1.45 + S.speed * 0.006 + (Math.random() - 0.5) * sh) - camera.position.y) * Math.min(1, dt * 3);
    camera.position.z = 8.2 - S.speed * 0.012;
    camera.lookAt(S.x * lerp(0.75, 0.95, n) + worldX(S.dist + 34) * 0.25, 1.15, -18);
    camera.rotation.z += -S.steerSmooth * 0.018;
    const targetFov = widen(56 + (S.speed / BOOST_SPEED) * 22, 56, MIN_HALF_VIEW);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 2.2);
    camera.updateProjectionMatrix();

    scenery.aimSun(S.x, -10);

    /* hud */
    d.drawGauge(S.speed * 3.6);
    hud.setScore(S.score);
    hud.setTime(S.time);
    audio.update(S.speed, throttle);
  }

  /** Scenery for the current distance. Purely visual, so it runs once per
   *  frame and stays out of the simulation step. */
  function drawWorld() {
    ribbons.update(S.dist);
    scenery.placePosts(S.dist);
    terrain.update(S.dist, clock);
    props.update(S.dist);
  }

  /** Everything one frame does, for a given time step. */
  function tick(dt: number) {
    clock += dt;
    if (S.mode === 'playing') step(dt); else idleStep(dt);
    drawWorld();
    hud.tick(dt);
    pools.commit();
    d.drawMap();
    renderer.render(scene, camera);
  }
  let last = performance.now();
  let frames = 0, spent = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);   // clamp long frames to 50 ms
    last = now;
    tick(dt);
    // watch the frame rate a second at a time, once shaders have had a moment to compile
    if (++frames > 90) {
      spent += dt;
      if ((frames - 90) % 60 === 0) {
        if (spent / 60 > 1 / 42) d.onSlow();
        spent = 0;
      }
    }
    requestAnimationFrame(frame);
  }

  return {
    start,
    step,
    tick,
    run() {
      drawWorld();
      requestAnimationFrame(now => { last = now; frame(now); });
    },
  };
}
