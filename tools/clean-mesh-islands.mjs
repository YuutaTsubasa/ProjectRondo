// Remove tiny disconnected geometry islands ("floaters") from a GLB — the stray specks Tripo/AI mesh
// generators leave around a model. Welds coincident vertices, groups triangles into connected
// components (union-find over shared vertices), and drops any component whose bounding-box diagonal
// is below THRESHOLD × the whole model's diagonal (keeping the trunk + leaf clusters).
//
// Usage: node tools/clean-mesh-islands.mjs <in.glb> <out.glb> [threshold=0.04]
import { NodeIO } from '@gltf-transform/core';
import { weld, prune } from '@gltf-transform/functions';

const [, , inPath, outPath, thrArg] = process.argv;
if (!inPath || !outPath) { console.error('usage: clean-mesh-islands.mjs <in.glb> <out.glb> [threshold]'); process.exit(1); }
const THRESHOLD = parseFloat(thrArg ?? '0.04');

const io = new NodeIO();
const doc = await io.read(inPath);
await doc.transform(weld()); // merge coincident vertices so genuinely-connected geometry is one island

let totalRemoved = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const indices = prim.getIndices();
    const position = prim.getAttribute('POSITION');
    if (!indices || !position) continue;
    const idx = indices.getArray();
    const pos = position.getArray();
    const vCount = position.getCount();

    // union-find: triangles connect their three vertices
    const parent = new Int32Array(vCount);
    for (let i = 0; i < vCount; i++) parent[i] = i;
    const find = (x) => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const n = parent[x]; parent[x] = r; x = n; } return r; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    for (let i = 0; i < idx.length; i += 3) { union(idx[i], idx[i + 1]); union(idx[i + 1], idx[i + 2]); }

    // per-component bounding box (referenced vertices only)
    const comp = new Map();
    const referenced = new Uint8Array(vCount);
    for (let i = 0; i < idx.length; i++) referenced[idx[i]] = 1;
    for (let v = 0; v < vCount; v++) {
      if (!referenced[v]) continue;
      const r = find(v);
      let c = comp.get(r);
      if (!c) { c = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; comp.set(r, c); }
      for (let k = 0; k < 3; k++) { const val = pos[v * 3 + k]; c.min[k] = Math.min(c.min[k], val); c.max[k] = Math.max(c.max[k], val); }
    }
    const diagOf = (c) => Math.hypot(c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]);
    const g = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const c of comp.values()) for (let k = 0; k < 3; k++) { g.min[k] = Math.min(g.min[k], c.min[k]); g.max[k] = Math.max(g.max[k], c.max[k]); }
    const modelDiag = diagOf(g);

    const sizes = [...comp.values()].map((c) => +(diagOf(c) / modelDiag).toFixed(3)).sort((a, b) => b - a);
    console.log(`  ${comp.size} components; relative sizes: [${sizes.slice(0, 16).join(', ')}${sizes.length > 16 ? ', …' : ''}]`);

    const kept = [];
    let removed = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const c = comp.get(find(idx[i]));
      if (diagOf(c) >= THRESHOLD * modelDiag) kept.push(idx[i], idx[i + 1], idx[i + 2]);
      else removed++;
    }
    totalRemoved += removed;
    console.log(`  removed ${removed} tris below ${THRESHOLD} × diag (kept ${kept.length / 3})`);
    indices.setArray(new idx.constructor(kept));
  }
}

await doc.transform(prune());
await io.write(outPath, doc);
console.log(`done → ${outPath} (removed ${totalRemoved} floater tris)`);
