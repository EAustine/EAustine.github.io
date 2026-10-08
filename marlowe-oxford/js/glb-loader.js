/* Minimal glTF 2.0 binary reader.
 *
 * Written by hand rather than pulled from a loader bundle: this page needs
 * positions, normals, indices and the material names, nothing else. Keeping it
 * to ~70 lines avoids a dependency and makes the data path easy to follow.
 *
 * It does not handle Draco, Meshopt or KTX2. Export uncompressed.
 */
window.MarloweGLB = (function () {
  'use strict';

  var GETTER = { 5121: 'getUint8', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' };
  var CSIZE  = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
  var NCOMP  = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

  function parse(buffer) {
    var dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('Not a .glb file.');
    var total = dv.getUint32(8, true), off = 12, json = null, bin = null;
    while (off < total) {
      var len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      if (type === 0x4E4F534A) {
        json = JSON.parse(new TextDecoder().decode(buffer.slice(off + 8, off + 8 + len)));
      } else if (type === 0x004E4942) {
        bin = buffer.slice(off + 8, off + 8 + len);
      }
      off += 8 + len;
    }
    if (!json) throw new Error('No JSON chunk in the .glb.');
    var need = (json.extensionsRequired || []).filter(function (e) {
      return /draco|meshopt|basisu/i.test(e);
    });
    if (need.length) throw new Error('This file needs ' + need.join(', ') + '. Re-export it uncompressed.');
    return { json: json, bin: bin };
  }

  /* Reads one accessor into a typed array, honouring byteStride. */
  function accessor(json, bin, index) {
    var a = json.accessors[index];
    var n = NCOMP[a.type], size = CSIZE[a.componentType], get = GETTER[a.componentType];
    var view = json.bufferViews[a.bufferView];
    var base = (view.byteOffset || 0) + (a.byteOffset || 0);
    var stride = view.byteStride || size * n;
    var dv = new DataView(bin);
    var Arr = a.componentType === 5126 ? Float32Array
            : a.componentType === 5125 ? Uint32Array : Uint16Array;
    var out = new Arr(a.count * n);
    for (var i = 0; i < a.count; i++) {
      for (var j = 0; j < n; j++) out[i * n + j] = dv[get](base + i * stride + j * size, true);
    }
    return out;
  }

  /* Returns [{ name, geometry }] — one entry per mesh, first primitive only.
   *
   * UVs are computed here from object space rather than taken from the file.
   * The source model was unwrapped for a single baked texture, so island scale
   * varies wildly between parts; using it would make the leather grain huge on
   * the sole and invisible on the tongue. A cylindrical wrap around the length
   * axis gives every zone the same grain density. */
  function toGeometries(buffer) {
    var g = parse(buffer), out = [];
    g.json.meshes.forEach(function (mesh) {
      var p = mesh.primitives[0];
      if (!p || p.attributes.POSITION === undefined) return;
      var geo = new THREE.BufferGeometry();
      var pos = accessor(g.json, g.bin, p.attributes.POSITION);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (p.attributes.NORMAL !== undefined) {
        geo.setAttribute('normal', new THREE.BufferAttribute(accessor(g.json, g.bin, p.attributes.NORMAL), 3));
      }
      if (p.indices !== undefined) {
        geo.setIndex(new THREE.BufferAttribute(accessor(g.json, g.bin, p.indices), 1));
      }
      if (p.attributes.NORMAL === undefined) geo.computeVertexNormals();

      var uv = new Float32Array(pos.length / 3 * 2);
      for (var i = 0; i < pos.length; i += 3) {
        uv[i / 3 * 2]     = pos[i];
        uv[i / 3 * 2 + 1] = Math.atan2(pos[i + 2], pos[i + 1] - 0.34) * 0.34;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      out.push({ name: mesh.name, geometry: geo });
    });
    return out;
  }

  return { parse: parse, accessor: accessor, toGeometries: toGeometries };
})();
