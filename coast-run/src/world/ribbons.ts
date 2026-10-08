import * as THREE from 'three';
import { AHEAD, EDGE, ROAD_HALF, STEP } from '../game/constants';
import { curve } from './curve';
import { mulberry32 } from './noise';

// Road, shoulders and guardrails are strips of vertices sampled every STEP
// metres. Their x is rewritten each frame from curve(), so the world bends
// around a player who never leaves z = 0.

const BEHIND = 60;       // drawn further back than gameplay needs, so the menu turntable has road behind it
const ROWS = Math.round((AHEAD + BEHIND) / STEP) + 1;
const rowT = (i: number) => -BEHIND + i * STEP;
const TEX_LENGTH = 32;   // metres of road covered by one repeat of the texture

type Section = [x: number, y: number][];
interface Ribbon { mesh: THREE.Mesh; cols: number; baseX: number[] }

function ribbon(scene: THREE.Scene, section: Section, material: THREE.Material): Ribbon {
  // section: the cross-section, left to right
  const cols = section.length;
  const pos = new Float32Array(ROWS * cols * 3);
  const uv = new Float32Array(ROWS * cols * 2);
  const idx: number[] = [];
  for (let i = 0; i < ROWS; i++) {
    for (let c = 0; c < cols; c++) {
      const k = i * cols + c;
      pos[k * 3] = section[c][0];
      pos[k * 3 + 1] = section[c][1];
      pos[k * 3 + 2] = -rowT(i);
      uv[k * 2] = c / (cols - 1);
      uv[k * 2 + 1] = rowT(i) / TEX_LENGTH;
      if (i < ROWS - 1 && c < cols - 1) {
        const a = k, b = k + 1, cc = k + cols, d = k + cols + 1;
        idx.push(a, cc, b, b, cc, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, cols, baseX: section.map(s => s[0]) };
}

// Road surface. One repeat covers the full 18 m width and TEX_LENGTH metres of
// length. Two canvases: colour, and a roughness map so worn wheel tracks and
// paint catch the sky a little more than raw asphalt does.
const TEX_W = 512, TEX_H = 1024;
// The prototype filled #33384A but left the canvas untagged, so the renderer
// read it as linear and showed it about this light. Tagging the texture sRGB
// (correct) needs the lighter hex to keep the road the grey that was approved.
const ASPHALT = '#565B70';
const LANE_PX = (x: number) => (x + ROAD_HALF) / (ROAD_HALF * 2) * TEX_W;   // metres from centre to pixels

function roadTextures(): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const rnd = mulberry32(2026);
  const mk = () => { const c = document.createElement('canvas'); c.width = TEX_W; c.height = TEX_H; return c; };
  const colour = mk(), rough = mk();
  const x = colour.getContext('2d')!, r = rough.getContext('2d')!;

  /* asphalt */
  x.fillStyle = ASPHALT; x.fillRect(0, 0, TEX_W, TEX_H);
  r.fillStyle = 'rgb(0,244,0)'; r.fillRect(0, 0, TEX_W, TEX_H);          // roughness lives in the green channel
  for (let i = 0; i < 9000; i++) {                                       // aggregate: light and dark specks
    const s = 0.8 + rnd() * 2.2;
    x.globalAlpha = 0.10 + rnd() * 0.22;
    x.fillStyle = rnd() < 0.55 ? '#6C7186' : '#3B3F52';
    x.fillRect(rnd() * TEX_W, rnd() * TEX_H, s, s);
  }
  x.globalAlpha = 1;

  /* wheel tracks: polished, slightly paler bands either side of each lane centre */
  for (const lane of [-6, -2, 2, 6]) {
    for (const side of [-0.8, 0.8]) {
      const cx = LANE_PX(lane + side), w = 20;
      const g = x.createLinearGradient(cx - w, 0, cx + w, 0);
      g.addColorStop(0, 'rgba(122,127,146,0)'); g.addColorStop(0.5, 'rgba(122,127,146,0.18)'); g.addColorStop(1, 'rgba(122,127,146,0)');
      x.fillStyle = g; x.fillRect(cx - w, 0, w * 2, TEX_H);
      const gr = r.createLinearGradient(cx - w, 0, cx + w, 0);
      gr.addColorStop(0, 'rgba(0,200,0,0)'); gr.addColorStop(0.5, 'rgba(0,200,0,0.6)'); gr.addColorStop(1, 'rgba(0,200,0,0)');
      r.fillStyle = gr; r.fillRect(cx - w, 0, w * 2, TEX_H);
    }
    // a faint dark stripe down the lane centre, where oil drips
    const cx = LANE_PX(lane), g = x.createLinearGradient(cx - 12, 0, cx + 12, 0);
    g.addColorStop(0, 'rgba(20,22,30,0)'); g.addColorStop(0.5, 'rgba(20,22,30,0.14)'); g.addColorStop(1, 'rgba(20,22,30,0)');
    x.fillStyle = g; x.fillRect(cx - 12, 0, 24, TEX_H);
  }

  /* markings, same layout as the prototype at twice the resolution */
  const paint = (fill: string, px: number, py: number, w: number, h: number) => {
    x.fillStyle = fill; x.fillRect(px, py, w, h);
    r.fillStyle = 'rgb(0,185,0)'; r.fillRect(px, py, w, h);              // road paint is smoother than asphalt
  };
  paint('#E9EDF6', 12, 0, 10, TEX_H); paint('#E9EDF6', 490, 0, 10, TEX_H);            // edge lines
  for (const cx of [136, 376]) for (let y = 0; y < TEX_H; y += 256) paint('#E9EDF6', cx - 4, y, 8, 108);   // lane dashes
  paint('#E8A03C', 244, 0, 8, TEX_H); paint('#E8A03C', 262, 0, 8, TEX_H);             // double centre line

  /* wear: asphalt showing through the paint */
  x.fillStyle = ASPHALT;
  for (let i = 0; i < 2600; i++) {
    const band = [12, 490, 132, 372, 244, 262][Math.floor(rnd() * 6)];
    x.globalAlpha = 0.25 + rnd() * 0.35;
    x.fillRect(band + rnd() * 10, rnd() * TEX_H, 0.8 + rnd() * 1.6, 0.8 + rnd() * 2.4);
  }
  x.globalAlpha = 1;

  const finish = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;   // colour is sRGB; roughness is data and stays linear
    return t;
  };
  return { map: finish(colour, true), roughnessMap: finish(rough, false) };
}

// W-beam guardrail cross-section: two ribs, 0.31 m tall, top edge 0.77 m above the road.
const railSection = (side: 1 | -1): Section => {
  const x = side * EDGE, rib = -side * 0.055;      // ribs stand proud toward the traffic
  return [[x, 0.46], [x + rib, 0.50], [x + rib, 0.56], [x, 0.615], [x + rib, 0.67], [x + rib, 0.73], [x, 0.77]];
};

export interface Ribbons { update(dist: number): void }

export function createRibbons(scene: THREE.Scene): Ribbons {
  const tex = roadTextures();
  const road = ribbon(scene, [[-ROAD_HALF, 0], [ROAD_HALF, 0]],
    new THREE.MeshStandardMaterial({ map: tex.map, roughnessMap: tex.roughnessMap, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
  road.mesh.receiveShadow = true;

  const shoulderMat = new THREE.MeshStandardMaterial({ color: '#C9BFA4', roughness: 1, side: THREE.DoubleSide });
  const railMat = new THREE.MeshStandardMaterial({ color: '#B9C0CE', metalness: 0.9, roughness: 0.58, side: THREE.DoubleSide });
  const all = [
    road,
    ribbon(scene, [[-EDGE - 5, -0.04], [-ROAD_HALF, 0.001]], shoulderMat),
    ribbon(scene, [[ROAD_HALF, 0.001], [EDGE + 5, -0.04]], shoulderMat),
    ribbon(scene, railSection(-1), railMat),
    ribbon(scene, railSection(1), railMat),
  ];
  all[1].mesh.receiveShadow = all[2].mesh.receiveShadow = true;
  all[3].mesh.castShadow = all[4].mesh.castShadow = true;
  const offsets = new Float32Array(ROWS);

  return {
    update(dist) {
      const base = curve(dist);
      for (let i = 0; i < ROWS; i++) offsets[i] = curve(dist + rowT(i)) - base;
      for (const r of all) {
        const p = r.mesh.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < ROWS; i++)
          for (let c = 0; c < r.cols; c++) p.setX(i * r.cols + c, r.baseX[c] + offsets[i]);
        p.needsUpdate = true;
      }
      // One repeat per TEX_LENGTH metres, moving at road speed. A point at
      // track distance T always samples v = T / TEX_LENGTH.
      const v = (dist / TEX_LENGTH) % 1;
      tex.map.offset.y = v;
      tex.roughnessMap.offset.y = v;
    },
  };
}
