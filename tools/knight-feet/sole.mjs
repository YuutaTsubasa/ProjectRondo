/**
 * Locating the knight's boot soles, and measuring how level they sit.
 *
 * The whole calibration rests on one number: **sole pitch**, the angle above horizontal of the line
 * from the heel patch's centroid to the toe patch's centroid, in degrees, positive when the toes are
 * higher than the heel. Everything else in `calibrate.mjs` is a search for the ankle rotation that
 * drives that number to zero.
 *
 * Why a vertex patch and not the ankle bone: the boot's sole extends well below the ankle joint and
 * is not parallel to any bone axis, so a bone-space angle is not the angle a player sees the foot
 * make with the ground. The patches are picked **once**, from the rest pose, and then the *same
 * vertex indices* are re-measured in every other pose — so before/after comparisons are of the same
 * physical piece of leather, not of whatever happens to be lowest in each pose.
 */

/** Centroid of a list of points. */
const mean = (p) => [0, 1, 2].map((k) => p.reduce((s, v) => s + v[k], 0) / p.length);

/** Component-wise `a - b`. */
/**
 * The boot meshes, by glTF node name, mapped to the ankle each is skinned to.
 *
 * Everything in this block is what a character swap has to change, which is why it is here rather
 * than inside `landmarks` — `docs/knight-foot-calibration.md` names these as the first thing to
 * revisit, and a value named at module scope is one a reader can find from that sentence.
 */
const BOOT_MESHES = { Mesh_7: 'LeftFoot', Mesh_26: 'RightFoot' };

/** Heel patch: behind the ankle, low on the boot. World-space metres in the rest pose. */
const HEEL = { maxZ: -0.035, maxY: 0.035 };

/** Toe patch: ahead of the ankle, and tighter in Y because the toe box curves upward — a looser
 *  ceiling drags the upper into the patch and tilts the centroid. */
const TOE = { minZ: 0.055, maxY: 0.012 };

/** Vertices a patch must contain before its centroid is worth trusting. */
const MIN_PATCH = 50;

export const sub = (a, b) => a.map((x, i) => x - b[i]);

/** Unit-length copy of a vector. */
export const unit = (a) => a.map((x) => x / Math.hypot(...a));

/**
 * The two boot meshes, with the heel and toe vertex patches to measure them by.
 *
 * `Mesh_7` (the left boot, at +x) and `Mesh_26` (the right boot, at -x) are the stylized fantasy
 * knight's boots, by glTF **node** name — which is what Babylon names the runtime mesh, so these are
 * the same names `src/` uses.
 *
 * The patches are cut with fixed thresholds in the rest pose's world space, where the knight stands
 * at the origin facing +Z with the soles near y = 0. Measured on the *uncalibrated* export this runs
 * against, not on the shipped file: lowest rest vertex y = 0 to four decimals, boots spanning
 * z -0.068 to +0.093.
 *   - heel: `z < -0.035` and `y < 0.035` — behind the ankle, low on the boot.
 *   - toe:  `z > 0.055` and `y < 0.012` — ahead of the ankle, and tighter in y because the toe box
 *     curves upward, so a looser ceiling would drag the upper into the patch and tilt the centroid.
 *
 * Both are cut *below* any part of the boot's shaft, so the pair spans the sole rather than the boot.
 * The counts are asserted (>= 50 each) because these thresholds are geometry-specific: a different
 * boot silhouette would quietly select a handful of vertices, or none, and still produce a plausible
 * finite angle. On that uncalibrated export they select 272 heel / 307 toe vertices on the
 * left boot and 237 / 290 on the right.
 *
 * Those thresholds do not survive calibration, which is expected rather than a bug: on the levelled
 * `public/models/knight_web.glb` the toe patch comes back **empty** (197 heel / 0 toe, and 174 / 0),
 * so this throws. `calibrate.mjs` rejects an already-calibrated file before reaching here, and
 * `knightFootCalibration.test.ts` rolls the correction back before it measures.
 *
 * @returns one entry per boot: `{ m, node, foot, heel, toe }`, where `node` is the index of the
 *   `LeftFoot`/`RightFoot` ankle node whose rotation the calibration corrects, and `heel`/`toe` are
 *   vertex indices into that mesh's POSITION accessor.
 */
export function landmarks(g) {
  return g.meshes
    .filter((m) => m.name in BOOT_MESHES)
    .map((m) => {
      const p = g.skin(g.evaluate(null), m);
      const foot = BOOT_MESHES[m.name];
      const node = g.j.nodes.findIndex((n) => n.name === foot);
      const pick = (keep) => p.map((v, i) => ({ v, i })).filter((x) => keep(x.v)).map((x) => x.i);
      const heel = pick((v) => v[2] < HEEL.maxZ && v[1] < HEEL.maxY);
      const toe = pick((v) => v[2] > TOE.minZ && v[1] < TOE.maxY);
      if (node < 0 || heel.length < MIN_PATCH || toe.length < MIN_PATCH) {
        throw Error('This calibration requires the current knight boot geometry');
      }
      return { m, node, foot, heel, toe };
    });
}

/**
 * Sole pitch (and the pieces it is made of) for one boot under one pose.
 *
 * `s` is a pose from `glb.mjs`'s `evaluate`. The mesh is re-skinned from scratch here rather than
 * cached, because the caller is usually asking about a *hypothetical* pose (an ankle rotation the
 * file does not carry yet).
 *
 * @returns `{ pitch, heel, toe, min }` — pitch in degrees, the two patch centroids in world space,
 *   and the whole mesh's lowest corner, which is what tells you the boot has not sunk through y = 0.
 */
export function measured(g, lm, s) {
  const m = g.meshes.find((m) => m.name === lm.m.name);
  const p = g.skin(s, m);
  const h = mean(lm.heel.map((i) => p[i]));
  const t = mean(lm.toe.map((i) => p[i]));
  const v = sub(t, h);
  // atan2(rise, horizontal run): the angle the heel->toe line makes with the ground plane, so it is
  // independent of which way the knight is facing.
  return { pitch: (Math.atan2(v[1], Math.hypot(v[0], v[2])) * 180) / Math.PI, heel: h, toe: t };
}
