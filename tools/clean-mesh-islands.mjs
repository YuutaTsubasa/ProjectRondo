// Remove disconnected geometry islands ("floaters") from a GLB — the stray specks Tripo/AI mesh
// generators leave around a model. Welds coincident vertices, groups triangles into connected
// components (union-find over shared vertices), then drops a component when EITHER:
//   • it is tiny            — bbox diagonal < TINY × model diagonal, or
//   • it is small+isolated  — bbox diagonal < BODY × model diagonal AND its gap to every "body"
//                             component (diagonal ≥ BODY) is ≥ GAP × model diagonal.
// The isolation rule catches specks that float away from the mesh without thinning foliage that sits
// nestled among the big leaf clusters. Keeps the trunk + leaf clusters.
//
// Usage: node tools/clean-mesh-islands.mjs <in.glb> <out.glb> [tiny=0.008] [gap=0.05]
import { NodeIO } from '@gltf-transform/core';
import { weld, prune } from '@gltf-transform/functions';

const [, , inPath, outPath, tinyArg, gapArg] = process.argv;
if (!inPath || !outPath) { console.error('usage: clean-mesh-islands.mjs <in.glb> <out.glb> [tiny] [gap]'); process.exit(1); }
const TINY = parseFloat(tinyArg ?? '0.008'); // always-remove size (fraction of model diagonal)
const BODY = 0.08;                            // components this big are "tree body" — always kept
const GAP = parseFloat(gapArg ?? '0.05');     // a small component this far from all body parts is a floater

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

    // AABB-to-AABB gap (0 if overlapping/touching)
    const aabbGap = (a, b) => {
      let s = 0;
      for (let k = 0; k < 3; k++) { const g = Math.max(0, a.min[k] - b.max[k], b.min[k] - a.max[k]); s += g * g; }
      return Math.sqrt(s);
    };
    const bodies = [...comp.values()].filter((c) => diagOf(c) >= BODY * modelDiag);

    const removeRoot = new Map();
    for (const [r, c] of comp) {
      const d = diagOf(c);
      let remove;
      if (d < TINY * modelDiag) remove = true;              // tiny noise
      else if (d >= BODY * modelDiag) remove = false;       // tree body
      else {                                                // small: remove only if isolated from the body
        let gap = Infinity;
        for (const b of bodies) { if (b !== c) gap = Math.min(gap, aabbGap(c, b)); if (gap === 0) break; }
        remove = gap >= GAP * modelDiag;
      }
      removeRoot.set(r, remove);
    }

    const kept = [];
    let removed = 0;
    for (let i = 0; i < idx.length; i += 3) {
      if (removeRoot.get(find(idx[i]))) removed++;
      else kept.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    totalRemoved += removed;
    const removedIslands = [...removeRoot.values()].filter(Boolean).length;
    console.log(`  ${comp.size} components (${bodies.length} body); removed ${removedIslands} islands / ${removed} tris (kept ${kept.length / 3})`);
    indices.setArray(new idx.constructor(kept));
  }
}

await doc.transform(prune());
await io.write(outPath, doc);
console.log(`done → ${outPath} (removed ${totalRemoved} floater tris)`);
