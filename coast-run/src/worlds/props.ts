import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EDGE } from '../game/constants';
import { curve } from './curve';
import { hash2, mulberry32, vnoise } from './noise';
import { groundHeight } from './terrain';

// Roadside scatter: palms, rocks, scrub and guardrail posts. Each kind is one
// or two instanced meshes. Placement is a pure function of a slot number along
// the track, so a given stretch of road always carries the same scenery and no
// state has to be kept as the window slides.

const BEHIND = 40, AHEAD = 300;

/* ---------------- dimensions, metres ---------------- */
const PALM = { height: 8.0, trunkBase: 0.24, trunkTop: 0.14, lean: 0.9, fronds: 9, frondLength: 3.4, frondWidth: 0.62 };
const ROCK = { radius: 1.0, squash: 0.68 };
const SHRUB = { radius: 1.0, squash: 0.6 };
const RAIL_POST = { width: 0.10, depth: 0.14, height: 0.72, gap: 4 };

/* ---------------- geometry ---------------- */
function palmTrunk(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(PALM.trunkTop, PALM.trunkBase, PALM.height, 6, 6, true);
  g.translate(0, PALM.height / 2, 0);                       // pivot at the base
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = p.getY(i) / PALM.height;
    p.setX(i, p.getX(i) + PALM.lean * f * f);               // a gentle curve toward +x
  }
  return g.toNonIndexed();
}

function palmCrown(): THREE.BufferGeometry {
  const rnd = mulberry32(7);
  const SEG = 5, fronds: THREE.BufferGeometry[] = [];
  for (let f = 0; f < PALM.fronds; f++) {
    const len = PALM.frondLength * (0.82 + rnd() * 0.36), rise = 0.5 + rnd() * 0.9, droop = 1.7 + rnd() * 1.1;
    const pos: number[] = [];
    // spine runs out along +x: it rises, then droops. Each segment is a shallow V.
    const pt = (s: number) => {
      const w = PALM.frondWidth * Math.sin(Math.PI * (0.12 + 0.88 * s)) * (1 - 0.35 * s);
      const x = len * s, y = rise * s - droop * s * s;
      return { l: [x, y - 0.12 * w, -w], m: [x, y, 0], r: [x, y - 0.12 * w, w] };
    };
    for (let i = 0; i < SEG; i++) {
      const a = pt(i / SEG), b = pt((i + 1) / SEG);
      pos.push(...a.l, ...b.l, ...a.m, ...a.m, ...b.l, ...b.m, ...a.m, ...b.m, ...a.r, ...a.r, ...b.m, ...b.r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.rotateZ((rnd() - 0.5) * 0.3);
    g.rotateY((f / PALM.fronds) * Math.PI * 2 + (rnd() - 0.5) * 0.4);
    fronds.push(g);
  }
  const crown = mergeGeometries(fronds)!;
  crown.translate(PALM.lean, PALM.height - 0.05, 0);        // sits on the curved trunk top
  crown.computeVertexNormals();
  return crown;
}

/** A low-poly lump: an icosphere pushed around by hashed noise, flat underneath. */
function lump(seed: number, squash: number, rough: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // hash on the rounded position, so vertices shared between faces move together
    const k = 1 + (hash2(Math.round(x * 97 + seed * 13) + Math.round(z * 57), Math.round(y * 83) + seed) - 0.5) * rough;
    p.setXYZ(i, x * k, Math.max(-0.25, y * k * squash), z * k);
  }
  g.computeVertexNormals();
  return g;
}

interface Kind {
  meshes: THREE.InstancedMesh[];
  count: number;
  gap: number;                         // metres of track per slot
  /** Fill `out` for slot k and return false to leave the slot empty. */
  place(k: number, out: Placement): boolean;
}
interface Placement { t: number; u: number; scale: number; yaw: number; sink: number; tilt: number; hue: number }

export interface Props { update(dist: number): void }

export function createProps(scene: THREE.Scene): Props {
  const kinds: Kind[] = [];
  const dummy = new THREE.Object3D();
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  const slots = (gap: number) => Math.ceil((AHEAD + BEHIND) / gap) + 1;

  const add = (geos: [THREE.BufferGeometry, THREE.Material][], gap: number, shadow: boolean, place: Kind['place']) => {
    const count = slots(gap);
    const meshes = geos.map(([g, m]) => {
      const im = new THREE.InstancedMesh(g, m, count);
      im.frustumCulled = false;
      im.castShadow = shadow;
      im.receiveShadow = true;
      scene.add(im);
      return im;
    });
    kinds.push({ meshes, count, gap, place });
  };

  /* palms: a looser row inland, a sparser one between the rail and the bluff */
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#8B7B68', roughness: 0.95, flatShading: true });
  const frondMat = new THREE.MeshStandardMaterial({ color: '#5E8E4F', roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
  const trunk = palmTrunk(), crown = palmCrown();
  const palm = (side: 1 | -1, chance: number, salt: number): Kind['place'] => (k, o) => {
    // palms come in runs: a slow noise along the track switches whole groups on and off
    if (hash2(k, salt) > chance * (0.35 + 1.3 * vnoise(k / 6, salt))) return false;
    o.t = k * 13 + (hash2(k, salt + 1) - 0.5) * 7;
    o.u = side > 0 ? EDGE + 6.2 + hash2(k, salt + 2) * 5.5 : -(EDGE + 6.0 + hash2(k, salt + 2) * 1.6);
    o.scale = 0.78 + hash2(k, salt + 3) * 0.5;
    o.yaw = hash2(k, salt + 4) * Math.PI * 2;
    o.tilt = (hash2(k, salt + 5) - 0.5) * 0.14;
    o.sink = 0.25;
    return true;
  };
  add([[trunk, trunkMat], [crown, frondMat]], 13, true, palm(1, 0.62, 100));
  add([[trunk, trunkMat], [crown, frondMat]], 13, true, palm(-1, 0.42, 200));

  /* rocks */
  const rockMat = new THREE.MeshStandardMaterial({ color: '#A1968A', roughness: 0.95, flatShading: true });
  const rockGeos = [lump(1, ROCK.squash, 0.5), lump(2, ROCK.squash * 0.8, 0.62)];
  rockGeos.forEach((geo, v) => {
    add([[geo, rockMat]], 9, true, (k, o) => {
      const s = 300 + v * 40;
      if (hash2(k, s) > 0.5) return false;
      const right = hash2(k, s + 1) < 0.72;
      o.t = k * 9 + hash2(k, s + 2) * 8;
      o.u = right ? EDGE + 5.4 + Math.pow(hash2(k, s + 3), 1.6) * 20 : -(EDGE + 5.3 + hash2(k, s + 3) * 3.5);
      o.scale = (right ? 0.45 : 0.3) + hash2(k, s + 4) * (right ? 1.5 : 0.7);
      o.yaw = hash2(k, s + 5) * Math.PI * 2;
      o.tilt = (hash2(k, s + 6) - 0.5) * 0.3;
      o.sink = 0.18 * o.scale;
      return true;
    });
  });

  /* scrub: dry-green lumps, thick on the hillside and thin by the sea */
  const shrubMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.95, flatShading: true });
  const shrubGeo = lump(5, SHRUB.squash, 0.4);
  const shrub = (salt: number, near: number, far: number, side: 1 | -1, chance: number): Kind['place'] => (k, o) => {
    if (hash2(k, salt) > chance * (0.3 + 1.2 * vnoise(k / 9, salt * 0.37))) return false;
    o.t = k * 3.5 + hash2(k, salt + 1) * 3;
    o.u = side * (EDGE + 5.2 + near + Math.pow(hash2(k, salt + 2), 1.4) * (far - near));
    o.scale = 0.45 + hash2(k, salt + 3) * 1.1;
    o.yaw = hash2(k, salt + 4) * Math.PI * 2;
    o.tilt = 0;
    o.sink = 0.12 * o.scale;
    o.hue = hash2(k, salt + 5);
    return true;
  };
  add([[shrubGeo, shrubMat]], 3.5, false, shrub(500, 0.2, 9, 1, 0.75));
  add([[shrubGeo, shrubMat]], 3.5, false, shrub(600, 9, 60, 1, 0.85));
  add([[shrubGeo, shrubMat]], 3.5, false, shrub(700, 0.1, 3.4, -1, 0.5));
  const shrubTints = [new THREE.Color('#7F9165'), new THREE.Color('#99A377'), new THREE.Color('#6F8760')];

  /* guardrail posts, both sides */
  const postGeo = new THREE.BoxGeometry(RAIL_POST.width, RAIL_POST.height, RAIL_POST.depth);
  postGeo.translate(0, RAIL_POST.height / 2, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: '#9AA2B1', metalness: 0.9, roughness: 0.55 });
  for (const side of [-1, 1] as const) {
    add([[postGeo, postMat]], RAIL_POST.gap, true, (k, o) => {
      o.t = k * RAIL_POST.gap; o.u = side * (EDGE + 0.09); o.scale = 1; o.yaw = 0; o.tilt = 0; o.sink = -1; return true;
    });
  }

  // Each slot's placement is worked out once, when it scrolls into the window,
  // and kept as a ready-made matrix. Per frame only the x and z translation
  // change, written straight into the instance buffers.
  const P: Placement = { t: 0, u: 0, scale: 1, yaw: 0, sink: 0, tilt: 0, hue: 0 };
  const tint = new THREE.Color();
  const caches = kinds.map(kind => ({
    slotOf: new Int32Array(kind.count).fill(-2147483648),
    matrix: new Float32Array(kind.count * 16),
    t: new Float32Array(kind.count),
    u: new Float32Array(kind.count),
    hue: new Float32Array(kind.count),
    first: -2147483648,
  }));

  return {
    update(dist) {
      const base = curve(dist);
      kinds.forEach((kind, n) => {
        const cache = caches[n], count = kind.count;
        const first = Math.floor((dist - BEHIND) / kind.gap);
        const tinted = kind.meshes[0].material === shrubMat;
        const moved = first !== cache.first;
        cache.first = first;
        const out = kind.meshes.map(m => m.instanceMatrix.array as Float32Array);

        for (let i = 0; i < count; i++) {
          const k = first + i, slot = ((k % count) + count) % count;
          if (cache.slotOf[slot] !== k) {
            cache.slotOf[slot] = k;
            P.hue = 0;
            if (kind.place(k, P)) {
              // sink < 0 marks something bolted to the road edge rather than planted in the ground
              dummy.position.set(0, P.sink < 0 ? 0 : groundHeight(P.t, P.u) - P.sink, 0);
              dummy.rotation.set(P.tilt, P.yaw, P.tilt * 0.6);
              dummy.scale.setScalar(P.scale);
              dummy.updateMatrix();
              cache.matrix.set(dummy.matrix.elements, slot * 16);
            } else {
              cache.matrix.set(HIDDEN.elements, slot * 16);
            }
            cache.t[slot] = P.t; cache.u[slot] = P.u; cache.hue[slot] = P.hue;
          }
          const src = cache.matrix.subarray(slot * 16, slot * 16 + 16);
          const x = cache.u[slot] + curve(cache.t[slot]) - base, z = -(cache.t[slot] - dist);
          for (const arr of out) { arr.set(src, i * 16); arr[i * 16 + 12] = x; arr[i * 16 + 14] = z; }
          if (tinted && moved) kind.meshes[0].setColorAt(i, tint.copy(shrubTints[Math.floor(cache.hue[slot] * 3) % 3]));
        }
        for (const m of kind.meshes) {
          m.instanceMatrix.needsUpdate = true;
          if (tinted && moved && m.instanceColor) m.instanceColor.needsUpdate = true;
        }
      });
    },
  };
}
