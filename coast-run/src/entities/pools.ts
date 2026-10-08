import * as THREE from 'three';
import { buildCar } from '../car/buildCar';
import { mergeCar } from '../car/mergeCar';
import { LANES, ONCOMING_LANES, POOL, SAME_LANES, TRAFFIC_PAINTS } from '../game/constants';

// Object pools. Each pool is an array of plain records; the meshes are either
// instanced (traffic, coins) or one small mesh per record (pads, obstacles,
// skids). Positions are stored in track space (trackZ, laneX) and turned into
// scene space every frame by place().

export interface TrafficCar {
  active: boolean; trackZ: number; lane: number; laneX: number;
  speed: number; dir: 1 | -1; passed: boolean;
}
export interface Pad { active: boolean; trackZ: number; laneX: number; mesh: THREE.Mesh }
export interface Coin { active: boolean; trackZ: number; laneX: number; spin: number }
export interface Obstacle { active: boolean; trackZ: number; laneX: number; wide: boolean; mesh: THREE.Group }
export interface Skid { active: boolean; trackZ: number; laneX: number; life: number; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> }

export interface Pools {
  traffic: TrafficCar[];
  pads: Pad[];
  coins: Coin[];
  obstacles: Obstacle[];
  skids: Skid[];
  spawnTraffic(dist: number): void;
  spawnCoinArc(dist: number): void;
  spawnObstacle(dist: number): void;
  spawnPad(dist: number): void;
  spawnSkid(dist: number, x: number, side: number): void;
  /** Write one traffic car's pose into the instanced meshes. */
  placeTraffic(i: number, x: number, z: number, yaw: number): void;
  hideTraffic(i: number): void;
  placeCoin(i: number, x: number, z: number): void;
  hideCoin(i: number): void;
  /** Upload instance matrices; call once per frame after placing. */
  commit(): void;
  reset(): void;
}

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** Three chevrons pointing down the road, white on mid-grey, for the boost pads. */
function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#6E6E6E'; x.fillRect(0, 0, 128, 256);
  x.strokeStyle = '#FFFFFF'; x.lineWidth = 18; x.lineJoin = 'miter';
  for (let i = 0; i < 3; i++) {
    const y = 60 + i * 76;
    x.beginPath(); x.moveTo(22, y + 30); x.lineTo(64, y - 22); x.lineTo(106, y + 30); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createPools(scene: THREE.Scene): Pools {
  const m4 = new THREE.Matrix4();
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  /* ---- traffic: 13 cars drawn as 7 instanced meshes, one per material ---- */
  const trafficMeshes = mergeCar(buildCar({ clearcoat: false })).map(batch => {
    const material = batch.material.clone();
    const isPaint = batch.name === 'paint';
    if (isPaint) material.color.set(0xffffff);       // the instance colour carries the paint
    const mesh = new THREE.InstancedMesh(batch.geometry, material, POOL.traffic);
    mesh.name = 'traffic-' + batch.name;
    mesh.frustumCulled = false;
    mesh.castShadow = false;                         // traffic never casts shadows
    mesh.receiveShadow = true;
    if (isPaint) {
      const c = new THREE.Color();
      for (let i = 0; i < POOL.traffic; i++) mesh.setColorAt(i, c.set(TRAFFIC_PAINTS[i % TRAFFIC_PAINTS.length]));
    }
    for (let i = 0; i < POOL.traffic; i++) mesh.setMatrixAt(i, HIDDEN);
    scene.add(mesh);
    return mesh;
  });
  const traffic: TrafficCar[] = Array.from({ length: POOL.traffic }, () => (
    { active: false, trackZ: 0, lane: 0, laneX: 0, speed: 20, dir: 1 as const, passed: false }));

  /* ---- boost pads ---- */
  const padGeo = new THREE.BoxGeometry(2.6, 0.04, 7);
  const chevrons = chevronTexture();
  // Matte and self-lit, so the pad keeps its blue instead of mirroring the sky at a grazing angle
  const padMat = new THREE.MeshStandardMaterial({
    color: '#1849B4', emissive: '#1F5BD6', emissiveMap: chevrons, emissiveIntensity: 1.7,
    roughness: 0.95, metalness: 0, transparent: true, opacity: 0.94,
  });
  const pads: Pad[] = Array.from({ length: POOL.pads }, () => {
    const mesh = new THREE.Mesh(padGeo, padMat);
    mesh.visible = false;
    scene.add(mesh);
    return { active: false, trackZ: 0, laneX: 0, mesh };
  });

  /* ---- coins: one instanced mesh ---- */
  // a turned coin: raised rim, recessed face. Polished metal, so it flashes the sky as it spins.
  const coinGeo = new THREE.LatheGeometry([
    [0, 0.022], [0.30, 0.022], [0.33, 0.04], [0.42, 0.04], [0.42, -0.04], [0.33, -0.04], [0.30, -0.022], [0, -0.022],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 28);
  coinGeo.rotateX(Math.PI / 2);
  const coinMesh = new THREE.InstancedMesh(coinGeo, new THREE.MeshStandardMaterial({
    color: '#E8A03C', emissive: '#E8A03C', emissiveIntensity: 0.45, metalness: 1, roughness: 0.3, flatShading: true }), POOL.coins);
  coinMesh.frustumCulled = false;
  for (let i = 0; i < POOL.coins; i++) coinMesh.setMatrixAt(i, HIDDEN);
  scene.add(coinMesh);
  const coins: Coin[] = Array.from({ length: POOL.coins }, () => ({ active: false, trackZ: 0, laneX: 0, spin: 0 }));

  /* ---- obstacles: 6 cones and 3 barriers ---- */
  const coneMat = new THREE.MeshStandardMaterial({ color: '#E8A03C', roughness: 0.45 });
  const coneBandMat = new THREE.MeshStandardMaterial({ color: '#F6F7FA', roughness: 0.6 });
  const barrierMat = new THREE.MeshStandardMaterial({ color: '#D9DCE4', roughness: 0.9 });
  const coneBaseGeo = new THREE.BoxGeometry(0.62, 0.06, 0.62);
  const coneBodyGeo = new THREE.ConeGeometry(0.26, 0.78, 16);
  const coneBandGeo = new THREE.CylinderGeometry(0.19, 0.22, 0.13, 16);
  const barrierGeo = new THREE.BoxGeometry(2.2, 0.72, 0.6);
  const stripeGeo = new THREE.BoxGeometry(0.5, 0.5, 0.62);
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    return m;
  };
  const makeCone = () => new THREE.Group().add(
    part(coneBaseGeo, coneMat, 0, 0.03), part(coneBodyGeo, coneMat, 0, 0.45), part(coneBandGeo, coneBandMat, 0, 0.46));
  const makeBarrier = () => new THREE.Group().add(
    part(stripeGeo, coneMat, -0.55, 0.38), part(stripeGeo, coneMat, 0.55, 0.38), part(barrierGeo, barrierMat, 0, 0.36));
  const obstacles: Obstacle[] = Array.from({ length: POOL.obstacles }, (_, i) => {
    const wide = i % 3 === 0;
    const mesh = wide ? makeBarrier() : makeCone();
    mesh.visible = false;
    scene.add(mesh);
    return { active: false, trackZ: 0, laneX: 0, wide, mesh };
  });

  /* ---- skid marks ---- */
  const skidGeo = new THREE.PlaneGeometry(0.22, 1.6);
  const skidMat = new THREE.MeshBasicMaterial({ color: '#1B2030', transparent: true, opacity: 0.4, depthWrite: false });
  const skids: Skid[] = Array.from({ length: POOL.skids }, () => {
    const mesh = new THREE.Mesh(skidGeo, skidMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    return { active: false, trackZ: 0, laneX: 0, life: 0, mesh };
  });

  return {
    traffic, pads, coins, obstacles, skids,

    spawnTraffic(dist) {
      const free = traffic.find(t => !t.active);
      if (!free) return;
      const oncoming = Math.random() < 0.4;
      const lane = pick(oncoming ? ONCOMING_LANES : SAME_LANES);
      const z = dist + (oncoming ? 300 + Math.random() * 60 : 235 + Math.random() * 60);
      if (traffic.some(t => t.active && t.lane === lane && Math.abs(t.trackZ - z) < 34)) return;
      Object.assign(free, {
        active: true, trackZ: z, lane, laneX: LANES[lane], dir: oncoming ? -1 : 1,
        speed: oncoming ? 20 + Math.random() * 8 : 17 + Math.random() * 9, passed: false,
      });
    },

    spawnCoinArc(dist) {
      const lane = LANES[pick(SAME_LANES)];
      const z0 = dist + 200 + Math.random() * 60;
      const drift = (Math.random() - 0.5) * 3;
      let placed = 0;
      for (const c of coins) {
        if (c.active || placed >= 6) continue;
        Object.assign(c, { active: true, trackZ: z0 + placed * 9, laneX: lane + drift * (placed / 6) });
        placed++;
      }
    },

    spawnObstacle(dist) {
      const free = obstacles.find(o => !o.active);
      if (!free) return;
      const lane = LANES[pick(SAME_LANES)];
      const z = dist + 230 + Math.random() * 60;
      if (traffic.some(t => t.active && Math.abs(t.laneX - lane) < 1 && Math.abs(t.trackZ - z) < 40)) return;
      Object.assign(free, { active: true, trackZ: z, laneX: lane + (free.wide ? 0 : (Math.random() - 0.5) * 1.4) });
      free.mesh.visible = true;
    },

    spawnPad(dist) {
      const free = pads.find(p => !p.active);
      if (!free) return;
      Object.assign(free, { active: true, trackZ: dist + 220 + Math.random() * 80, laneX: pick(LANES) });
      free.mesh.visible = true;
    },

    spawnSkid(dist, x, side) {
      const free = skids.find(s => !s.active);
      if (!free) return;
      Object.assign(free, { active: true, trackZ: dist - 1.4, laneX: x + side * 0.9, life: 1 });
      free.mesh.visible = true;
      free.mesh.material.opacity = 0.4;
    },

    placeTraffic(i, x, z, yaw) {
      m4.makeRotationY(yaw).setPosition(x, 0, z);
      for (const mesh of trafficMeshes) mesh.setMatrixAt(i, m4);
    },
    hideTraffic(i) { for (const mesh of trafficMeshes) mesh.setMatrixAt(i, HIDDEN); },
    placeCoin(i, x, z) { coinMesh.setMatrixAt(i, m4.makeRotationY(coins[i].spin).setPosition(x, 0.75, z)); },
    hideCoin(i) { coinMesh.setMatrixAt(i, HIDDEN); },
    commit() {
      for (const mesh of trafficMeshes) mesh.instanceMatrix.needsUpdate = true;
      coinMesh.instanceMatrix.needsUpdate = true;
    },

    reset() {
      traffic.forEach((t, i) => { t.active = false; this.hideTraffic(i); });
      coins.forEach((c, i) => { c.active = false; this.hideCoin(i); });
      for (const p of pads) { p.active = false; p.mesh.visible = false; }
      for (const o of obstacles) { o.active = false; o.mesh.visible = false; }
      for (const s of skids) { s.active = false; s.mesh.visible = false; }
      this.commit();
    },
  };
}
