import * as THREE from 'three';

// The sky is painted once into a cube map by a shader: gradient, sun, clouds
// and two layers of far ridges. That one cube is both the visible background
// and, prefiltered, the image-based light for every material. Baking it means
// the sky costs nothing per frame.

/** Late-afternoon sun. Elevation and azimuth in degrees; azimuth 0 is straight
 *  down the road (-z), positive turns toward the sea (-x). */
export const SUN = { elevation: 30, azimuth: 60 };

const rad = (d: number) => d * Math.PI / 180;
/** Unit vector pointing at the sun. */
export const SUN_DIR = new THREE.Vector3(
  -Math.sin(rad(SUN.azimuth)) * Math.cos(rad(SUN.elevation)),
  Math.sin(rad(SUN.elevation)),
  -Math.cos(rad(SUN.azimuth)) * Math.cos(rad(SUN.elevation)),
).normalize();

// Palette. Cool blues overhead, warming toward a peach haze around the sun.
export const SKY = {
  zenith: '#4F86E8',
  mid: '#9DC0F8',
  horizon: '#DCE6F6',     // also the fog colour, so far geometry melts into the sky
  warm: '#FFD9C7',        // peach, the glow around the sun
  ground: '#8D8B8A',      // what reflections see below the horizon
  ridgeFar: '#B9CBEA',
  ridgeNear: '#9FB3D6',
  cloudLit: '#FFFFFF',
  cloudShade: '#C3D0E8',
};

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uSun, cZenith, cMid, cHorizon, cWarm, cGround, cRidgeFar, cRidgeNear, cCloudLit, cCloudShade;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.02 + vec2(13.7, 7.3); a *= 0.5; }
  return s;
}
// ridge line height (as sin of elevation) at a given compass angle
float ridge(float az, float scale, float seed) {
  float n = noise(vec2(az * scale + seed, seed)) * 0.6 + noise(vec2(az * scale * 2.7 + seed, seed + 4.0)) * 0.28
          + noise(vec2(az * scale * 7.0 + seed, seed + 9.0)) * 0.12;
  return n;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float sd = max(dot(d, uSun), 0.0);
  float az = atan(d.x, -d.z);                       // 0 down the road, negative toward the sea

  // gradient
  vec3 col = mix(cHorizon, cMid, smoothstep(0.0, 0.2, h));
  col = mix(col, cZenith, smoothstep(0.14, 0.8, h));

  // warm haze low in the sky on the sun's side, plus the halo and the disc
  float low = 1.0 - smoothstep(0.0, 0.42, h);
  col = mix(col, cWarm, pow(sd, 4.0) * 0.42 * (0.3 + 0.7 * low));
  col += cWarm * pow(sd, 160.0) * 0.45;
  col += vec3(1.0, 0.93, 0.80) * (pow(sd, 1400.0) * 1.2 + smoothstep(0.99975, 0.99992, sd) * 40.0);

  // clouds on a flat layer overhead, thinning toward the horizon
  if (h > 0.0) {
    vec2 p = d.xz / (h + 0.16);
    float c = fbm(p * 0.55 + vec2(3.1, 1.7));
    float wisps = fbm(p * 1.9 + vec2(9.0, 4.0));
    float cover = smoothstep(0.50, 0.74, c * 0.8 + wisps * 0.2);
    float fade = smoothstep(0.03, 0.22, h);
    float lit = clamp(0.55 + 0.45 * fbm(p * 0.55 + vec2(3.1, 1.7) + uSun.xz * 0.35) - (c - 0.5), 0.0, 1.0);
    vec3 cloud = mix(cCloudShade, cCloudLit, lit) + cWarm * pow(sd, 6.0) * 0.5;
    col = mix(col, cloud, cover * fade * 0.9);
  }

  // far ridges: headlands and islands on the sea side, hills inland
  float inland = smoothstep(-0.2, 0.9, az) * (1.0 - smoothstep(2.2, 3.0, abs(az)));
  float r1 = (ridge(az, 2.2, 3.0) * 0.050 + 0.004) * mix(0.55, 1.5, inland);
  float r2 = (ridge(az, 3.4, 11.0) * 0.034 - 0.004) * mix(0.35, 1.8, inland);
  col = mix(col, mix(cRidgeFar, cHorizon, 0.35), smoothstep(r1 + 0.0015, r1 - 0.0015, h) * step(0.0, h));
  col = mix(col, mix(cRidgeNear, cHorizon, 0.2), smoothstep(r2 + 0.0015, r2 - 0.0015, h) * step(0.0, h));

  // below the horizon: haze first, then a neutral ground for reflections
  col = mix(col, cHorizon, step(h, 0.0));
  col = mix(col, cGround, smoothstep(-0.02, -0.4, h));

  col += (hash(d.xy * 913.0 + d.z * 271.0) - 0.5) * 0.006;       // dither against banding
  gl_FragColor = vec4(col, 1.0);
}`;

export interface Sky {
  background: THREE.CubeTexture;
  environment: THREE.Texture;
  fogColor: THREE.Color;
}

export function bakeSky(renderer: THREE.WebGLRenderer, size = 1024): Sky {
  const c = (hex: string) => ({ value: new THREE.Color(hex) });
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uSun: { value: SUN_DIR },
      cZenith: c(SKY.zenith), cMid: c(SKY.mid), cHorizon: c(SKY.horizon), cWarm: c(SKY.warm), cGround: c(SKY.ground),
      cRidgeFar: c(SKY.ridgeFar), cRidgeNear: c(SKY.ridgeNear), cCloudLit: c(SKY.cloudLit), cCloudShade: c(SKY.cloudShade),
    },
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), material);
  const stage = new THREE.Scene().add(dome);

  const target = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(0.1, 50, target);
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;        // bake linear HDR; tone map once, on screen
  cubeCam.update(renderer, stage);
  renderer.toneMapping = prevTone;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromCubemap(target.texture).texture;
  pmrem.dispose();
  dome.geometry.dispose();
  material.dispose();

  return { background: target.texture, environment, fogColor: new THREE.Color(SKY.horizon) };
}
