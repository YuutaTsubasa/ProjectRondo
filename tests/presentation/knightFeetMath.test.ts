import { describe, it, expect } from 'vitest';
import { qm, norm, axis, mul, point, trs, slerp } from '../../tools/knight-feet/glb.mjs';

/**
 * The quaternion and matrix algebra `tools/knight-feet` fits its correction with.
 *
 * `knightFootCalibration.test.ts` re-measures the shipped boot **through this same code**, so an
 * error in it cancels: the correction is fitted against a wrong pose, the check re-derives the same
 * wrong pose, and the soles read level while the runtime renders something else. That is the hazard
 * `load()`'s morph-target rejection closes for the file's *contents*; this file closes it for the
 * tool's own arithmetic, which nothing else can see.
 *
 * So every expectation here is worked out by hand or from an independent identity — never by running
 * the function and recording what it said. Where a hand value would be opaque, the test states the
 * property instead (a composition equals the rotation it should equal, an inverse round-trips), which
 * is checkable without trusting the implementation.
 */

const R2 = Math.SQRT1_2; // sin(45°) = cos(45°)
const close = (a: number[], b: number[], digits = 12) =>
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i], digits));

/** Rotate a vector by a quaternion, via the matrix path, so the two agree by construction or fail. */
const rotate = (q: number[], v: number[]) => point(trs({ rotation: q }), v);

describe('axis and norm', () => {
  it('builds the half-angle form glTF stores', () => {
    // 90° about +Y is [0, sin45, 0, cos45].
    close(axis([0, 1, 0], Math.PI / 2), [0, R2, 0, R2]);
    // 180° about +X is [1, 0, 0, 0] — w = cos(90°) = 0.
    close(axis([1, 0, 0], Math.PI), [1, 0, 0, 0]);
  });

  it('leaves a unit quaternion alone and rescales one that drifted', () => {
    close(norm([0, R2, 0, R2]), [0, R2, 0, R2]);
    close(norm([0, 2, 0, 0]), [0, 1, 0, 0]);
  });
});

describe('qm', () => {
  // The single fact the whole tool rests on, and the one a sign error would silently invert.
  it('is a post-rotation in the left operand’s local frame', () => {
    const yaw = axis([0, 1, 0], Math.PI / 2); // +90° about Y: +X -> -Z
    const pitch = axis([1, 0, 0], Math.PI / 2); // +90° about X: +Y -> +Z

    // qm(yaw, pitch) applies pitch FIRST, in the frame yaw defines. Take +Y: pitch sends it to +Z,
    // then yaw (about Y) sends +Z to +X. So the composite maps +Y -> +X.
    close(rotate(qm(yaw, pitch), [0, 1, 0]), [1, 0, 0]);

    // The other order applies yaw first: +Y is on yaw's axis and is unmoved, then pitch sends it to
    // +Z. Different answer, which is what makes the operand order load-bearing.
    close(rotate(qm(pitch, yaw), [0, 1, 0]), [0, 0, 1]);
  });

  it('cancels against the conjugate, which is how the tests roll a correction back', () => {
    const q = norm([0.3, -0.5, 0.2, 0.78]);
    const conjugate = [-q[0], -q[1], -q[2], q[3]];
    close(qm(q, conjugate), [0, 0, 0, 1]);
    close(qm(conjugate, q), [0, 0, 0, 1]);
  });

  it('adds angles about a shared axis', () => {
    // 30° then 60° about the same axis is 90° about it, whichever way round they go.
    const a = axis([0, 0, 1], Math.PI / 6);
    const b = axis([0, 0, 1], Math.PI / 3);
    close(qm(a, b), axis([0, 0, 1], Math.PI / 2));
    close(qm(b, a), axis([0, 0, 1], Math.PI / 2));
  });
});

describe('trs and mul', () => {
  it('puts the translation in m[12..14], as column-major glTF requires', () => {
    const m = trs({ translation: [1, 2, 3] });
    expect(m.slice(12, 15)).toEqual([1, 2, 3]);
    // A row-major layout would put it at 3/7/11 instead; those must stay zero.
    expect([m[3], m[7], m[11]]).toEqual([0, 0, 0]);
  });

  it('applies translate * rotate * scale in that order', () => {
    // Scale 2, rotate 90° about Z (+X -> +Y), translate +X. A point at [1,0,0] should land at
    // [1, 2, 0]: scaled to [2,0,0], rotated to [0,2,0], translated to [1,2,0].
    const m = trs({ translation: [1, 0, 0], rotation: axis([0, 0, 1], Math.PI / 2), scale: [2, 2, 2] });
    close(point(m, [1, 0, 0]), [1, 2, 0]);
  });

  it('composes as parent * child, the child applied first', () => {
    const parent = trs({ translation: [10, 0, 0] });
    const child = trs({ translation: [0, 5, 0] });
    // The child's offset is expressed in the parent's frame, so the point lands at [10, 5, 0].
    close(point(mul(parent, child), [0, 0, 0]), [10, 5, 0]);
    // Reversed, the parent's offset would be applied inside the child — same here, but the general
    // case differs, so pin the rotating one too.
    const spun = mul(trs({ rotation: axis([0, 0, 1], Math.PI / 2) }), trs({ translation: [1, 0, 0] }));
    close(point(spun, [0, 0, 0]), [0, 1, 0]);
  });

  it('agrees with qm on composition, so the matrix and quaternion paths cannot drift apart', () => {
    const a = axis([0.5, 0.5, R2], 0.7); // unit: 0.25 + 0.25 + 0.5 = 1
    const b = axis([0, 1, 0], -1.1);
    const v = [0.3, -0.7, 0.2];
    close(rotate(qm(a, b), v), point(mul(trs({ rotation: a }), trs({ rotation: b })), v), 10);
  });
});

describe('slerp', () => {
  it('returns the endpoints at t = 0 and t = 1', () => {
    const a = axis([0, 1, 0], 0.2);
    const b = axis([0, 1, 0], 1.3);
    close(slerp(a, b, 0), a);
    close(slerp(a, b, 1), b);
  });

  it('lands exactly halfway, at the angle and not at the chord', () => {
    // 0° to 90° about Y, halfway, is 45° about Y — a lerp would give a shorter, non-unit vector.
    close(slerp(axis([0, 1, 0], 0), axis([0, 1, 0], Math.PI / 2), 0.5), axis([0, 1, 0], Math.PI / 4));
  });

  // `q` and `-q` are the same rotation, so a sampler that ignores the sign takes the 270° way round
  // and the boot swings through the floor between two keys.
  it('takes the short arc when the second key is the negated twin of the same rotation', () => {
    const from = axis([0, 1, 0], 0);
    const to = axis([0, 1, 0], Math.PI / 2);
    const negated = to.map((x) => -x);
    const short: number[] = slerp(from, to, 0.5);
    const viaNegated: number[] = slerp(from, negated, 0.5);
    // Same rotation either way: equal up to sign.
    const abs = (q: number[]) => q.map((x) => Math.abs(x));
    close(abs(viaNegated), abs(short));
    // And it really is the 45° one, not the 135° one the long arc would give.
    close(rotate(viaNegated, [1, 0, 0]), rotate(axis([0, 1, 0], Math.PI / 4), [1, 0, 0]));
  });

  it('stays unit-length through the nearly-parallel fallback', () => {
    const a = axis([0, 1, 0], 0.5);
    const b = axis([0, 1, 0], 0.5 + 1e-6); // dot > 0.9995, so the lerp branch runs
    expect(Math.hypot(...slerp(a, b, 0.5))).toBeCloseTo(1, 12);
  });
});
