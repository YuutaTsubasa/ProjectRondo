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
 *
 * Exported as a function so `verify.mjs` runs it on the paths it already parsed, rather than the two
 * files racing to re-read `process.argv` and agreeing only by coincidence.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { load } from './glb.mjs';

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
    }
  }
  assert(maxSpeedError < 1e-6, 'Angular motion changed');

  assert.equal(a.bin.length, b.bin.length);
  for (let i = 0; i < a.bin.length; i++) {
    if (!changed.has(i)) assert.equal(a.bin[i], b.bin[i], `Non-foot binary byte changed at ${i}`);
  }

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
