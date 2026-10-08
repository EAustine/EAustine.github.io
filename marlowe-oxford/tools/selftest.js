// Stub just enough of three.js to exercise the loader and catalogue in node.
const fs = require('fs'), vm = require('vm');
class BufferAttribute { constructor(a,n){ this.array=a; this.itemSize=n; } }
class BufferGeometry {
  constructor(){ this.attributes={}; this.index=null; }
  setAttribute(k,v){ this.attributes[k]=v; }
  setIndex(v){ this.index=v; }
  computeVertexNormals(){ this.computed=true; }
}
const THREE = { BufferAttribute, BufferGeometry };
const ctx = vm.createContext({ THREE, window:{}, TextDecoder, console, Math, JSON, DataView,
  Float32Array, Uint32Array, Uint16Array, Uint8Array, Array, Object, String, parseInt, isFinite });
for (const f of ['js/glb-loader.js','js/catalogue.js']) vm.runInContext(fs.readFileSync(f,'utf8'), ctx);

const GLB = ctx.window.MarloweGLB, C = ctx.window.MarloweCatalogue;
const buf = fs.readFileSync('assets/model/marlowe-oxford.glb');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

let fail = 0;
const ok = (c,m)=>{ console.log((c?'  pass  ':'  FAIL  ')+m); if(!c) fail++; };

console.log('\nGLB loader');
const parts = GLB.toGeometries(ab);
const names = parts.map(p=>p.name).sort();
ok(parts.length===7, 'returns 7 meshes (got '+parts.length+')');
ok(JSON.stringify(names)===JSON.stringify(['cap','eyelet','lace','quarter','sole','tongue','vamp']),
   'zone names match what app.js paints: '+names.join(', '));
let tris=0, bad=0, bounds={min:[1e9,1e9,1e9],max:[-1e9,-1e9,-1e9]};
for (const p of parts){
  const pos=p.geometry.attributes.position.array, idx=p.geometry.index.array;
  tris += idx.length/3;
  if(!p.geometry.attributes.uv) bad++;
  if(!p.geometry.attributes.normal) bad++;
  for(let i=0;i<pos.length;i+=3) for(let k=0;k<3;k++){
    if(pos[i+k]<bounds.min[k]) bounds.min[k]=pos[i+k];
    if(pos[i+k]>bounds.max[k]) bounds.max[k]=pos[i+k];
  }
  for(let i=0;i<idx.length;i++) if(idx[i]*3>=pos.length){ bad++; break; }
}
ok(tris===16520, 'triangle count 16520 (got '+tris+')');
ok(bad===0, 'every mesh has normals, uvs, and in-range indices');
const ext=[0,1,2].map(k=>+(bounds.max[k]-bounds.min[k]).toFixed(3));
ok(Math.abs(ext[0]-2.8)<0.01, 'length 2.8 on X (got '+ext[0]+')');
ok(Math.abs(bounds.min[1])<0.01, 'sits on y=0 (min y '+bounds.min[1].toFixed(4)+')');
console.log('        extents', ext.join(' x '));

console.log('\nCatalogue');
const base = Object.assign({}, C.DEFAULTS);
ok(C.total(base)===420, 'base build is £420 (got '+C.total(base)+')');
const loaded = Object.assign({}, base, {leather:'cordovan',cap:'contrast',sole:'dainite',eye:'brass',lace:'natural',mono:'AE'});
ok(C.total(loaded)===420+290+60+35+18+8+40, 'fully loaded build is £'+C.total(loaded));
for (const k of Object.keys(C.LEATHER)) ok(!!C.COLOURS[k] && C.COLOURS[k].length>0, 'leather "'+k+'" has a colour palette');
ok(C.COLOURS.cordovan.length===3, 'cordovan is limited to three shades');

console.log('\nShare links');
for (const s of [base, loaded, Object.assign({},base,{leather:'suede',colour:3})]){
  const round = C.decode(C.encode(s));
  ok(JSON.stringify(round)===JSON.stringify(s), 'round-trips: ' + C.encode(s));
}
ok(C.decode('').leather==='calf', 'empty hash falls back to defaults');
ok(C.decode('nonsense').leather==='calf', 'junk hash falls back to defaults');
ok(C.decode('suede.99.match.leather.dark.black.black.').colour===0, 'out-of-range colour index is clamped');
ok(C.decode('calf.0.match.leather.dark.black.black.a1!b$c').mono==='ABC', 'monogram is sanitised to letters');

console.log('\n' + (fail ? fail+' FAILURES' : 'all checks passed'));
process.exit(fail?1:0);
