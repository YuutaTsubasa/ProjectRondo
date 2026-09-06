/**
 * A tiny read/evaluate layer for the knight's binary glTF, used by the foot calibration.
 *
 * Everything here exists so `calibrate.mjs`, `verify.mjs` and `integrity.mjs` can pose the shipped
 * skeleton and skin its boot meshes **outside a browser**, with no dependency to install and nothing
 * that rewrites the file on the way through. A general glTF library would be the wrong tool: this
 * pass has to leave every byte it does not deliberately change exactly as it found it (that is what
 * `integrity.mjs` asserts), and a round-trip through a library that re-packs buffers, re-orders
 * JSON keys or re-quantises accessors cannot promise that.
 *
 * Scope, so nobody reaches for this as a general loader:
 *   - GLB only (`glTF` magic, version 2, one JSON chunk then one BIN chunk).
 *   - No sparse accessors and no CUBICSPLINE interpolation — both throw rather than being silently
 *     mis-evaluated.
 *   - Morph targets are **ignored**, and that is only safe while none of them is driven. This model
 *     carries one (`V_None`) on all 42 primitives with a `weights` channel each in `0_T-Pose`, and
 *     every weight is exactly 0, so skinning `POSITION` through the joint matrices is the whole
 *     deformation. {@link load} rejects the file if that stops being true, because a driven
 *     blendshape would move the sole vertices underneath the fit and the re-measure alike: the boot
 *     would be levelled against a pose the runtime never renders, and both would report PASS. A
 *     Character Creator source is full of blendshapes, so this is a live hazard on the next export,
 *     not a hypothetical.
 *   - Only the buffer views actually referenced are read, and only through {@link load}'s `read`,
 *     which caches per accessor.
 *
 * Quaternions are `[x, y, z, w]`, matching glTF. Matrices are 16-element **column-major** arrays,
 * also matching glTF, so `m[12..14]` is the translation.
 */
import fs from 'node:fs';

// ------------------------------------------------------------------ small math

/** Column-major 4x4 product, `a * b` — `b` applied first, then `a`. */
export const mul = (a, b) =>
  Array.from({ length: 16 }, (_, i) => {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + (i % 4)] * b[Math.floor(i / 4) * 4 + k];
    return s;
  });

/** Transforms a point by a column-major 4x4 (translation included). */
export const point = (m, p) => [0, 1, 2].map((i) => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);

/**
 * Hamilton product of two `[x, y, z, w]` quaternions, `a * b`.
 *
 * Order is the whole game in this tool, so it is worth stating once: with glTF's convention a node's
 * local rotation `r` maps a local direction into its parent's frame. So `qm(r, q)` applies `q`
 * **first, in the node's own local frame** (a post-rotation — what the sole correction is), while
 * `qm(q, r)` applies `q` **after** `r`, i.e. in the parent's frame (a pre-rotation — what
 * `calibrate.mjs`'s fixed parent-frame pre-rotation is).
 */
export const qm = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

/** Unit-length copy of a quaternion. Products of two unit quaternions drift, and glTF rotation
 *  accessors are required to hold unit quaternions, so every value written back goes through this. */
export const norm = (q) => {
  const l = Math.hypot(...q);
  return q.map((x) => x / l);
};

/** Quaternion for a rotation of `angle` radians about the unit vector `v` (right-handed). */
export const axis = (v, angle) => [...v.map((x) => x * Math.sin(angle / 2)), Math.cos(angle / 2)];

/** A node's local matrix from its TRS, in glTF's order: translate * rotate * scale. */
export function trs(n) {
  const [x, y, z, w] = norm(n.rotation ?? [0, 0, 0, 1]);
  const s = n.scale ?? [1, 1, 1];
  const t = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    ...t, 1,
  ];
}

/**
 * Spherical linear interpolation between two quaternions.
 *
 * Matches what a glTF LINEAR rotation sampler is specified to do, including the two details that
 * make an eyeballed lerp look different: the shorter arc is taken (negate `b` when the dot product
 * is negative — `q` and `-q` are the same rotation), and nearly-parallel pairs fall back to a
 * normalised lerp because `sin(theta)` goes to zero there.
 */
export function slerp(a, b, t) {
  let d = a.reduce((s, x, i) => s + x * b[i], 0);
  if (d < 0) {
    b = b.map((x) => -x);
    d = -d;
  }
  if (d > 0.9995) return norm(a.map((x, i) => x + (b[i] - x) * t));
  const th = Math.acos(Math.min(1, d));
  const sn = Math.sin(th);
  return a.map((x, i) => (x * Math.sin((1 - t) * th) + b[i] * Math.sin(t * th)) / sn);
}

/** Component-wise axis-aligned bounds of a list of points. */
export const bounds = (points) => ({
  min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))),
  max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))),
});

// ------------------------------------------------------------------ the file

/** Accessor component types: `[Buffer read method, bytes, divisor for `normalized`]`. */
const COMPONENT_TYPES = {
  5120: ['readInt8', 1, 127],
  5121: ['readUInt8', 1, 255],
  5122: ['readInt16LE', 2, 32767],
  5123: ['readUInt16LE', 2, 65535],
  5125: ['readUInt32LE', 4, 4294967295],
  5126: ['readFloatLE', 4, 1],
};

/** Components per accessor element. */
const TYPE_SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/**
 * The bone whose animated rotation the runtime throws away, and which therefore has to be thrown
 * away here too or every measurement is taken on a knight lying on his face.
 *
 * The Mixamo -> Character-Creator retarget baked a whole-skeleton reorientation into this one track
 * of every clip (Walk's first key is a ~96 degree X pitch), and
 * `neutralizeRootBoneRotation` in `src/presentation/babylon/knight.ts` resets it to identity on
 * every loaded clip. Measuring the sole against the un-neutralised pose would fit the correction to
 * a pose that never renders.
 *
 * Verified against the shipped GLB: exactly one node carries this name, its own rest rotation is
 * absent (identity), `Idle`/`Walk`/`Run`/`Jump` each carry a rotation channel for it, and `0_T-Pose`
 * carries none — so the `0_T-Pose` exclusion below is a no-op on this asset and is kept only because
 * a one-frame reference pose is not something to silently rewrite.
 */
const RETARGET_ROOT_BONE = 'RL_BoneRoot';

/**
 * Parses a GLB and returns readers over it.
 *
 * The returned `j` (the glTF JSON) and `bin` (the BIN chunk, as a `Buffer` **view** onto the file's
 * own bytes) are the live objects: mutating them is how `calibrate.mjs` writes its correction, and
 * writing the file back out is that caller's job.
 *
 * @param path GLB on disk.
 * @returns
 *  - `j` — the parsed glTF JSON.
 *  - `bin` — the BIN chunk. Writable; every byte outside what a caller deliberately changes is the
 *    same object the file was read into.
 *  - `read(i)` — accessor `i` as an array of component arrays, cached.
 *  - `evaluate(clipName, time, modify)` — see below.
 *  - `meshes` — one entry per mesh primitive reachable from a node.
 *  - `skin(state, mesh)` — world-space skinned positions for one of those entries.
 */
export function load(path) {
  const bytes = fs.readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  const j = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  // 12-byte header + 8-byte JSON chunk header + JSON + 8-byte BIN chunk header.
  const bin = bytes.subarray(28 + jsonLength);
  const cache = new Map();

  /** Accessor `i` as `count` arrays of `size` numbers. Honours byteStride and `normalized`. */
  const read = (i) => {
    if (cache.has(i)) return cache.get(i);
    const a = j.accessors[i];
    const view = j.bufferViews[a.bufferView];
    const size = TYPE_SIZES[a.type];
    const ct = COMPONENT_TYPES[a.componentType];
    if (a.sparse) throw Error('sparse');
    const base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const stride = view.byteStride ?? size * ct[1];
    const out = Array.from({ length: a.count }, (_, k) =>
      Array.from({ length: size }, (_, c) => {
        const x = bin[ct[0]](base + k * stride + c * ct[1]);
        return a.normalized ? Math.max(-1, x / ct[2]) : x;
      }),
    );
    cache.set(i, out);
    return out;
  };

  // Nothing below evaluates morph targets, so a driven one would deform the mesh in the runtime and
  // not here — see the scope note at the top of this file.
  //
  // Both spellings of the static array, because glTF has two and they are not interchangeable:
  // `mesh.weights` is the default and `node.weights` overrides it per instance (Babylon resolves
  // exactly that order). This pipeline writes `mesh.weights` — all 42 meshes carry it and no node
  // does — so a guard that read only the node array would be checking the one that is never present
  // and missing the one that always is. Plus every key of every `weights` channel, since a clip can
  // drive a weight both static arrays leave at 0.
  const drivenMorph = () => {
    for (const m of j.meshes) if ((m.weights ?? []).some((w) => w !== 0)) return `mesh ${m.name ?? ''}`;
    for (const n of j.nodes) if ((n.weights ?? []).some((w) => w !== 0)) return `node ${n.name ?? ''}`;
    for (const clip of j.animations ?? [])
      for (const c of clip.channels) {
        if (c.target.path !== 'weights') continue;
        if (read(clip.samplers[c.sampler].output).some((v) => v.some((w) => w !== 0)))
          return `clip ${clip.name}`;
      }
    return null;
  };
  const driven = drivenMorph();
  if (driven) throw Error(`Morph target weights are non-zero (${driven}); this tool skins joints only`);

  const parents = j.nodes.map(() => -1);
  j.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parents[c] = i)));

  /**
   * Poses the node hierarchy and returns both the posed nodes and their world matrices.
   *
   * @param name Clip name, or `null`/`undefined` for the file's own rest pose.
   * @param time Seconds into the clip.
   * @param modify Optional hook run on the posed nodes *after* sampling and *before* world matrices
   *   are accumulated. This is how the calibration asks "what would the sole do if this ankle also
   *   carried rotation X?" without writing anything to the file.
   */
  const evaluate = (name, time = 0, modify = null) => {
    const nodes = j.nodes.map((n) => ({ ...n }));
    const clip = j.animations?.find((a) => a.name === name);
    if (clip) {
      for (const c of clip.channels) {
        const s = clip.samplers[c.sampler];
        const times = read(s.input).map((x) => x[0]);
        const values = read(s.output);
        let k = 0;
        while (k < times.length - 1 && times[k + 1] <= time) k++;
        // Past the last key (and on a one-key track) hold the last value rather than extrapolate.
        const t = k === times.length - 1 ? 0 : Math.max(0, (time - times[k]) / (times[k + 1] - times[k]));
        if (s.interpolation === 'CUBICSPLINE') throw Error('cubic');
        nodes[c.target.node][c.target.path] =
          s.interpolation === 'STEP' || t === 0
            ? values[k]
            : c.target.path === 'rotation'
              ? slerp(values[k], values[k + 1], t)
              : values[k].map((x, i) => x + (values[k + 1][i] - x) * t);
      }
    }
    // Mirror the runtime's retarget fix; see RETARGET_ROOT_BONE.
    if (name !== '0_T-Pose') {
      for (const n of nodes) if (n.name === RETARGET_ROOT_BONE) n.rotation = [0, 0, 0, 1];
    }
    if (modify) modify(nodes);
    const world = [];
    const get = (i) =>
      world[i] ??
      (world[i] =
        parents[i] < 0
          ? (nodes[i].matrix ?? trs(nodes[i]))
          : mul(get(parents[i]), nodes[i].matrix ?? trs(nodes[i])));
    nodes.forEach((_, i) => get(i));
    return { nodes, world };
  };

  /** Every mesh primitive reachable from a node, named after the **node** — which is also what
   *  Babylon names the runtime mesh, so these names match `HEAD_MESHES` and friends in `src/`. */
  const meshes = j.nodes.flatMap((n, ni) =>
    n.mesh === undefined
      ? []
      : j.meshes[n.mesh].primitives.map((p, pi) => ({
          ni,
          name: n.name,
          skin: n.skin,
          positions: read(p.attributes.POSITION),
          // Both joint/weight sets when the primitive carries them, so a vertex with more than four
          // influences skins correctly. This is a live path, not future-proofing: 27 of this model's
          // 42 primitives carry JOINTS_1/WEIGHTS_1, with secondary weights up to 0.056, and reading
          // only set 0 would silently drop half of each such vertex's influences. The two boots
          // happen to be single-set, so the sole measurement itself would survive — which is exactly
          // why dropping this would go unnoticed.
          sets: [0, 1]
            .filter((k) => p.attributes['JOINTS_' + k] !== undefined)
            .map((k) => ({ j: read(p.attributes['JOINTS_' + k]), w: read(p.attributes['WEIGHTS_' + k]) })),
        })),
  );

  /** World-space positions of one `meshes` entry under a pose from {@link evaluate} — full linear
   *  blend skinning, or the node's own world matrix when the primitive is not skinned. */
  const skin = (state, mesh) => {
    const sk = j.skins[mesh.skin];
    const joints = sk?.joints.map((n, k) => mul(state.world[n], read(sk.inverseBindMatrices)[k]));
    return mesh.positions.map((p, i) => {
      if (!joints) return point(state.world[mesh.ni], p);
      const out = [0, 0, 0];
      for (const set of mesh.sets) {
        for (let c = 0; c < 4; c++) {
          const w = set.w[i][c];
          if (w) {
            const v = point(joints[set.j[i][c]], p);
            v.forEach((x, k) => (out[k] += w * x));
          }
        }
      }
      return out;
    });
  };

  return { j, bin, read, evaluate, meshes, skin };
}
