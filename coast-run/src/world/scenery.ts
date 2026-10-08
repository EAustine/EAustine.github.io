import * as THREE from 'three';
import { AHEAD, BEHIND, EDGE } from '../game/constants';
import { curve } from './curve';
import { SUN_DIR, type Sky } from './sky';

const POST_GAP = 26;
const POSTS = (Math.ceil((AHEAD + BEHIND) / POST_GAP) + 1) * 2;   // both shoulders
const SHADOW_HALF = 30;        // m, half-width of the shadow frustum around the player
const SUN_DISTANCE = 80;       // m from the player to the light's position along SUN_DIR
// A clear-day ratio: direct sun about four times the sky fill on level ground.
// (three.js divides a directional light's diffuse by pi, the sky's it does not.)
const SUN_INTENSITY = 7.5;
export const EXPOSURE = 0.8;

export interface Scenery {
  /** Marker posts ride the road edge; call once per frame. */
  placePosts(dist: number): void;
  /** Keep the shadow frustum centred on the player. */
  aimSun(x: number, targetZ: number): void;
  /** Quality fallback: a 1024 shadow map, or no shadows at all. */
  setShadows(level: 'low' | 'off'): void;
}

export function createScenery(scene: THREE.Scene, sky: Sky): Scenery {
  /* light: the baked sky does the ambient work, one sun casts the shadows */
  scene.background = sky.background;
  scene.environment = sky.environment;
  scene.environmentIntensity = 0.75;
  scene.backgroundIntensity = 1 / EXPOSURE;      // the sky keeps its painted values whatever the exposure
  scene.fog = new THREE.Fog(sky.fogColor, 120, 285);

  const sun = new THREE.DirectionalLight('#FFE7C8', SUN_INTENSITY);
  sun.castShadow = true;
  // 2048 on desktop; phones get 1024, which still gives 6 cm texels
  const mapSize = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF; sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF;
  sc.near = 1; sc.far = 190;
  scene.add(sun, sun.target);

  /* marker posts: two instanced meshes */
  const stems = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.14, 1.0, 0.14),
    new THREE.MeshStandardMaterial({ color: '#F5F7FA', roughness: 0.8 }), POSTS);
  const caps = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.16),
    new THREE.MeshStandardMaterial({ color: '#1F5BD6', roughness: 0.6 }), POSTS);
  stems.frustumCulled = caps.frustumCulled = false;
  stems.castShadow = true;
  scene.add(stems, caps);
  const m4 = new THREE.Matrix4();

  return {
    placePosts(dist) {
      const base = curve(dist);
      const first = Math.ceil((dist - BEHIND) / POST_GAP);
      for (let i = 0; i < POSTS; i++) {
        const side = i % 2 ? 1 : -1;
        const trackZ = (first + (i >> 1)) * POST_GAP;
        const x = side * (EDGE + 1.1) + curve(trackZ) - base;
        const z = -(trackZ - dist);
        stems.setMatrixAt(i, m4.makeTranslation(x, 0.5, z));
        caps.setMatrixAt(i, m4.makeTranslation(x, 1.02, z));
      }
      stems.instanceMatrix.needsUpdate = true;
      caps.instanceMatrix.needsUpdate = true;
    },
    aimSun(x, targetZ) {
      sun.target.position.set(x, 0, targetZ);
      sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, SUN_DISTANCE);
    },
    setShadows(level) {
      if (level === 'off') { sun.castShadow = false; return; }
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;         // rebuilt at the new size on the next frame
    },
  };
}
