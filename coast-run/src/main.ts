import '@fonts';
import './styles/tokens.css';
import './styles/game.css';

import * as THREE from 'three';
import { createEngineAudio } from './audio/engine';
import { buildCar } from './car/buildCar';
import { createCarFx } from './car/carFx';
import { createPools } from './entities/pools';
import { PAINTS } from './game/constants';
import { createInput, type Input } from './game/input';
import { createGame, type Game } from './game/loop';
import { createState } from './game/state';
import { createGauge } from './hud/gauge';
import { createMinimap } from './hud/minimap';
import { createHud } from './hud/overlays';
import { createProps } from './world/props';
import { createRibbons } from './world/ribbons';
import { createScenery, EXPOSURE } from './world/scenery';
import { bakeSky } from './world/sky';
import { createTerrain } from './world/terrain';

if (__SINGLE__) {   // no viewer page to link to
  document.body.classList.add('single');
  document.querySelectorAll('a.back, a.back-inline').forEach(a => a.remove());
}

function boot() {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Khronos PBR Neutral: the paint on the car has to match the swatch you picked
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = EXPOSURE;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 900);
  camera.position.set(0, 1.9, 8);

  const S = createState();
  const scenery = createScenery(scene, bakeSky(renderer, matchMedia('(pointer: coarse)').matches ? 512 : 1024));   // phones bake a smaller sky
  const ribbons = createRibbons(scene);
  const terrain = createTerrain(scene);
  const props = createProps(scene);
  const pools = createPools(scene);
  const player = buildCar({ paint: PAINTS[0].hex });
  scene.add(player);
  const carFx = createCarFx(player);
  const audio = createEngineAudio();

  let game: Game;
  let input: Input;

  const setPaint = (i: number) => {
    S.paint = i;
    hud.selectPaint(i);
    player.userData.materials.paint.color.set(PAINTS[i].hex);
  };
  const toggleMute = () => {
    const muted = audio.toggleMute();
    hud.setMuted(muted);
    hud.toast(muted ? 'Sound off' : 'Sound on');
  };
  const start = () => { audio.wake(); game.start(); };

  const hud = createHud({ onStart: start, onPaint: setPaint, onMute: toggleMute });
  hud.setBest(S.best);

  // Touch input always gets the strip HUD, because the thumb zones need the
  // bottom corners. Small windows get it too, whatever the input.
  const small = matchMedia('(max-width: 760px), (max-height: 560px)');
  const applyLayout = () => {
    document.body.dataset.input = input.mode;
    document.body.dataset.layout = small.matches || input.mode === 'touch' ? 'strip' : 'desktop';
  };
  input = createInput({
    onStart: start,
    onMute: toggleMute,
    onPaint: delta => { if (S.mode === 'menu') setPaint((S.paint + delta + PAINTS.length) % PAINTS.length); },
    onGesture: () => audio.wake(),
    onMode: applyLayout,
  });
  small.addEventListener('change', applyLayout);
  applyLayout();

  game = createGame({
    S, renderer, scene, camera, player, carFx, ribbons, scenery, terrain, props, pools, hud, audio, input,
    onSlow: () => stepDown(),
    drawGauge: createGauge(document.getElementById('gauge') as HTMLCanvasElement),
    drawMap: createMinimap(document.getElementById('map') as HTMLCanvasElement, S, pools),
  });

  // If the device cannot hold the frame rate, step the quality down: render
  // resolution first, then shadow resolution, then shadows altogether.
  const steps = [
    () => renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)),
    () => renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25)),
    () => renderer.setPixelRatio(1),
    () => scenery.setShadows('low'),
    () => scenery.setShadows('off'),
  ];
  let quality = 0;
  const stepDown = () => {
    if (quality >= steps.length) return;
    steps[quality++]();
    resize();
    document.body.dataset.quality = String(quality);
  };

  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();
  game.run();

  if (import.meta.env.DEV) Object.assign(window, { __coast: { S, pools, game, input, camera, renderer, scene, terrain, props } });
}

try {
  boot();
} catch (err) {
  console.error(err);
  const line = document.querySelector<HTMLElement>('#startOverlay p');
  if (line) line.textContent = 'The game needs WebGL and this browser could not start it. Try a current version of Chrome, Safari, Firefox or Edge, or turn hardware acceleration on.';
  document.getElementById('startBtn')?.setAttribute('disabled', '');
}
