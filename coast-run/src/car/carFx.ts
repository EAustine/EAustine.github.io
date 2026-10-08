import * as THREE from 'three';
import type { Car } from './buildCar';

// The moving parts of the player's car: wheels that turn and steer, brake
// lights, and the boost flames. Kept out of buildCar so the model the viewer
// exports stays a clean static mesh.

const WHEEL_RADIUS = 0.33;
const STEER_LOCK = 0.32;                 // rad at full steering input
const EXHAUSTS: [number, number, number][] = [[-0.26, 0.38, 2.34], [0.26, 0.38, 2.34]];
const TAIL_IDLE = 1.6, TAIL_BRAKE = 7;   // emissive intensity on the handoff's #7A0A12

export interface CarFx {
  update(dt: number, time: number, speed: number, steer: number, braking: number, boost: number): void;
}

export function createCarFx(car: Car): CarFx {
  const wheel = (name: string) => {
    const w = car.getObjectByName('wheel-' + name)!;
    w.rotation.order = 'YXZ';            // steer about the vertical, then roll about the axle
    return w;
  };
  const front = [wheel('front-left'), wheel('front-right')];
  const rear = [wheel('rear-left'), wheel('rear-right')];

  // flames: an outer blue cone with a pale core, drawn additively
  const cone = (radius: number) => {
    const g = new THREE.ConeGeometry(radius, 1, 10, 1, true);
    g.translate(0, 0.5, 0);
    g.rotateX(Math.PI / 2);              // base at the pipe, tip trailing toward +z
    return g;
  };
  const glow = (color: string, opacity: number) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  const outerGeo = cone(0.075), coreGeo = cone(0.04);
  const outerMat = glow('#5A86FF', 0.85), coreMat = glow('#E8F0FF', 0.95);
  const flames = EXHAUSTS.map(([x, y, z]) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(outerGeo, outerMat), new THREE.Mesh(coreGeo, coreMat));
    g.position.set(x, y, z);
    g.visible = false;
    car.add(g);
    return g;
  });

  const tail = car.userData.materials.tail;
  let roll = 0, glowLevel = TAIL_IDLE;

  return {
    update(dt, time, speed, steer, braking, boost) {
      roll -= (speed / WHEEL_RADIUS) * dt;                       // rolling toward -z
      for (const w of rear) w.rotation.x = roll;
      for (const w of front) { w.rotation.x = roll; w.rotation.y = -steer * STEER_LOCK; }

      const target = braking > 0 ? TAIL_BRAKE : TAIL_IDLE;
      glowLevel += (target - glowLevel) * Math.min(1, dt * 18);
      tail.emissiveIntensity = glowLevel;

      const on = boost > 0;
      const length = on ? (1.1 + 0.5 * Math.min(1, boost)) * (0.82 + 0.18 * Math.sin(time * 61) * Math.sin(time * 23)) : 0;
      flames.forEach((f, i) => {
        f.visible = on;
        f.scale.set(1, 1, length * (i ? 1 : 0.94));
      });
    },
  };
}
