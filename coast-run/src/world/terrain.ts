import * as THREE from 'three';
import { EDGE } from '../game/constants';
import { curve } from './curve';
import { fbm, lerp, mulberry32, smoothstep, vnoise } from './noise';

// Land and sea either side of the road. Like the road, the terrain is a strip
// of rows that bends with curve(), so the coast follows the highway. Unlike the
// road, its rows are pinned to fixed track distances (every ROW metres), which
// keeps hills from swimming as the window slides forward.

export const SEA_Y = -4.5;            // sea level, metres below the road
const ROW = 6;                        // metres between terrain rows
const BEHIND = 60, AHEAD = 306;
const ROWS = (AHEAD + BEHIND) / ROW + 1;
const SHOULDER = EDGE + 5;            // where the road's own shoulder ribbon ends

// lateral sample positions, metres from the road centre line
const LAND_U = [SHOULDER - 0.4, 17, 19.5, 22.5, 26, 30, 35, 41, 48, 57, 68, 82, 100, 124, 156, 198, 260];
const SHORE_U = [-(SHOULDER - 0.4), -16.6, -18.4, -20.5, -23, -26, -29.5, -33.5, -38, -45, -60];

/** Ground height at track distance t, lateral offset u. The road itself is y = 0. */
export function groundHeight(t: number, u: number): number {
  if (u >= 0) {
    const a = Math.max(0, u - SHOULDER);
    const verge = -0.05 + 0.45 * (vnoise(t / 11, u / 9) - 0.4) * smoothstep(0.5, 5, a);
    // a cut bank a few metres back from the shoulder, then open hillside
    const bank = smoothstep(4, 17, a) * (1.2 + 4.6 * vnoise(t / 85, 3.3)) * (0.75 + 0.5 * vnoise(t / 19, u / 15));
    const hills = smoothstep(14, 170, a) * (12 + 34 * fbm(t / 300, u / 230, 3) + 10 * fbm(t / 75, u / 64, 3));
    return verge + bank + hills;
  }
  const a = Math.max(0, -u - SHOULDER);
  const lip = -0.05 - 0.3 * smoothstep(0, 3, a) + 0.3 * (vnoise(t / 9, u / 7) - 0.5) * smoothstep(0.5, 3, a);
  const edge = 2.5 + 2.5 * vnoise(t / 46, 8.1);              // where the bluff starts to fall away
  const drop = smoothstep(edge, edge + 9 + 3 * vnoise(t / 60, 2.2), a);
  const beach = SEA_Y + 0.55 - Math.max(0, a - 14) * 0.07;   // slides under the water about 22 m out
  return lerp(lip, beach, drop);
}

const PALETTE = {
  sand: new THREE.Color('#DED3B8'),
  dryGrass: new THREE.Color('#B3B287'),
  scrub: new THREE.Color('#8C9A6E'),
  rock: new THREE.Color('#A69A88'),
  rockDark: new THREE.Color('#8A8072'),
  beach: new THREE.Color('#E8DEC6'),
  wet: new THREE.Color('#C4B89E'),
};

function groundColor(t: number, u: number, y: number, slope: number, out: THREE.Color): void {
  const n = fbm(t / 23, u / 19, 2);
  if (u >= 0) {
    const a = u - SHOULDER;
    out.copy(PALETTE.sand).lerp(PALETTE.dryGrass, smoothstep(2, 9, a + n * 6));
    out.lerp(PALETTE.scrub, smoothstep(0.45, 0.7, fbm(t / 60, u / 50, 3)) * smoothstep(6, 20, a) * 0.85);
    out.lerp(n > 0.5 ? PALETTE.rock : PALETTE.rockDark, smoothstep(0.42, 0.8, slope));
  } else {
    out.copy(PALETTE.sand).lerp(PALETTE.dryGrass, 0.5 * n);
    out.lerp(n > 0.5 ? PALETTE.rock : PALETTE.rockDark, smoothstep(0.35, 0.7, slope));
    out.lerp(PALETTE.beach, smoothstep(SEA_Y + 2.2, SEA_Y + 0.9, y));
    out.lerp(PALETTE.wet, smoothstep(SEA_Y + 0.4, SEA_Y + 0.05, y));
  }
}

interface Strip {
  mesh: THREE.Mesh;
  us: number[];
  y: Float32Array;        // cached heights, one row per ring slot
  rgb: Float32Array;
  rowOf: Int32Array;      // which track row each ring slot currently holds
}

function makeStrip(scene: THREE.Scene, us: number[], material: THREE.Material): Strip {
  const cols = us.length;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROWS * cols * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ROWS * cols * 3), 3));
  const idx: number[] = [];
  const ccw = us[1] > us[0];          // keep faces pointing up on both sides of the road
  for (let i = 0; i < ROWS - 1; i++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c, b = a + 1, d = a + cols, e = d + 1;
      if (ccw) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e);
    }
  }
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { mesh, us, y: new Float32Array(ROWS * cols), rgb: new Float32Array(ROWS * cols * 3), rowOf: new Int32Array(ROWS).fill(-2147483648) };
}

/** A tileable wave normal map, built from sine swells with whole-number frequencies. */
function waveNormals(size = 256): THREE.DataTexture {
  const rnd = mulberry32(41);
  const waves = Array.from({ length: 9 }, (_, i) => {
    const f = 1 + Math.floor(i * 1.6 + rnd() * 2);
    const ang = rnd() * Math.PI * 2;
    return { kx: Math.round(Math.cos(ang) * f), ky: Math.round(Math.sin(ang) * f) || 1, amp: 0.5 / (f + 1), ph: rnd() * 6.283 };
  });
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = i / size * Math.PI * 2, y = j / size * Math.PI * 2;
      let dx = 0, dy = 0;
      for (const w of waves) {
        const c = Math.cos(w.kx * x + w.ky * y + w.ph) * w.amp;
        dx += c * w.kx; dy += c * w.ky;
      }
      const inv = 1 / Math.hypot(dx, dy, 1), o = (j * size + i) * 4;
      data[o] = (-dx * inv * 0.5 + 0.5) * 255;
      data[o + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      data[o + 2] = (inv * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export interface Terrain { update(dist: number, time: number): void }

export function createTerrain(scene: THREE.Scene): Terrain {
  const ground = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const strips = [makeStrip(scene, LAND_U, ground), makeStrip(scene, SHORE_U, ground)];

  /* sea: one big plane; the shoreline is wherever the beach dips under it */
  const SEA_W = 1900, SEA_L = 3000, TILE = 46;
  const waves = waveNormals();
  waves.repeat.set(SEA_W / TILE, SEA_L / TILE);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(SEA_W, SEA_L),
    new THREE.MeshStandardMaterial({ color: '#2E63C4', roughness: 0.16, metalness: 0, normalMap: waves, normalScale: new THREE.Vector2(0.55, 0.55) }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-SEA_W / 2 + 120, SEA_Y, 0);
  scene.add(sea);

  /* foam: a thin bright strip riding the waterline */
  const foamGeo = new THREE.BufferGeometry();
  foamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROWS * 2 * 3), 3));
  const fi: number[] = [];
  for (let i = 0; i < ROWS - 1; i++) { const a = i * 2; fi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  foamGeo.setIndex(fi);
  const foam = new THREE.Mesh(foamGeo, new THREE.MeshStandardMaterial({ color: '#F4F8FF', roughness: 0.9, side: THREE.DoubleSide }));
  foam.frustumCulled = false;
  scene.add(foam);

  const tint = new THREE.Color();
  let lastFirst = -2147483648;

  return {
    update(dist, time) {
      const first = Math.floor((dist - BEHIND) / ROW);
      const base = curve(dist);
      const rowsMoved = first !== lastFirst;
      lastFirst = first;

      for (const s of strips) {
        const cols = s.us.length;
        const pos = s.mesh.geometry.attributes.position as THREE.BufferAttribute;
        const col = s.mesh.geometry.attributes.color as THREE.BufferAttribute;
        for (let i = 0; i < ROWS; i++) {
          const k = first + i, slot = ((k % ROWS) + ROWS) % ROWS, t = k * ROW;
          if (s.rowOf[slot] !== k) {                          // a new row has scrolled in: sample it once
            s.rowOf[slot] = k;
            for (let c = 0; c < cols; c++) {
              const u = s.us[c], y = groundHeight(t, u);
              const slope = Math.hypot((groundHeight(t, u + 1.5) - y) / 1.5, (groundHeight(t + 3, u) - y) / 3);
              groundColor(t, u, y, slope, tint);
              s.y[slot * cols + c] = c === 0 ? -0.08 : y;     // tuck the inner edge under the shoulder
              tint.toArray(s.rgb, (slot * cols + c) * 3);
            }
          }
          const off = curve(t) - base, z = -(t - dist);
          for (let c = 0; c < cols; c++) {
            const v = i * cols + c;
            pos.setXYZ(v, s.us[c] + off, s.y[slot * cols + c], z);
            if (rowsMoved) col.setXYZ(v, s.rgb[(slot * cols + c) * 3], s.rgb[(slot * cols + c) * 3 + 1], s.rgb[(slot * cols + c) * 3 + 2]);
          }
        }
        pos.needsUpdate = true;
        if (rowsMoved) col.needsUpdate = true;
      }

      // foam follows the waterline, about 22 m beyond the shoulder, breathing slowly
      const fp = foamGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < ROWS; i++) {
        const t = (first + i) * ROW, off = curve(t) - base, z = -(t - dist);
        const line = -(SHOULDER + 21.4 + 1.2 * vnoise(t / 17, 5.5) + 0.5 * Math.sin(time * 0.9 + t * 0.07));
        fp.setXYZ(i * 2, line + 1.1 + off, SEA_Y + 0.10, z);
        fp.setXYZ(i * 2 + 1, line - 2.0 - 1.4 * vnoise(t / 9, 1.5) + off, SEA_Y + 0.04, z);
      }
      fp.needsUpdate = true;

      // the water pattern stays pinned to the world while the plane stays put
      waves.offset.set((time * 0.012) % 1, (dist / TILE + time * 0.02) % 1);
    },
  };
}
