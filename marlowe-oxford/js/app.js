/* Marlowe — stage, materials and interface.
 *
 * Structure:
 *   grain()      procedural leather textures, generated on a canvas at load
 *   stage()      renderer, studio environment, lights, contact shadow
 *   model()      fetches the .glb and maps each mesh to a named zone
 *   camera       one eased rig; picking a part flies to the angle that shows it
 *   rail/sheet   the part row doubles as the running spec summary
 */
(function () {
'use strict';

var C = window.MarloweCatalogue, GLB = window.MarloweGLB;
var PI = Math.PI;
var CALM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Set window.MARLOWE_MODEL_URL before this script to serve the model from a
// CDN or another origin. That origin must send permissive CORS headers.
var MODEL_URL = window.MARLOWE_MODEL_URL || 'assets/model/marlowe-oxford.glb';

var S = C.decode(location.hash.replace(/^#/, ''));

/* ============================ procedural grain ============================ */
function hash2(x, y, s) { var n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); }
function vnoise(x, y, per, s) {
  var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  function h(a, b) { return hash2(((a % per) + per) % per, ((b % per) + per) % per, s); }
  var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return h(xi, yi) * (1 - u) * (1 - v) + h(xi + 1, yi) * u * (1 - v)
       + h(xi, yi + 1) * (1 - u) * v + h(xi + 1, yi + 1) * u * v;
}
function fbm(x, y, oct, base, s) {
  var amp = 0.5, sum = 0, norm = 0, f = 1;
  for (var i = 0; i < oct; i++) { sum += amp * vnoise(x * base * f, y * base * f, base * f, s + i * 13); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}
var TEX = 256;
function heightField(kind) {
  var h = new Float32Array(TEX * TEX), x, y, i, seeds = [];
  if (kind === 'pebble') for (i = 0; i < 86; i++) seeds.push([Math.random(), Math.random(), 0.036 + Math.random() * 0.028]);
  for (y = 0; y < TEX; y++) for (x = 0; x < TEX; x++) {
    var u = x / TEX, v = y / TEX, val;
    if (kind === 'calf') {
      val = 0.5 + (fbm(u, v, 4, 48, 1) - 0.5) * 0.55 + (fbm(u, v, 2, 140, 7) - 0.5) * 0.30;
    } else if (kind === 'suede') {
      val = 0.5 + (fbm(u, v, 2, 180, 3) - 0.5) + (fbm(u, v, 3, 64, 11) - 0.5) * 0.35 + (hash2(x, y, 29) - 0.5) * 0.35;
    } else if (kind === 'pebble') {
      // cells seeded on a torus so the grain tiles with no visible seam
      var best = 9;
      for (i = 0; i < seeds.length; i++) {
        var dx = Math.abs(u - seeds[i][0]); dx = Math.min(dx, 1 - dx);
        var dy = Math.abs(v - seeds[i][1]); dy = Math.min(dy, 1 - dy);
        var d = Math.hypot(dx, dy) / seeds[i][2];
        if (d < best) best = d;
      }
      val = 0.35 + Math.pow(1 - Math.min(1, best), 0.55) * 0.60 + (fbm(u, v, 3, 90, 5) - 0.5) * 0.18;
    } else {
      // cordovan has no grain, it has low-frequency ripple
      val = 0.5 + (fbm(u, v, 3, 10, 17) - 0.5) * 0.70 + (fbm(u, v, 2, 150, 23) - 0.5) * 0.14;
    }
    h[y * TEX + x] = Math.max(0, Math.min(1, val));
  }
  return h;
}
function normalMap(h, strength) {
  var c = document.createElement('canvas'); c.width = c.height = TEX;
  var g = c.getContext('2d'), img = g.createImageData(TEX, TEX), d = img.data;
  function H(x, y) { return h[(((y % TEX) + TEX) % TEX) * TEX + (((x % TEX) + TEX) % TEX)]; }
  for (var y = 0; y < TEX; y++) for (var x = 0; x < TEX; x++) {
    var dx = (H(x - 1, y) - H(x + 1, y)) * strength, dy = (H(x, y - 1) - H(x, y + 1)) * strength;
    var L = Math.sqrt(dx * dx + dy * dy + 1), i = (y * TEX + x) * 4;
    d[i] = (dx / L * 0.5 + 0.5) * 255; d[i + 1] = (dy / L * 0.5 + 0.5) * 255;
    d[i + 2] = (1 / L * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function roughMap(h, lo) {
  var c = document.createElement('canvas'); c.width = c.height = TEX;
  var g = c.getContext('2d'), img = g.createImageData(TEX, TEX), d = img.data;
  for (var i = 0; i < TEX * TEX; i++) { var v = (lo + (1 - lo) * h[i]) * 255, j = i * 4; d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255; }
  g.putImageData(img, 0, 0);
  var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/* ================================ stage ================================== */
var cv = document.getElementById('cv');
var R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
R.outputEncoding = THREE.sRGBEncoding;
R.toneMapping = THREE.ACESFilmicToneMapping;
R.toneMappingExposure = 1.0;
R.shadowMap.enabled = true;
R.shadowMap.type = THREE.PCFSoftShadowMap;

var SCENE = new THREE.Scene();
var CAM = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

/* A studio painted onto a canvas and pushed through PMREM. Without an
 * environment to reflect, polished calf renders as flat colour with one
 * hotspot, and metal eyelets render black. */
(function environment() {
  var c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  var x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.38, '#EDEFEC');
  g.addColorStop(0.50, '#C9CEC8'); g.addColorStop(1, '#9FA69E');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  function softbox(cx, cy, w, h, a) {
    var r = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
    r.addColorStop(0, 'rgba(255,255,255,' + a + ')');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = r; x.fillRect(cx - w, cy - h, w * 2, h * 2);
  }
  softbox(265, 104, 250, 150, 1); softbox(742, 152, 166, 118, 0.72); softbox(512, 36, 340, 80, 0.5);
  var t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.encoding = THREE.sRGBEncoding;
  var p = new THREE.PMREMGenerator(R); p.compileEquirectangularShader();
  SCENE.environment = p.fromEquirectangular(t).texture;
  t.dispose(); p.dispose();
})();

var key = new THREE.DirectionalLight(0xffffff, 1.18);
key.position.set(1.7, 4.3, 2.7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0006;
key.shadow.radius = 3;
(function (c) { c.left = -2.6; c.right = 2.6; c.top = 2.6; c.bottom = -2.6; c.near = 0.5; c.far = 12; })(key.shadow.camera);
SCENE.add(key);

var fill = new THREE.DirectionalLight(0xD8E2EA, 0.4);
fill.position.set(-3, 1.1, -2.3);
SCENE.add(fill);

var ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.17 }));
ground.rotation.x = -PI / 2; ground.receiveShadow = true; SCENE.add(ground);

/* Shadow maps go too diffuse right at the sole, so the shoe floats. This is a
 * painted contact patch underneath it. */
(function contact() {
  var c = document.createElement('canvas'); c.width = c.height = 256;
  var x = c.getContext('2d'), r = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(44,50,46,.50)'); r.addColorStop(0.45, 'rgba(44,50,46,.2)');
  r.addColorStop(1, 'rgba(44,50,46,0)');
  x.fillStyle = r; x.fillRect(0, 0, 256, 256);
  var m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.25),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -PI / 2; m.position.y = 0.004; SCENE.add(m);
})();

/* ============================== materials ================================ */
var MAT = {}, CAP_MAT, SOLE_LEATHER, SOLE_DAINITE, EDGE_DARK, EDGE_NATURAL;
var EYE_MAT = {}, LACE_MAT = {};

function buildMaterials() {
  Object.keys(C.LEATHER).forEach(function (k) {
    var L = C.LEATHER[k], h = heightField(k);
    var nm = normalMap(h, L.bump), rm = roughMap(h, L.rlo);
    nm.repeat.set(L.rep, L.rep); rm.repeat.set(L.rep, L.rep);
    var m = new THREE.MeshPhysicalMaterial({
      color: C.COLOURS[k][0][2], roughness: L.rough, metalness: 0,
      normalMap: nm, normalScale: new THREE.Vector2(L.ns, L.ns), roughnessMap: rm,
      clearcoat: L.cc, clearcoatRoughness: L.ccr, side: THREE.DoubleSide
    });
    if (L.sheen > 0) {
      /* Real suede scatters light through its nap. This only lifts the
       * grazing angles, which is the part the eye actually reads as nap.
       * Judge it on the silhouette, not head-on. */
      m.userData.sheen = new THREE.Color(0xBFAE9A);
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uSheen = { value: m.userData.sheen };
        sh.uniforms.uSheenK = { value: L.sheen };
        sh.fragmentShader = 'uniform vec3 uSheen;\nuniform float uSheenK;\n' + sh.fragmentShader;
        sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
          'float _rim = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);\n' +
          'gl_FragColor.rgb += uSheen * pow(_rim, 2.4) * uSheenK;\n#include <dithering_fragment>');
      };
    }
    MAT[k] = m;
  });

  CAP_MAT = new THREE.MeshPhysicalMaterial({ color: 0x121014, roughness: 0.26, metalness: 0, clearcoat: 0.72, side: THREE.DoubleSide });

  var calfH = heightField('calf'), pebbleH = heightField('pebble');
  function surface(col, rough, bump, scale, rep, h) {
    var m = new THREE.MeshPhysicalMaterial({
      color: col, roughness: rough, metalness: 0,
      normalMap: normalMap(h, bump), normalScale: new THREE.Vector2(scale, scale),
      side: THREE.DoubleSide
    });
    m.normalMap.repeat.set(rep, rep);
    return m;
  }
  SOLE_LEATHER = surface(0x9A6F45, 0.66, 2.4, 0.5, 4, calfH);
  EDGE_DARK    = surface(0x1B1A19, 0.50, 2.2, 0.4, 5, calfH);
  EDGE_NATURAL = surface(0xB08A5C, 0.58, 2.2, 0.4, 5, calfH);
  SOLE_DAINITE = surface(0x232429, 0.88, 5.0, 0.9, 5, pebbleH);

  EYE_MAT.black  = new THREE.MeshStandardMaterial({ color: 0x16161A, roughness: 0.38, metalness: 0.6, envMapIntensity: 1.1 });
  EYE_MAT.brass  = new THREE.MeshStandardMaterial({ color: 0xA8813F, roughness: 0.30, metalness: 1, envMapIntensity: 1.5 });
  EYE_MAT.nickel = new THREE.MeshStandardMaterial({ color: 0xBABDC2, roughness: 0.22, metalness: 1, envMapIntensity: 1.5 });
  LACE_MAT.black   = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.94, metalness: 0 });
  LACE_MAT.natural = new THREE.MeshStandardMaterial({ color: 0xC9BDA3, roughness: 0.94, metalness: 0 });
}

/* ================================ model ================================== */
var GROUP = new THREE.Group();
SCENE.add(GROUP);
var ZONE = {};

function placeModel(parts) {
  parts.forEach(function (p) {
    var m = new THREE.Mesh(p.geometry, MAT.calf);
    m.castShadow = true; m.receiveShadow = true;
    GROUP.add(m);
    ZONE[p.name] = m;
  });
  var box = new THREE.Box3().setFromObject(GROUP);
  var c = box.getCenter(new THREE.Vector3());
  GROUP.position.x -= c.x;
  GROUP.position.z -= c.z;
  GROUP.position.y -= box.min.y;      // stand it on the ground plane
}

function paint() {
  var L = MAT[S.leather], col = C.COLOURS[S.leather][S.colour][2];
  L.color.setHex(col);
  if (L.userData.sheen) {
    var c = new THREE.Color(col), hsl = {};
    c.getHSL(hsl);
    L.userData.sheen.setHSL(hsl.h, Math.max(0, hsl.s * 0.45), Math.min(0.82, hsl.l + 0.42));
  }
  var soleM = S.sole === 'dainite' ? SOLE_DAINITE : (S.edge === 'dark' ? EDGE_DARK : SOLE_LEATHER);
  if (ZONE.quarter) ZONE.quarter.material = L;
  if (ZONE.vamp)    ZONE.vamp.material = L;
  if (ZONE.tongue)  ZONE.tongue.material = L;
  if (ZONE.cap)     ZONE.cap.material = S.cap === 'contrast' ? CAP_MAT : L;
  if (ZONE.sole)    ZONE.sole.material = soleM;
  if (ZONE.lace)    ZONE.lace.material = S.lace === 'tonal' ? L : LACE_MAT[S.lace];
  if (ZONE.eyelet)  ZONE.eyelet.material = EYE_MAT[S.eye];
}

/* =============================== camera ================================== */
var TARGET = new THREE.Vector3(0, 0.40, 0);
var now = { az: PI / 2, el: 0.06, d: 4.15, tx: 0 };
var want = { az: PI / 2, el: 0.06, d: 4.15, tx: 0 };
var dragging = false, lastX = 0, lastY = 0, idle = 0;

var VIEWS = {
  profile: { az: PI / 2,        el: 0.03, d: 4.1, tx: 0 },
  angle:   { az: PI / 2 - 0.82, el: 0.42, d: 4.2, tx: 0 },
  top:     { az: PI / 2,        el: 1.40, d: 4.4, tx: 0 },
  heel:    { az: PI,            el: 0.22, d: 3.9, tx: -0.35 }
};
/* Each part is judged from the angle that actually shows it. */
var FOCUS = {
  upper: { az: PI / 2 - 0.80, el:  0.40, d: 3.90, tx: 0 },
  toe:   { az: PI / 2 - 1.02, el:  0.33, d: 3.15, tx: 0.78 },
  sole:  { az: PI / 2 + 0.26, el: -0.23, d: 4.15, tx: 0 },
  lace:  { az: PI / 2 - 0.22, el:  0.96, d: 3.35, tx: 0.10 },
  eye:   { az: PI / 2 - 0.56, el:  0.70, d: 2.95, tx: 0.16 },
  mono:  { az: PI - 0.48,     el:  0.86, d: 3.50, tx: -0.26 }
};

function flyTo(v) {
  want.az = v.az; want.el = v.el; want.d = v.d; want.tx = v.tx || 0;
  idle = 0;
  if (CALM) { now.az = want.az; now.el = want.el; now.d = want.d; now.tx = want.tx; }
}
function clearViewButtons() {
  Array.prototype.forEach.call(document.querySelectorAll('#views button'), function (b) { b.classList.remove('on'); });
}

cv.addEventListener('pointerdown', function (e) {
  dragging = true; idle = 0; lastX = e.clientX; lastY = e.clientY;
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', function (e) {
  if (!dragging) return;
  want.az -= (e.clientX - lastX) * 0.007;
  want.el = Math.max(-0.40, Math.min(1.46, want.el + (e.clientY - lastY) * 0.006));
  lastX = e.clientX; lastY = e.clientY; idle = 0;
  clearViewButtons();
});
cv.addEventListener('pointerup', function () { dragging = false; });
cv.addEventListener('pointercancel', function () { dragging = false; });
cv.addEventListener('wheel', function (e) {
  e.preventDefault(); idle = 0;
  want.d = Math.max(2.3, Math.min(8, want.d + e.deltaY * 0.0035));
}, { passive: false });

function resize() {
  var w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  R.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  R.setSize(w, h, false);
  CAM.aspect = w / h;
  /* Shift the frustum so the shoe sits centred in the space the option
   * sheet leaves free, rather than behind it. */
  var sheet = (window.innerWidth > 900) ? 394 : 0;
  if (sheet) CAM.setViewOffset(w, h, sheet / 2, 0, w, h);
  else CAM.clearViewOffset();
  CAM.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

var prev = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  resize();
  var dt = Math.min(0.05, (t - prev) / 1000); prev = t; idle += dt;
  if (!CALM && !dragging && idle > 8) want.az += dt * 0.1;   // slow turntable once left alone
  var k = CALM ? 1 : 0.085;
  now.az += (want.az - now.az) * k;
  now.el += (want.el - now.el) * k;
  now.d  += (want.d  - now.d)  * k;
  now.tx += (want.tx - now.tx) * k;
  TARGET.x = now.tx;
  var ce = Math.cos(now.el);
  CAM.position.set(
    TARGET.x + now.d * ce * Math.cos(now.az),
    TARGET.y + now.d * Math.sin(now.el),
    TARGET.z + now.d * ce * Math.sin(now.az)
  );
  CAM.lookAt(TARGET);
  R.render(SCENE, CAM);
}

/* ============================== interface ================================ */
var active = 'upper';
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function option(label, price, on, disabled, onPick) {
  var b = el('button', 'opt');
  b.type = 'button';
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.disabled = !!disabled;
  b.appendChild(el('span', 'tick', '✓'));
  b.appendChild(el('span', 'nm', label));
  b.appendChild(el('span', 'pr', C.delta(price)));
  if (!disabled) b.addEventListener('click', onPick);
  return b;
}
function simpleList(arr, get, set) {
  return function (box) {
    arr.forEach(function (o) {
      box.appendChild(option(o[1], o[2], get() === o[0], false, function () {
        set(o[0]); paint(); render();
      }));
    });
  };
}

var PARTS = [
  {
    key: 'upper', label: 'Upper', focus: 'upper',
    value: function () {
      return C.COLOURS[S.leather][S.colour][0] + ' ' + C.LEATHER[S.leather].label.toLowerCase();
    },
    title: 'Upper',
    blurb: 'The quarters and vamp are cut from one hide so the grain runs continuously around the shoe.',
    body: function (box) {
      Object.keys(C.LEATHER).forEach(function (k) {
        box.appendChild(option(C.LEATHER[k].label, C.LEATHER[k].price, S.leather === k, false, function () {
          S.leather = k; S.colour = 0; paint(); render();
        }));
      });
      var row = el('div', 'swrow');
      C.COLOURS[S.leather].forEach(function (c, i) {
        var b = el('button', 'sw');
        b.type = 'button';
        b.style.background = '#' + c[2].toString(16).padStart(6, '0');
        b.setAttribute('aria-pressed', i === S.colour ? 'true' : 'false');
        b.setAttribute('aria-label', c[0] + ', ' + c[1]);
        b.title = c[0];
        b.addEventListener('click', function () { S.colour = i; paint(); render(); });
        row.appendChild(b);
      });
      box.appendChild(row);
      var n = el('p', 'swname');
      n.appendChild(el('span', null, C.COLOURS[S.leather][S.colour][0] + ', '));
      n.appendChild(el('em', null, C.COLOURS[S.leather][S.colour][1]));
      box.appendChild(n);
      if (S.leather === 'suede') box.appendChild(el('p', 'note', 'Suede takes no polish. Pair it with a Dainite sole for weather.'));
      if (S.leather === 'cordovan') box.appendChild(el('p', 'note', 'Shell cordovan is cut from a small part of the hide, so it comes in three shades only.'));
    }
  },
  {
    key: 'toe', label: 'Toe cap', focus: 'toe',
    value: function () { return C.find(C.CAPS, S.cap)[1]; },
    title: 'Toe cap',
    blurb: 'A straight cap seam set at seven tenths of the length. It stiffens the toe and holds a shine.',
    body: simpleList(C.CAPS, function () { return S.cap; }, function (v) { S.cap = v; })
  },
  {
    key: 'sole', label: 'Sole', focus: 'sole',
    value: function () { return C.find(C.SOLES, S.sole)[1]; },
    title: 'Sole and edge',
    blurb: 'Goodyear welted either way, so the sole can be replaced without disturbing the upper.',
    body: function (box) {
      C.SOLES.forEach(function (o) {
        box.appendChild(option(o[1], o[2], S.sole === o[0], false, function () { S.sole = o[0]; paint(); render(); }));
      });
      box.appendChild(el('p', 'hint lbl', 'Edge finish'));
      C.EDGES.forEach(function (o) {
        box.appendChild(option(o[1], o[2], S.edge === o[0], false, function () { S.edge = o[0]; paint(); render(); }));
      });
    }
  },
  {
    key: 'lace', label: 'Laces', focus: 'lace',
    value: function () { return C.find(C.LACES, S.lace)[1]; },
    title: 'Laces',
    blurb: 'Flat waxed cotton, threaded straight across in the formal pattern.',
    body: simpleList(C.LACES, function () { return S.lace; }, function (v) { S.lace = v; })
  },
  {
    key: 'eye', label: 'Eyelets', focus: 'eye',
    value: function () { return C.find(C.EYES, S.eye)[1]; },
    title: 'Eyelets',
    blurb: 'Five pairs, set by hand through the facing.',
    body: simpleList(C.EYES, function () { return S.eye; }, function (v) { S.eye = v; })
  },
  {
    key: 'mono', label: 'Monogram', focus: 'mono',
    value: function () { return S.mono.trim() || 'None'; },
    title: 'Monogram',
    blurb: 'Blind embossed into the insole, where only you will see it.',
    body: function (box) {
      var i = el('input', 'mono');
      i.type = 'text'; i.maxLength = 3; i.value = S.mono;
      i.placeholder = 'Up to three initials';
      i.setAttribute('aria-label', 'Monogram initials, up to three letters');
      i.addEventListener('input', function () {
        S.mono = i.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
        i.value = S.mono;
        refreshRailValues(); refreshTotal(); syncHash();
      });
      box.appendChild(i);
      box.appendChild(el('p', 'hint', 'Adds ' + C.money(C.MONOGRAM_PRICE) + ' and two weeks to the build.'));
    }
  }
];
function partByKey(k) {
  for (var i = 0; i < PARTS.length; i++) if (PARTS[i].key === k) return PARTS[i];
  return PARTS[0];
}

function render() {
  var rail = document.getElementById('parts');
  rail.innerHTML = '';
  PARTS.forEach(function (p) {
    var b = el('button', 'pt');
    b.type = 'button';
    b.setAttribute('aria-pressed', p.key === active ? 'true' : 'false');
    b.appendChild(el('span', 'k', p.label));
    b.appendChild(el('span', 'v', p.value()));
    b.addEventListener('click', function () {
      active = p.key;
      if (FOCUS[p.focus]) flyTo(FOCUS[p.focus]);
      clearViewButtons();
      render();
    });
    rail.appendChild(b);
  });

  var p = partByKey(active), box = document.getElementById('sheetBody');
  box.innerHTML = '';
  box.appendChild(el('h2', 'ttl', p.title));
  box.appendChild(el('p', 'sub', p.blurb));
  p.body(box);
  refreshTotal();
  syncHash();
}
function refreshRailValues() {
  var cells = document.querySelectorAll('#parts .pt .v');
  PARTS.forEach(function (p, i) { if (cells[i]) cells[i].textContent = p.value(); });
}
function refreshTotal() {
  document.getElementById('tot').textContent = C.money(C.total(S));
}
function syncHash() {
  var h = '#' + C.encode(S);
  if (location.hash !== h) history.replaceState(null, '', h);
}

document.getElementById('views').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (!b) return;
  clearViewButtons();
  b.classList.add('on');
  flyTo(VIEWS[b.dataset.v]);
});
document.getElementById('order').addEventListener('click', function () {
  var b = this, was = b.textContent;
  b.textContent = 'Order placed';
  setTimeout(function () { b.textContent = was; }, 1900);
});
document.getElementById('share').addEventListener('click', function () {
  var b = this, was = b.textContent;
  var url = location.origin + location.pathname + '#' + C.encode(S);
  function done(msg) { b.textContent = msg; setTimeout(function () { b.textContent = was; }, 1900); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () { done('Link copied'); },
                                            function () { done('Could not copy'); });
  } else {
    done('Could not copy');
  }
});

/* ================================ boot =================================== */
function fail(title, detail) {
  var v = document.getElementById('veil');
  v.className = 'bad';
  v.innerHTML = '';
  v.appendChild(el('p', 'veil-t', title));
  var p = el('p', 'veil-s');
  p.innerHTML = detail;
  v.appendChild(p);
}

function boot() {
  var sub = document.getElementById('veilSub');
  try {
    buildMaterials();
  } catch (e) {
    fail('This browser cannot run the viewer', 'It needs WebGL. Try a current version of Chrome, Safari, Firefox or Edge.');
    return;
  }
  sub.textContent = 'Fetching the last';
  fetch(MODEL_URL)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    })
    .then(function (buf) {
      sub.textContent = 'Cutting the pattern';
      placeModel(GLB.toGeometries(buf));
      paint();
      render();
      flyTo(FOCUS.upper);
      document.getElementById('veil').className = 'off';
      resize();
      requestAnimationFrame(frame);
    })
    .catch(function (err) {
      if (location.protocol === 'file:') {
        fail('Run this from a web server',
             'Opening the page straight off disk blocks the model from loading. From this folder run ' +
             '<code>python3 -m http.server</code> and open <code>http://localhost:8000</code>.');
      } else {
        fail('The model did not load', 'Could not fetch <code>' + MODEL_URL + '</code>. ' + err.message);
      }
    });
}

window.addEventListener('hashchange', function () {
  var next = C.decode(location.hash.replace(/^#/, ''));
  Object.keys(next).forEach(function (k) { S[k] = next[k]; });
  paint(); render();
});

boot();
})();
