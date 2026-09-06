/**
 * Proves that `calibrate.mjs` changed the two ankles and nothing else.
 *
 *   node tools/knight-feet/integrity.mjs original.glb corrected.glb
 *
 * `verify.mjs` answers "are the soles level now?". This answers the other half — "and what else did
 * you touch?" — which matters because the tool rewrites a 12 MB shipped binary in place of a
 * re-export, so a silent change to a skin weight, a key time or an unrelated bone would ship with no
 * other signal. The check is deliberately literal rather than semantic: it diffs the two files **byte
 * by byte**, and every byte it permits to differ has to be inside a quaternion it can name.
 *
 * What it asserts, in order:
 *  1. The glTF's animation, skin and mesh blocks are deep-equal — same clips, same channels, same key
 *     times, same interpolation modes, same primitives.
 *  2. Every node is deep-equal, except that the two `LeftFoot`/`RightFoot` nodes may have a new
 *     `rotation`. Nothing may be renamed, re-parented, translated or rescaled.
 *  3. Every animation track that is not a foot *rotation* decodes to identical values — the split
 *     is on (node, path), so a translation or scale track on an ankle is compared, not exempted.
 *  4. Every corrected quaternion is still unit length (a drifting quaternion skews the whole limb).
 *  5. **Angular motion is preserved.** Composing a constant rotation with each key is supposed to
 *     leave the *step* between adjacent keys untouched; the dot product of neighbouring keys is a
 *     rotation-invariant measure of that step, so comparing it before and after catches a correction
 *     that squashed or stretched the clip. Tolerance 1e-6 against float32 keys.
 *  6. Every byte of the BIN chunk outside the corrected quaternions is unchanged.
 *  7. **Everything else in the glTF JSON is deep-equal** — accessors, bufferViews, materials,
 *     textures, images, samplers, scenes and the rest. Assertions 1-2 exist for their messages; this
 *     one exists so the guarantee does not depend on having listed the right blocks. Three
 *     differences are allowed through by name: the two foot node rotations, the min/max of the
 *     accessors this run rewrote (whose new values assertion 4 recomputes rather than trusts), and
 *     `asset.extras.knightFootCalibration` — that one key, not the `asset` block around it.
 *
 * Exported as a function so `verify.mjs` runs it on the paths it already parsed, rather than the two
 * files racing to re-read `process.argv` and agreeing only by coincidence.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { load, norm, qm } from './glb.mjs';

/** The ankle nodes this tool is allowed to have changed. */
const FOOT_NODE = /^(Left|Right)Foot$/;

/**
 * Throws on the first violation; otherwise returns a report of what was allowed to change.
 *
 * @param originalPath the uncalibrated input handed to `calibrate.mjs`.
 * @param correctedPath its output.
 */
export function checkIntegrity(originalPath, correctedPath) {
  const a = load(originalPath);
  const b = load(correctedPath);
  /** Byte offsets in the BIN chunk this run accounts for as deliberately rewritten. */
  const changed = new Set();

  assert.deepEqual(a.j.animations, b.j.animations, 'Animation timelines/channels changed');
  assert.deepEqual(a.j.skins, b.j.skins, 'Skin changed');
  assert.deepEqual(a.j.meshes, b.j.meshes, 'Mesh layout changed');

  for (let i = 0; i < a.j.nodes.length; i++) {
    const actual = { ...b.j.nodes[i] };
    // Copy the one field the calibration is allowed to have written, so any *other* difference —
    // including a renamed or re-parented foot — still fails the comparison below.
    if (FOOT_NODE.test(actual.name)) actual.rotation = a.j.nodes[i].rotation;
    assert.deepEqual(a.j.nodes[i], actual, 'Unexpected node change ' + actual.name);
  }

  let keys = 0;
  let channels = 0;
  let maxSpeedError = 0;
  /** Accessors this run rewrote, so the JSON comparison below can permit their min/max to move. */
  const correctedAccessors = new Set();
  for (const anim of a.j.animations) {
    for (const ch of anim.channels) {
      const acc = anim.samplers[ch.sampler].output;
      const aa = a.read(acc);
      const bb = b.read(acc);
      // On (node, path), not the node alone. The calibration rewrites foot *rotation* and nothing
      // else, so a translation or scale track aimed at an ankle must still be compared byte for
      // byte — exempting it by node would make the one file whose job is "what else did you touch?"
      // blind in the direction it exists to watch. It would also run a non-VEC4 accessor through
      // the unit-length assertion and the 16-bytes-per-key marking below, both of which assume
      // quaternions. Latent on this asset: both ankles carry rotation channels only.
      if (!FOOT_NODE.test(a.j.nodes[ch.target.node].name) || ch.target.path !== 'rotation') {
        assert.deepEqual(aa, bb, `${anim.name}: non-foot-rotation track changed`);
        continue;
      }
      channels++;
      correctedAccessors.add(acc);
      const ac = a.j.accessors[acc];
      const view = a.j.bufferViews[ac.bufferView];
      const base = (view.byteOffset ?? 0) + (ac.byteOffset ?? 0);
      const stride = view.byteStride ?? 16;
      for (let k = 0; k < ac.count; k++) {
        keys++;
        assert(Math.abs(Math.hypot(...bb[k]) - 1) < 1e-6, 'Quaternion not normalized');
        for (let x = 0; x < 16; x++) changed.add(base + k * stride + x);
        if (k) {
          const step = (q, r) => Math.abs(q.reduce((s, x, i) => s + x * r[i], 0) / (Math.hypot(...q) * Math.hypot(...r)));
          maxSpeedError = Math.max(maxSpeedError, Math.abs(step(aa[k - 1], aa[k]) - step(bb[k - 1], bb[k])));
        }
      }

      // The bound has to be *right*, not merely allowed to move. Exempting by accessor identity
      // alone would let a run that rewrote the quaternions and forgot to recompute min/max pass
      // exactly as a correct one does — the stale-bounds spec violation calibrate.mjs warns about,
      // waved through by the file that exists to catch it. Recomputed here from the corrected keys,
      // which are already decoded. Dead on today's asset: none of the 10 foot-rotation accessors
      // carries a bound at all, which is also why the omission was invisible.
      for (const bound of ['min', 'max']) {
        if (!Object.hasOwn(b.j.accessors[acc], bound)) continue;
        const pick = bound === 'min' ? Math.min : Math.max;
        const want = [0, 1, 2, 3].map((c) => pick(...bb.map((q) => q[c])));
        assert.deepEqual(
          b.j.accessors[acc][bound],
          want,
          `${anim.name}: accessor ${bound} was not recomputed from the corrected keys`,
        );
      }
    }
  }
  assert(maxSpeedError < 1e-6, 'Angular motion changed');

  assert.equal(a.bin.length, b.bin.length);
  for (let i = 0; i < a.bin.length; i++) {
    if (!changed.has(i)) assert.equal(a.bin[i], b.bin[i], `Non-foot binary byte changed at ${i}`);
  }

  // Everything the checks above did not name. They cover the blocks a bad calibration is *likely* to
  // disturb and give precise messages when it does; this one covers the rest of the glTF JSON —
  // accessors, bufferViews, materials, textures, images, samplers, scenes — none of which was
  // compared before, so a zeroed baseColorFactor or a shifted accessor min returned pass: true.
  //
  // Built as an allowlist rather than a block list: start from the corrected file and put back only
  // the three things the calibration is entitled to have written. Anything else it changed survives
  // into the comparison and fails it.
  const expected = structuredClone(b.j);
  for (let i = 0; i < a.j.nodes.length; i++) {
    if (FOOT_NODE.test(expected.nodes[i].name)) expected.nodes[i].rotation = a.j.nodes[i].rotation;
  }
  // calibrate.mjs recomputes min/max on the accessors it rewrites — its own comment calls a stale
  // pair "a spec violation that shows up downstream as wrong culling bounds rather than as a load
  // error", so this is the one block outside the quaternions it deliberately touches.
  for (const i of correctedAccessors) {
    for (const bound of ['min', 'max']) {
      // Only when both sides already have the key. Assigning `undefined` would *create* it, which
      // deepStrictEqual counts as a difference; and permitting an accessor to gain or lose a bound
      // is not what "recomputed" means, so those still fail.
      if (bound in a.j.accessors[i] && bound in expected.accessors[i]) {
        expected.accessors[i][bound] = a.j.accessors[i][bound];
      }
    }
  }
  // The receipt only. Replacing the whole `asset` block would hide `generator`, `version`,
  // `copyright` and every other field under it — the same blind spot this assertion was added to
  // close, one level down. What the calibration writes is one key, so one key is what is exempted;
  // the receipt's own contents are checked by `knightFootCalibration.test.ts` against the geometry.
  if (a.j.asset.extras?.knightFootCalibration === undefined) {
    delete expected.asset.extras?.knightFootCalibration;
    if (expected.asset.extras && Object.keys(expected.asset.extras).length === 0) {
      if (a.j.asset.extras === undefined) delete expected.asset.extras;
    }
  } else {
    expected.asset.extras.knightFootCalibration = a.j.asset.extras.knightFootCalibration;
  }
  assert.deepEqual(a.j.asset, expected.asset, 'Something under asset changed besides the receipt');

  // The receipt cannot be diffed — the original has none — so it is checked against what this run
  // just measured instead. `calibrate.mjs` writes `corrected = norm(original * rest.q)`, so each
  // recorded `rest.q` has to reproduce the rotation actually found on that node. A receipt claiming
  // corrections that were never applied is the one way the calibration can lie to a reader, since it
  // is also what makes a second run refuse to double-apply.
  //
  // `undoParentPitchDegrees` is deliberately not checked: it is a provenance label with no
  // counterpart in either file's geometry, so nothing here can confirm it. Said plainly rather than
  // implied to be covered.
  // Only when this run really is a calibration — i.e. the original has no receipt of its own. Two
  // already-calibrated files compared against each other are a different question (nothing changed),
  // and `rest.q` describes the step from raw to corrected, not from corrected to corrected.
  const receipt = b.j.asset.extras?.knightFootCalibration;
  if (receipt && a.j.asset.extras?.knightFootCalibration === undefined) {
    for (const c of receipt.corrections) {
      assert(FOOT_NODE.test(b.j.nodes[c.node].name), `Receipt names a non-foot node: ${c.name}`);
      assert.equal(b.j.nodes[c.node].name, c.name, 'Receipt node index and name disagree');
      const want = norm(qm(a.j.nodes[c.node].rotation ?? [0, 0, 0, 1], c.rest.q));
      const got = b.j.nodes[c.node].rotation;
      const off = Math.max(...want.map((x, i) => Math.abs(x - got[i])));
      assert(off < 1e-6, `Receipt's ${c.name} rest correction does not reproduce the shipped rotation`);
    }
  }
  assert.deepEqual(a.j, expected, 'Something outside the ankles changed in the glTF JSON');

  return {
    pass: true,
    correctedRotationChannels: channels,
    correctedKeys: keys,
    maxRotationStepDotError: maxSpeedError,
    untouchedBinaryBytes: a.bin.length - changed.size,
    clips: a.j.animations.map((x) => x.name),
  };
}

// Standalone CLI. `verify.mjs` imports `checkIntegrity` instead of running this.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node integrity.mjs original.glb corrected.glb');
  console.log(JSON.stringify(checkIntegrity(process.argv[2], process.argv[3])));
}
