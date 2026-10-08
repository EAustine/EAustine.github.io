import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Car } from './buildCar';

export interface CarBatch {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

/**
 * Collapse a built car (about 70 meshes) into one geometry per material (7).
 * Every part's transform is baked in, so a batch can be drawn as a single mesh
 * or instanced. The source car is left untouched.
 */
export function mergeCar(car: Car): CarBatch[] {
  car.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();

  car.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    // mergeGeometries needs every input indexed or none, and matching attributes
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    g.applyMatrix4(mesh.matrixWorld);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const list = byMaterial.get(mat);
    if (list) list.push(g); else byMaterial.set(mat, [g]);
  });

  const batches: CarBatch[] = [];
  for (const [material, parts] of byMaterial) {
    const geometry = mergeGeometries(parts, false);
    parts.forEach(p => p.dispose());
    if (!geometry) throw new Error(`mergeCar: could not merge the "${material.name}" parts`);
    batches.push({ name: material.name, geometry, material });
  }
  return batches;
}
