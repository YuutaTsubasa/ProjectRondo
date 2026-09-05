import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load, qm } from '../../tools/knight-feet/glb.mjs';
import { landmarks, measured } from '../../tools/knight-feet/sole.mjs';

/**
 * Guards the one property of the shipped knight GLB that nothing else can see.
 *
 * `tools/knight-feet/calibrate.mjs` levels the boot soles *after* the Godot export, and the README
 * makes it step 3 of the rebuild recipe. Skipping it re-ships the bug it fixed — the knight standing
 * on his heels with his toes in the air — and every other signal stays green: the file still loads,
 * still has four clips, still animates, and a `?v` bump in `knight.ts` still looks like a normal
 * rebuild. `verify.mjs` and `integrity.mjs` are the deeper checks, but both need the *uncalibrated*
 * intermediate, which is never committed, so neither can run here.
 *
 * So this re-measures the shipped file itself, the same way the tool does: it re-skins both boots and
 * checks the heel-to-toe line is level in the poses that have to be level. It is not a structural
 * echo of the receipt in `asset.extras` — a hand-edited receipt over an uncalibrated mesh fails here.
 */
const GLB = fileURLToPath(new URL('../../public/models/knight_web.glb', import.meta.url));

/** Same bound `verify.mjs` enforces, and the same poses it enforces it on. */
const LEVEL_TOLERANCE_DEGREES = 1;
/** Idle is a cycle, so a single frame proves nothing; this many evenly spaced poses across it do. */
const IDLE_SAMPLES = 12;

/** Conjugate of a unit quaternion, i.e. its inverse. */
const conjugate = (q: number[]): number[] => [-q[0], -q[1], -q[2], q[3]];

describe('the shipped knight GLB is foot-calibrated', () => {
  it('is a real GLB on disk, not an unfetched LFS pointer', () => {
    expect(readFileSync(GLB).toString('ascii', 0, 4)).toBe('glTF');
  });

  const g = load(GLB);
  const receipt = g.j.asset.extras?.knightFootCalibration;

  it('carries the calibration receipt calibrate.mjs writes', () => {
    // Absent means the GLB went straight from `gltf-transform webp` into `public/` — README step 3
    // skipped. The receipt is also what makes a second calibration pass refuse to double-apply.
    expect(receipt, 'no asset.extras.knightFootCalibration — was tools/knight-feet/calibrate.mjs run?').toBeDefined();
    expect(receipt.version).toBe(1);
    expect(receipt.corrections.map((c: { name: string }) => c.name).sort()).toEqual(['LeftFoot', 'RightFoot']);
    expect(Number.isFinite(receipt.undoParentPitchDegrees)).toBe(true);
  });

  /**
   * Heel and toe vertex patches, picked the way `calibrate.mjs` picked them.
   *
   * `landmarks` cuts its patches with thresholds against the **uncalibrated** rest pose — on a
   * levelled boot the toe patch rises out of its own ceiling and the cut comes back empty. So the
   * ankles are temporarily rolled back through the receipt's own rest correction, the patches are
   * taken there, and the real rotations are put back before anything is measured. Same physical
   * patch of sole the tool fitted against, measured on what actually ships.
   */
  let memo: { lms: { foot: string }[]; rolledBack: number[] } | undefined;
  const rollback = () => {
    if (memo) return memo;
    // Not at module scope: an uncalibrated GLB has no receipt to roll back through, and failing
    // *inside* a test says so, where throwing during collection would take the whole file down with
    // an unrelated TypeError and hide the receipt check above.
    if (!receipt) throw new Error('cannot locate the sole patches: the GLB carries no knightFootCalibration receipt');
    const shipped = receipt.corrections.map((c: { node: number }) => g.j.nodes[c.node].rotation);
    receipt.corrections.forEach((c: { node: number; rest: { q: number[] } }, i: number) => {
      g.j.nodes[c.node].rotation = qm(shipped[i], conjugate(c.rest.q));
    });
    const lms = landmarks(g);
    const undone = g.evaluate(null);
    const rolledBack = lms.map((lm: { foot: string }) => measured(g, lm, undone).pitch);
    receipt.corrections.forEach((c: { node: number }, i: number) => {
      g.j.nodes[c.node].rotation = shipped[i];
    });
    memo = { lms, rolledBack };
    return memo;
  };
  const patches = () => rollback().lms;

  /** Every sole pitch in `clip`, in degrees, positive when the toes are above the heel. */
  const pitches = (clip: string | null, samples: number): { foot: string; time: number; pitch: number }[] => {
    const anim = g.j.animations.find((a: { name: string }) => a.name === clip);
    const duration = anim ? Math.max(...anim.samplers.map((s: { input: number }) => g.read(s.input).at(-1)[0])) : 0;
    return Array.from({ length: samples }, (_, i) => (samples > 1 ? (duration * i) / samples : 0)).flatMap((time) => {
      const posed = g.evaluate(clip, time);
      return patches().map((lm: { foot: string }) => ({ foot: lm.foot, time, pitch: measured(g, lm, posed).pitch }));
    });
  };

  /**
   * Ties the receipt to the mesh, which is what stops the levelness checks below from being graded
   * on a curve.
   *
   * Because the fit drives the corrected pitch to zero and the pitch moves 1:1 (and opposite) with
   * the fitted angle, the pre-calibration rest pitch of each boot **is** that boot's recorded
   * `rest.deg`. So rolling the ankles back through the receipt has to land exactly on the number the
   * receipt itself records. When it does not, the receipt is describing a mesh other than the one in
   * the file — and the patches `landmarks` cut from that rolled-back pose are no longer the patches
   * the tool fitted against, which quietly *shrinks* the error the checks below can see (measured: a
   * 3-degree tilt on both ankles reads as only 1.2 degrees through drifted patches, but shows up
   * here at full size).
   */
  it('rolls back to exactly the rest pitch the receipt recorded', () => {
    const { lms, rolledBack } = rollback();
    const recorded = lms.map(
      (lm: { foot: string }) =>
        receipt.corrections.find((c: { name: string }) => c.name === lm.foot).rest.deg as number,
    );
    rolledBack.forEach((pitch, i) => {
      expect(Math.abs(pitch - recorded[i]), `${lms[i].foot}: rolled back to ${pitch}, receipt says ${recorded[i]}`)
        .toBeLessThan(0.05);
    });
  });

  // The rest pose and 0_T-Pose are what the character is seated and scaled against on load
  // (`loadKnight` measures the lowest skinned vertex); Idle is what it stands in 99% of the time.
  // Uncalibrated these read about -10.8, -0.9 and -32.8 degrees respectively.
  it.each([
    ['the rest pose', null, 1],
    ['0_T-Pose', '0_T-Pose', 1],
    ['Idle', 'Idle', IDLE_SAMPLES],
  ])('has level soles in %s', (_label, clip, samples) => {
    const off = pitches(clip as string | null, samples as number).filter(
      (p) => Math.abs(p.pitch) >= LEVEL_TOLERANCE_DEGREES,
    );
    expect(off.map((p) => `${p.foot}@${p.time.toFixed(3)}s ${p.pitch.toFixed(2)}deg`)).toEqual([]);
  });

  // The correction is a constant rotation, so it must not have flattened the clips that are supposed
  // to pitch. Without this, "level everywhere" would also pass.
  it('leaves the moving clips moving', () => {
    for (const clip of ['Walk', 'Run', 'Jump']) {
      const all = pitches(clip, 12);
      expect(all.every((p) => Number.isFinite(p.pitch))).toBe(true);
      const spread = Math.max(...all.map((p) => p.pitch)) - Math.min(...all.map((p) => p.pitch));
      expect(spread, `${clip} sole pitch spread`).toBeGreaterThan(10);
    }
  });
});
