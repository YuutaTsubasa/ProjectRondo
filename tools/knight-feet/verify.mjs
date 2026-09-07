/**
 * Checks a calibrated GLB: soles level where they should be, and nothing else touched.
 *
 *   node tools/knight-feet/verify.mjs original.glb corrected.glb
 *
 * Two independent questions, both of which have to pass before anything prints "PASS":
 *  1. **Is it level?** Re-measures sole pitch in the rest pose, `0_T-Pose` and every motion clip the
 *     file carries, at 60 Hz, and requires rest / `0_T-Pose` / `Idle` within one degree of level at every
 *     sample. The motion clips are only required to stay finite — a running foot is *supposed* to
 *     pitch, and pinning it flat would be the bug.
 *  2. **Is anything else different?** Delegated to `integrity.mjs`, on the same two paths this script
 *     parsed, so the two checks cannot end up looking at different files.
 *
 * The landmark vertices are taken from the **original**, so before and after are measured on the
 * same physical patch of sole rather than on whatever each file's own thresholds happen to select.
 */
import assert from 'node:assert/strict';
import { load } from './glb.mjs';
import { landmarks, measured } from './sole.mjs';
import { checkIntegrity } from './integrity.mjs';

/** Poses required to be level, and how far off level they may be, in degrees. */
const MUST_BE_LEVEL = ['rest', '0_T-Pose', 'Idle'];
const LEVEL_TOLERANCE = 1;
/** Motion clips are sampled at this rate; the reference poses are one sample each. */
const SAMPLE_HZ = 60;

const [, , originalPath, correctedPath] = process.argv;
if (!originalPath || !correctedPath) throw Error('Usage: node verify.mjs original.glb corrected.glb');

const original = load(originalPath);
const g = load(correctedPath);
const lms = landmarks(original);

/**
 * Poses to sample: the file's own rest pose, then every clip the file actually carries.
 *
 * Read off the GLB rather than listed here, because a literal list and a derived count are two lists
 * that drift. They did: this script printed its clip count from `integrity.clips` while sampling a
 * hardcoded list that stopped at `Jump`, so `FlyingKick` was reported as covered and never posed.
 */
const poses = [null, ...g.j.animations.map((a) => a.name)];

// The level list is a policy, not a coverage claim, so it stays spelled out -- but a name in it that
// matches no pose would quietly check nothing, which is how a renamed clip would slip through.
const sampled = new Set(poses.map((p) => p ?? 'rest'));
for (const name of MUST_BE_LEVEL) {
  assert(sampled.has(name), `${name} is required to be level but the file carries no such pose`);
}

const report = [];
for (const name of poses) {
  const anim = g.j.animations.find((a) => a.name === name);
  const duration = anim ? Math.max(...anim.samplers.map((s) => g.read(s.input).at(-1)[0])) : 0;
  const n = name ? Math.ceil(duration * SAMPLE_HZ) : 0;
  const values = lms.map(() => []);
  for (let i = 0; i <= n; i++) {
    const posed = g.evaluate(name, n ? (duration * i) / n : 0);
    lms.forEach((lm, k) => values[k].push(measured(g, lm, posed).pitch));
  }
  // A non-finite angle means the skinning produced NaN somewhere, which every min/mean/max below
  // would then quietly propagate instead of failing.
  for (const v of values) assert(v.every(Number.isFinite), 'Invalid skinned sole measurement in ' + name);
  report.push({
    clip: name ?? 'rest',
    samples: n + 1,
    feet: values.map((v, k) => ({
      foot: lms[k].foot,
      min: Math.min(...v),
      mean: v.reduce((s, x) => s + x, 0) / v.length,
      max: Math.max(...v),
    })),
  });
}

// Printed before the assertions below so a failure comes with the numbers that caused it.
console.log(JSON.stringify(report, null, 2));

for (const r of report.filter((r) => MUST_BE_LEVEL.includes(r.clip))) {
  for (const f of r.feet) {
    assert(
      Math.max(Math.abs(f.min), Math.abs(f.max)) < LEVEL_TOLERANCE,
      `${r.clip} ${f.foot}: sole pitch ${f.min.toFixed(2)} to ${f.max.toFixed(2)} degrees; ` +
        `expected within ${LEVEL_TOLERANCE} degree of level`,
    );
  }
}

// Runs before anything claims success: an integrity failure used to surface as a bare assertion
// stack trace underneath a line that had already printed "PASS".
const integrity = checkIntegrity(originalPath, correctedPath);
// Counted off `report`, which is what the loop above actually visited, so this line cannot claim
// coverage the run did not perform. Deriving it from `integrity.clips` did exactly that.
const motionClips = report.filter((r) => r.clip !== 'rest' && r.clip !== '0_T-Pose').length;
console.log(JSON.stringify(integrity));
console.log(
  `PASS: ${MUST_BE_LEVEL.join(', ')} soles level; ${motionClips} motion clips sampled at ${SAMPLE_HZ} Hz; ` +
    `${integrity.correctedKeys} keys corrected across ${integrity.correctedRotationChannels} channels and ` +
    `${integrity.untouchedBinaryBytes} binary bytes unchanged.`,
);
