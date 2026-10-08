import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// Mid-engine supercar, built from primitives. The nose points toward -z.
// buildCar({ paint }) -> THREE.Group of named meshes with named materials.
// Ported from car-model.js. Every vertex position is as the prototype had it.
// What changed since: the materials now respond physically to an environment
// map, and the body's normals are smoothed across shallow creases.

export interface CarMaterials {
  paint: THREE.MeshStandardMaterial;
  carbon: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  alloy: THREE.MeshStandardMaterial;
  lamp: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
}
export type Car = THREE.Group & { userData: { materials: CarMaterials } };
type V3 = [number, number, number];
type P2 = [number, number];

export interface CarOptions {
  paint?: THREE.ColorRepresentation;
  /** Clearcoat paint. Costs a second specular lobe per pixel, so traffic turns it off. */
  clearcoat?: boolean;
}

// Corners sharper than this stay crisp; shallower ones shade as one curved panel.
// The profile's hood, roof and floor breaks are 4 to 23 degrees, its real edges 29 and up.
const CREASE = 25 * Math.PI / 180;

export function buildCar({ paint = 0x3E63F0, clearcoat = true }: CarOptions = {}): Car {
  // Colours are the handoff's. Metalness and roughness follow measured ranges:
  // painted metal is a dielectric under a clearcoat, bare alloy is a full metal.
  const M: CarMaterials = {
    paint: clearcoat
      ? new THREE.MeshPhysicalMaterial({ name: 'paint', color: paint, metalness: 0, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.06 })
      : new THREE.MeshStandardMaterial({ name: 'paint', color: paint, metalness: 0, roughness: 0.22 }),
    carbon: new THREE.MeshStandardMaterial({ name: 'carbon', color: 0x151A26, metalness: 0, roughness: 0.42 }),
    glass: new THREE.MeshStandardMaterial({ name: 'glass', color: 0x0B1226, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.74 }),
    rubber: new THREE.MeshStandardMaterial({ name: 'rubber', color: 0x14161C, metalness: 0, roughness: 0.9 }),
    alloy: new THREE.MeshStandardMaterial({ name: 'alloy', color: 0xC6CCDA, metalness: 1, roughness: 0.28 }),
    lamp: new THREE.MeshStandardMaterial({ name: 'lamp', color: 0xE4ECFF, emissive: 0x9FB6FF, emissiveIntensity: 1.4, roughness: 0.2 }),
    tail: new THREE.MeshStandardMaterial({ name: 'taillight', color: 0xB0121E, emissive: 0x7A0A12, emissiveIntensity: 1.6, roughness: 0.3 }),
  };

  const car = new THREE.Group();
  car.name = 'supercar';
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.position.set(...pos);
    m.rotation.set(...rot);
    car.add(m);
    return m;
  };

  /* ---- body: side profile extruded across the width, then tapered ---- */
  const profile: P2[] = [
    [-2.30, 0.18], [-1.40, 0.13], [1.40, 0.15], [2.18, 0.26],
    [2.22, 0.76], [2.14, 0.90], [1.30, 0.88], [0.34, 1.14],
    [-0.30, 1.18], [-1.00, 0.76], [-1.48, 0.74], [-1.92, 0.62], [-2.22, 0.46], [-2.30, 0.36],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], profile[0][1]);
  profile.slice(1).forEach(p => shape.lineTo(p[0], p[1]));
  shape.closePath();

  const HALF = 0.81;
  // width falls off toward the nose, the tail and the roof. This is what turns
  // a slab extrusion into a car: tumblehome on the greenhouse, tucked-in nose.
  function widthFactor(y: number, z: number): number {
    let fz = 1;
    if (z < -1.20) fz = 1 - 0.22 * Math.min(1, (-1.20 - z) / 1.10);
    else if (z > 1.30) fz = 1 - 0.13 * Math.min(1, (z - 1.30) / 1.00);
    // fender bulges over the axles so the wheels sit under bodywork
    const bulge = (zz: number) => 1 + 0.11 * Math.max(0, 1 - Math.abs(Math.abs(zz) - 1.48) / 0.52);
    if (y < 0.86) fz *= bulge(z);
    let fy = 1;
    if (y > 0.72) fy = 1 - 0.32 * Math.min(1, (y - 0.72) / 0.46);
    else if (y < 0.24) fy = 0.93;
    return fz * fy;
  }
  function taper<G extends THREE.BufferGeometry>(geo: G): G {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setX(i, p.getX(i) * widthFactor(p.getY(i), p.getZ(i)));
    p.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: HALF * 2, bevelEnabled: false, curveSegments: 12, steps: 28,
  });
  bodyGeo.rotateY(-Math.PI / 2);
  bodyGeo.translate(HALF, 0, 0);
  add(toCreasedNormals(taper(bodyGeo), CREASE), M.paint, 'body');

  /* ---- glass ---- */
  const panel = (inset: number, a: P2, b: P2, name: string, mat: THREE.Material) => {
    const dz = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dz, dy);
    const nz = -dy / len, ny = dz / len;      // outward surface normal
    const off = 0.02;
    const g = new THREE.BoxGeometry((HALF + 0.015) * 2, len - inset * 2, 0.022, 28, 14, 1);
    g.rotateX(Math.atan2(dz, dy));
    taper(g.translate(0, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2));
    g.translate(0, ny * off, nz * off);
    add(g, mat, name);
  };
  panel(0.05, [-1.00, 0.74], [-0.30, 1.20], 'windshield', M.glass);
  panel(0.06, [0.34, 1.16], [1.30, 0.90], 'engine-cover', M.glass);

  const sw = new THREE.Shape();
  ([[-0.92, 0.80], [-0.34, 1.12], [0.30, 1.08], [0.26, 0.84]] as P2[]).forEach((p, i) =>
    i ? sw.lineTo(p[0], p[1]) : sw.moveTo(p[0], p[1]));
  sw.closePath();
  const swGeo = new THREE.ExtrudeGeometry(sw, { depth: 0.04, bevelEnabled: false });
  swGeo.rotateY(-Math.PI / 2);
  [-1, 1].forEach(s => {
    const g = swGeo.clone();
    g.translate(s * (HALF + 0.005), 0, 0);
    taper(g);
    g.translate(s * 0.025, 0, 0);
    add(g, M.glass, s < 0 ? 'side-window-left' : 'side-window-right');
  });

  /* ---- wheels ---- */
  const WB = 1.48, TRACK = 0.93, R = 0.33;
  const tireGeo = new THREE.CylinderGeometry(R, R, 0.30, 40);
  const rimGeo = new THREE.CylinderGeometry(R * 0.70, R * 0.70, 0.31, 32);
  const hubGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.33, 16);
  const spokeGeo = new THREE.BoxGeometry(0.05, 0.035, R * 0.62);

  ([[-1, -WB, 'front-left'], [1, -WB, 'front-right'], [-1, WB, 'rear-left'], [1, WB, 'rear-right']] as [number, number, string][])
    .forEach(([sx, z, label]) => {
      const w = new THREE.Group();
      w.name = 'wheel-' + label;
      const tire = new THREE.Mesh(tireGeo, M.rubber); tire.name = 'tire-' + label;
      tire.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(rimGeo, M.alloy); rim.name = 'rim-' + label;
      rim.rotation.z = Math.PI / 2;
      const hub = new THREE.Mesh(hubGeo, M.alloy); hub.name = 'hub-' + label;
      hub.rotation.z = Math.PI / 2;
      w.add(tire, rim, hub);
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(spokeGeo, M.alloy);
        sp.name = `spoke-${label}-${i}`;
        const a = (i / 5) * Math.PI * 2;
        sp.position.set(sx * 0.165, Math.sin(a) * R * 0.34, Math.cos(a) * R * 0.34);
        sp.rotation.x = -a;
        w.add(sp);
      }
      w.position.set(sx * TRACK, R, z);
      car.add(w);
    });

  /* ---- aero & details ---- */
  add(new THREE.BoxGeometry(1.44, 0.05, 0.40), M.carbon, 'front-splitter', [0, 0.11, -2.08]);
  add(new THREE.BoxGeometry(1.52, 0.24, 0.42), M.carbon, 'rear-diffuser', [0, 0.20, 1.98]);
  for (let i = -2; i <= 2; i++)
    add(new THREE.BoxGeometry(0.035, 0.24, 0.44), M.alloy, `diffuser-fin-${i + 2}`, [i * 0.28, 0.21, 1.99]);

  [-1, 1].forEach(s => add(new THREE.BoxGeometry(0.09, 0.24, 0.78), M.carbon,
    s < 0 ? 'intake-left' : 'intake-right', [s * (HALF * widthFactor(0.56, 0.7) - 0.01), 0.56, 0.70]));

  [-1, 1].forEach(s => add(new THREE.BoxGeometry(0.10, 0.09, 1.70), M.carbon,
    s < 0 ? 'skirt-left' : 'skirt-right', [s * 0.78, 0.15, 0]));

  // rear wing
  [-1, 1].forEach(s => add(new THREE.BoxGeometry(0.05, 0.24, 0.16), M.carbon,
    s < 0 ? 'wing-strut-left' : 'wing-strut-right', [s * 0.50, 0.98, 1.80]));
  add(new THREE.BoxGeometry(1.42, 0.05, 0.36), M.carbon, 'rear-wing', [0, 1.12, 1.80], [-0.16, 0, 0]);
  [-1, 1].forEach(s => add(new THREE.BoxGeometry(0.03, 0.14, 0.36), M.carbon,
    s < 0 ? 'wing-endplate-left' : 'wing-endplate-right', [s * 0.72, 1.14, 1.80]));

  // lights
  [-1, 1].forEach(s => {
    add(new THREE.BoxGeometry(0.30, 0.10, 0.10), M.carbon,
      s < 0 ? 'headlight-housing-left' : 'headlight-housing-right', [s * 0.44, 0.50, -2.16], [0.22, 0, 0]);
    add(new THREE.BoxGeometry(0.26, 0.07, 0.10), M.lamp,
      s < 0 ? 'headlight-left' : 'headlight-right', [s * 0.44, 0.505, -2.19], [0.22, 0, 0]);
  });

  // front fascia: centre grille and two corner intakes
  add(new THREE.BoxGeometry(0.80, 0.15, 0.10), M.carbon, 'front-grille', [0, 0.29, -2.31]);
  for (let i = -1; i <= 1; i++)
    add(new THREE.BoxGeometry(0.035, 0.15, 0.12), M.alloy, `grille-fin-${i + 1}`, [i * 0.23, 0.29, -2.32]);
  [-1, 1].forEach(s => add(new THREE.BoxGeometry(0.30, 0.17, 0.10), M.carbon,
    s < 0 ? 'nose-intake-left' : 'nose-intake-right',
    [s * (HALF * widthFactor(0.32, -2.05) - 0.08), 0.32, -2.22], [0, s * 0.12, 0]));
  [-1, 1].forEach(s => add(new THREE.BoxGeometry(0.40, 0.08, 0.06), M.tail,
    s < 0 ? 'taillight-left' : 'taillight-right', [s * 0.42, 0.74, 2.245]));

  // mirrors
  [-1, 1].forEach(s => {
    const bx = HALF * widthFactor(0.70, -0.80);
    add(new THREE.BoxGeometry(0.16, 0.035, 0.05), M.carbon,
      s < 0 ? 'mirror-stalk-left' : 'mirror-stalk-right', [s * (bx + 0.07), 0.70, -0.78], [0, 0, s * -0.12]);
    add(new THREE.BoxGeometry(0.06, 0.09, 0.17), M.carbon,
      s < 0 ? 'mirror-left' : 'mirror-right', [s * (bx + 0.17), 0.73, -0.78], [0, s * 0.1, 0]);
  });

  // exhausts
  [-1, 1].forEach(s => add(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 20), M.alloy,
    s < 0 ? 'exhaust-left' : 'exhaust-right', [s * 0.26, 0.38, 2.25], [Math.PI / 2, 0, 0]));


  car.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  car.userData.materials = M;
  return car as Car;
}
