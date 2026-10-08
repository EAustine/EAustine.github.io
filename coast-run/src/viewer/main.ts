import '@fonts';
import '../styles/tokens.css';
import '../styles/viewer.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { buildCar } from '../car/buildCar';

// Model viewer: studio lighting, orbit controls, a camera framed to the car,
// and OBJ + MTL / GLB export. A TypeScript port of the <three-d-stage> shell
// the prototype used, reduced to what this page needs.

const NAME = 'supercar';
const host = document.getElementById('stage')!;
if (matchMedia('(pointer: coarse)').matches)
  document.querySelector('.note')!.textContent = 'Drag to orbit · pinch to zoom · two fingers to pan';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // three 0.184 retired the soft variant and falls back to this anyway
renderer.toneMapping = THREE.NeutralToneMapping;   // paint reads as its swatch colour
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.2;
controls.addEventListener('start', () => { controls.autoRotate = false; });

// Studio: a soft-box room for reflections and fill, one shadow-casting key, a rim from behind
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(4, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0002;
scene.add(key);
const rim = new THREE.DirectionalLight(0xfff4e6, 1.2);
rim.position.set(-5, 3, -4);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ---- the car, rested on the ground and framed ---- */
const car = buildCar();
const box = new THREE.Box3().setFromObject(car);
ground.position.y = box.min.y;
const sphere = box.getBoundingSphere(new THREE.Sphere());
const fit = () => {
  const w = host.clientWidth || 1, h = host.clientHeight || 1;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
};
fit();
{
  // Frame on the narrower of the two view angles so the car also fits a portrait screen
  const halfV = camera.fov * Math.PI / 360;
  const half = Math.min(halfV, Math.atan(Math.tan(halfV) * camera.aspect));
  const dist = (sphere.radius / Math.tan(half)) * 1.35;
  camera.position.copy(sphere.center).add(new THREE.Vector3(1, 0.55, 1.25).normalize().multiplyScalar(dist));
  camera.near = Math.max(dist / 100, 0.01);
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
  controls.target.copy(sphere.center);
  controls.update();
  const span = sphere.radius * 3;
  const sc = key.shadow.camera;
  sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
  sc.updateProjectionMatrix();
}
scene.add(car);

new ResizeObserver(fit).observe(host);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

/* ---- export ---- */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Unique materials in the car, in first-use order. buildCar already names them. */
function materials(): THREE.MeshStandardMaterial[] {
  const mats: THREE.MeshStandardMaterial[] = [];
  car.traverse(o => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if ((o as THREE.Mesh).isMesh && m && !mats.includes(m)) mats.push(m);
  });
  return mats;
}

function exportObj() {
  const obj = `mtllib ${NAME}.mtl\n` + new OBJExporter().parse(car);
  let mtl = '# Exported by the Coast run model viewer\n';
  for (const m of materials()) {
    mtl += `newmtl ${m.name}\n`;
    mtl += `Kd ${m.color.r.toFixed(4)} ${m.color.g.toFixed(4)} ${m.color.b.toFixed(4)}\n`;
    mtl += 'Ks 0.2000 0.2000 0.2000\n';
    mtl += `Ns ${Math.round((1 - m.roughness) * 200)}\n`;
    mtl += `d ${m.opacity.toFixed(4)}\n\n`;
  }
  download(new Blob([obj], { type: 'text/plain' }), NAME + '.obj');
  download(new Blob([mtl], { type: 'text/plain' }), NAME + '.mtl');
}

async function exportGlb() {
  const buf = await new GLTFExporter().parseAsync(car, { binary: true });
  download(new Blob([buf as ArrayBuffer], { type: 'model/gltf-binary' }), NAME + '.glb');
}

const objBtn = document.getElementById('objBtn') as HTMLButtonElement;
const glbBtn = document.getElementById('glbBtn') as HTMLButtonElement;
objBtn.addEventListener('click', exportObj);
glbBtn.addEventListener('click', () => { void exportGlb(); });
objBtn.disabled = glbBtn.disabled = false;

if (import.meta.env.DEV) Object.assign(window, { __viewer: { car, exportObj, exportGlb } });
