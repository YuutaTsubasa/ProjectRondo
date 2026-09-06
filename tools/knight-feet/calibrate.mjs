/**
 * Levels the knight's boot soles in the exported GLB, in place of a re-rig.
 *
 *   node tools/knight-feet/calibrate.mjs input.glb output.glb [pre-rotation degrees: 0 or 20]
 *   node tools/knight-feet/verify.mjs    input.glb output.glb
 *
 * **What is wrong with the export.** The imported rest pose points the shoe roughly 10.8 degrees
 * nose-down (heel-to-toe line, measured — see `sole.mjs`), and the retargeted `Idle` compounds that
 * to about -32.8 degrees, so the knight stands on his heels with his toes in the air. Every clip is
 * retargeted mocap and the mesh is shipped as one baked GLB, so there is nothing upstream in this
 * repository to fix: the correction is applied to the exported file.
 *
 * **What it does.** For each ankle it searches for the single constant rotation, in that ankle's own
 * local frame, that drives the mean sole pitch to zero, and multiplies that rotation into the ankle's
 * rest rotation and into every key of every rotation track that targets it. A *constant* rotation
 * composed with each key preserves the clip exactly as motion: key times, interpolation mode, the
 * angular step between adjacent keys, and therefore every crossfade the runtime builds out of them.
 * `integrity.mjs` asserts all of that against the input afterwards, byte by byte.
 *
 * Three rotations are fitted per foot rather than one, because the three poses do not share an ankle
 * rotation: the file's own rest pose, the one-frame `0_T-Pose`, and one fitted against 31 evenly
 * spaced `Idle` poses that is then applied to all four motion clips.
 *
 * **The third argument is a fixed pre-rotation, and its provenance is unknown.** It left-multiplies
 * every motion-clip ankle key by a rotation of `-degrees` about parent-frame X before the constant
 * correction is fitted and applied. The shipped `public/models/knight_web.glb` was built with `20`,
 * which is recorded in its own `asset.extras.knightFootCalibration.undoParentPitchDegrees`. An
 * earlier revision of this tool described that as undoing a "+20 degree" offset baked by a previous
 * `extract_anims.gd`; **that explanation is withdrawn.** No revision of `extract_anims.gd` in this
 * repository's history applies any ankle or foot rotation — the only rotation it has ever baked is
 * the -5 degree thigh adduction it still carries — so there is nothing in this repository the `20`
 * undoes, and where it came from is not recorded anywhere here.
 *
 * **So use `0` for a fresh export.** Both values leave rest, `0_T-Pose` and `Idle` equally level (the
 * fit forces that), and both pass `verify.mjs`. What they change is the other three clips: measured
 * on a reconstruction of the pre-calibration GLB, sampling rest, `0_T-Pose` and all four clips at
 * 60 Hz, `0` and `20` agree to within 0.30 degrees of sole pitch on `Idle` and differ by at most
 * **2.73 degrees** anywhere (worst case `Run`, right foot). `0` is the smaller intervention — it
 * applies only the fitted local correction, where `20` also rewrites every motion key with a
 * pre-rotation nothing in this repository asks for. `20` is kept reachable solely so the shipped
 * asset can be reproduced from its source export.
 */
import fs from 'node:fs';
import { load, qm, norm, axis } from './glb.mjs';
import { landmarks, measured, sub, unit } from './sole.mjs';

/** Clips the shipped knight carries, sorted. A different set means a different export; stop. */
const EXPECTED_CLIPS = '0_T-Pose,Idle,Jump,Run,Walk';
/** The one clip that is a reference pose rather than motion — fitted and corrected on its own. */
const REFERENCE_CLIP = '0_T-Pose';
/** Clip the animated correction is fitted against, and how many evenly spaced poses to fit over. */
const FIT_CLIP = 'Idle';
const FIT_SAMPLES = 31;
/** Bisection bracket, in degrees, and its iteration count. See {@link solveFor}. */
const SEARCH_LO = -60;
const SEARCH_HI = 30;
const SEARCH_ITERATIONS = 28;

const [, , input, out, preRotationDegrees = '0'] = process.argv;
if (!input || !out || !['0', '20'].includes(preRotationDegrees)) {
  throw Error(
    'Usage: node calibrate.mjs input.glb output.glb [fixed pre-rotation degrees]\n' +
      '  0   a fresh export — nothing in this repository bakes an ankle offset to cancel\n' +
      '  20  reproduces the shipped public/models/knight_web.glb from its own source export',
  );
}
if (input === out) throw Error('Use a separate output so the source remains available for verification');

const g = load(input);
// Before landmarks(). Its toe threshold is cut against the *uncalibrated* rest pose, so on a
// levelled boot the toe patch comes back empty and its own assert fires first — reporting changed
// boot geometry when the real mistake is passing the calibrated output where the raw export belongs.
if (g.j.asset.extras?.knightFootCalibration) {
  throw Error('This GLB is already calibrated; refusing to apply the correction twice');
}
const lms = landmarks(g);
if (lms.length !== 2) throw Error('Expected both knight boot meshes');
if (g.j.animations.map((a) => a.name).sort().join(',') !== EXPECTED_CLIPS) {
  throw Error('Unexpected clip set; inspect before calibrating');
}

/**
 * Rotates a direction by the **transpose** of a column-major matrix's upper 3x3.
 *
 * For the rigid, uniformly-scaled matrices in this hierarchy the transpose is the inverse rotation,
 * so this maps a world-space direction back into a node's local frame — which is where the ankle's
 * correction has to live if it is to be composed with that node's own rotation.
 */
const transposeDir = (m, p) => [0, 1, 2].map((i) => m[i * 4] * p[0] + m[i * 4 + 1] * p[1] + m[i * 4 + 2] * p[2]);

/**
 * The fixed pre-rotation, as a quaternion: `-degrees` about X, applied in the ankle's parent frame.
 * See the module header for what is and is not known about it. Identity when the argument is `0`.
 */
const preRotation = axis([1, 0, 0], (-Number(preRotationDegrees) * Math.PI) / 180);

/** Applies {@link preRotation} to both ankles of a posed node list, in the parent frame (left-multiply). */
const applyPreRotation = (nodes) => {
  for (const lm of lms) nodes[lm.node].rotation = qm(preRotation, nodes[lm.node].rotation);
};

const corrections = [];
for (const lm of lms) {
  const rest = g.evaluate(null);
  const p = measured(g, lm, rest);

  // The axis to pitch the foot about.
  //
  // `forward` is the heel->toe direction in world space. `right` is that direction turned 90 degrees
  // about world +Y and flattened onto the ground plane: for forward (fx, fy, fz) it is (fz, 0, -fx),
  // whose dot product with forward is fz*fx - fx*fz = 0 (verified numerically: 1e-17). So it is the
  // horizontal axis perpendicular to the way the foot points — the only axis whose rotation raises
  // the toe relative to the heel without also yawing the foot off its heading or rolling it onto an
  // edge. Both of those would move the sole without changing the pitch this tool is fitting, and
  // would show up as a twisted foot.
  const forward = unit(sub(p.toe, p.heel));
  const right = unit([forward[2], 0, -forward[0]]);
  // Carried into the ankle's local frame once, from the rest pose, so the same constant quaternion
  // is valid in every pose: a local-frame rotation follows the bone, where a world-frame one would
  // have to be re-derived per frame and would no longer be a constant the clips can be composed with.
  const localAxis = unit(transposeDir(rest.world[lm.node], right));

  /**
   * Bisects for the rotation about `localAxis` that zeroes this foot's mean sole pitch.
   *
   * The measured pitch is (to within rounding) **linear and strictly decreasing** in the search
   * variable, at -1 degree of pitch per +1 degree of rotation — verified by sweeping the whole
   * bracket on the pre-calibration GLB: at -60 the sole reads +49.2 degrees and at +30 it reads
   * -40.8, monotone throughout, for both feet. That is why `pitch > 0` moves the **low** bound up:
   * a positive pitch means the toes are still high, and more rotation is what brings them down. The
   * sign convention is the load-bearing part — flip that branch and the search walks to whichever
   * bracket end it started nearest and reports a bound as if it were a root.
   *
   * 28 halvings of the 90-degree bracket land within 90/2^28, about 3e-7 degrees, which is far below
   * the precision the float32 rotation keys can hold anyway.
   *
   * @param clip Clip name, or `null` for the file's rest pose.
   * @param times Times to average the pitch over — one entry for a static pose.
   * @param withPreRotation Whether to apply {@link preRotation} to the pose first. True only for the
   *   motion fit, because only the motion clips are written with it.
   */
  const solveFor = (clip, times, withPreRotation) => {
    let lo = SEARCH_LO;
    let hi = SEARCH_HI;
    for (let iteration = 0; iteration < SEARCH_ITERATIONS; iteration++) {
      const deg = (lo + hi) / 2;
      const q = axis(localAxis, (deg * Math.PI) / 180);
      let total = 0;
      for (const time of times) {
        const posed = g.evaluate(clip, time, (nodes) => {
          if (withPreRotation) applyPreRotation(nodes);
          nodes[lm.node].rotation = qm(nodes[lm.node].rotation, q);
        });
        total += measured(g, lm, posed).pitch;
      }
      if (total / times.length > 0) lo = deg;
      else hi = deg;
    }
    const deg = (lo + hi) / 2;
    return { deg, q: axis(localAxis, (deg * Math.PI) / 180) };
  };

  const fitClip = g.j.animations.find((a) => a.name === FIT_CLIP);
  const duration = Math.max(...fitClip.samplers.map((s) => g.read(s.input).at(-1)[0]));
  corrections.push({
    name: lm.foot,
    node: lm.node,
    localAxis,
    rest: solveFor(null, [0], false),
    tpose: solveFor(REFERENCE_CLIP, [0], false),
    // One correction for all four motion clips, fitted over a whole Idle cycle so it lands on the
    // clip's mean rather than on whichever single frame happened to be sampled.
    animation: solveFor(
      FIT_CLIP,
      Array.from({ length: FIT_SAMPLES }, (_, i) => (duration * i) / (FIT_SAMPLES - 1)),
      true,
    ),
  });
}

/**
 * Overwrites a float VEC4 accessor in place, in the BIN chunk, honouring its view's byteStride.
 *
 * In place is the point: the buffer keeps its layout, so every byte outside these quaternions is
 * still the byte the input had — which is what lets `integrity.mjs` diff the two files literally.
 */
function writeAccessor(i, values) {
  const a = g.j.accessors[i];
  const v = g.j.bufferViews[a.bufferView];
  if (a.componentType !== 5126 || a.type !== 'VEC4') throw Error('Expected float quaternion');
  const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = v.byteStride ?? 16;
  values.forEach((q, k) => q.forEach((x, c) => g.bin.writeFloatLE(x, base + k * stride + c * 4)));
}

for (const c of corrections) {
  // The rest rotation takes the correction as a post-multiply — `q` first, in the ankle's local
  // frame — which is the same composition every key below gets, so posed and unposed stay consistent.
  g.j.nodes[c.node].rotation = norm(qm(g.j.nodes[c.node].rotation, c.rest.q));
  for (const a of g.j.animations) {
    const ch = a.channels.find((ch) => ch.target.node === c.node && ch.target.path === 'rotation');
    if (!ch) throw Error('Missing foot rotation ' + a.name);
    const s = a.samplers[ch.sampler];
    // CUBICSPLINE keys carry in/out tangents alongside each value; composing a rotation with the
    // values alone would leave the tangents describing the old curve. Refuse rather than mangle.
    if (s.interpolation === 'CUBICSPLINE') throw Error('Cubic rotations need tangent correction');
    const isMotion = a.name !== REFERENCE_CLIP;
    const values = g
      .read(s.output)
      .map((q) => norm(qm(isMotion ? qm(preRotation, q) : q, isMotion ? c.animation.q : c.tpose.q)));
    writeAccessor(s.output, values);
    // glTF lets an accessor declare min/max, and a stale pair is a spec violation that shows up
    // downstream as wrong culling bounds rather than as a load error. Recompute only what was there.
    const acc = g.j.accessors[s.output];
    if (acc.min) acc.min = [0, 1, 2, 3].map((i) => Math.min(...values.map((q) => q[i])));
    if (acc.max) acc.max = [0, 1, 2, 3].map((i) => Math.max(...values.map((q) => q[i])));
  }
}

// The receipt: what was fitted, and with which pre-rotation. It is what makes a second run of this
// tool refuse to double-apply the correction, and `tests/presentation/knightFootCalibration.test.ts`
// reads it back off the shipped GLB to re-measure the soles on every test run.
g.j.asset.extras = {
  ...g.j.asset.extras,
  knightFootCalibration: {
    version: 1,
    undoParentPitchDegrees: Number(preRotationDegrees),
    corrections,
  },
};

// Re-emit the container: 12-byte header, then the JSON chunk padded to 4 bytes with spaces, then the
// original BIN chunk unchanged apart from the quaternions written above.
const raw = Buffer.from(JSON.stringify(g.j));
const json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32);
raw.copy(json);
const header = Buffer.alloc(20);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + json.length + g.bin.length, 8);
header.writeUInt32LE(json.length, 12);
header.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(g.bin.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'
fs.writeFileSync(out, Buffer.concat([header, json, binHeader, g.bin]));
console.log(JSON.stringify({ output: out, corrections }, null, 2));
