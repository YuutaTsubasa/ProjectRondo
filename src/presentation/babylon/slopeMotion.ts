import { vec3, type Vec3 } from '../../domain/math/vec3';

/**
 * Lets the character follow sloped ground without the slope stealing or bending its motion.
 *
 * The domain thinks in flat ground: it accelerates a **horizontal** velocity toward `maxSpeed` /
 * `runSpeed`. Handing that straight to the solver goes wrong in two ways on a hill.
 *
 * **It bleeds speed.** The solver clips the into-the-hill part away, `playerController` feeds the
 * shortened velocity back, and the domain reads its own shrunken horizontal component as "current
 * speed" — adding only `acceleration * delta` on top. The loop settles far below the intended top
 * speed: measured on the hub, running collapsed from 8 u/s to **2.9 on a 4° rise** and **1.4 on a 22°
 * one**. The contact angle is worse than the hillside looks, too — the collider's half-unit triangles
 * are locally steeper than the smooth height field, so a 7° slope presents ~19° contact normals.
 *
 * **It bends the heading.** Projecting the velocity onto the contact plane swings it toward the
 * contour, so running straight at a hill slid the character sideways along it — measured drift of 62°
 * on a 27° slope.
 *
 * Adding *only* the vertical component needed to lie in the surface plane fixes both at once: the
 * horizontal velocity survives untouched, so it neither shrinks (nothing to bleed back) nor turns
 * (the character climbs exactly where it was pointed).
 */

/**
 * Steepest surface the character is steered up. Past it the velocity is handed over unchanged and
 * ordinary collide-and-slide takes over, which is what makes a too-steep face behave like a wall —
 * the hub's natural barrier depends on that. Set above the ~32° the walkable terrain is designed to
 * stay within, and well below the controller's own 60° `maxSlopeCosine`.
 */
const WALKABLE_SLOPE_DEGREES = 40;
const WALKABLE_SLOPE_COSINE = Math.cos((WALKABLE_SLOPE_DEGREES * Math.PI) / 180);

/**
 * Adds the climb (or descent) that makes a horizontal velocity lie in the plane of the surface it is
 * standing on, leaving the horizontal part exactly as it was. `normal` must be unit length. A surface
 * steeper than {@link WALKABLE_SLOPE_DEGREES} is passed through untouched.
 *
 * NOT exported, and that is what holds the condition {@link solverVelocity} documents. It replaces
 * `velocity.y` outright, so it is only correct on a frame whose vertical component the surface owns;
 * leaving it reachable from outside the module made checking that optional for whoever picked this
 * export instead — which is how a jump, a dash and a bounce were flattened in the first place.
 * `solverVelocity` is the only way in, so the check cannot be skipped.
 */
const alignToSurface = (velocity: Vec3, normal: Vec3): Vec3 => {
  if (normal.y < WALKABLE_SLOPE_COSINE) return velocity;

  const intoSlope = velocity.x * normal.x + velocity.z * normal.z;
  return vec3(velocity.x, -intoSlope / normal.y, velocity.z);
};

/** What a frame has to say about itself before {@link alignToSurface} may be applied to it. */
export interface SolverFrame {
  /** `groundContact`'s verdict, the same one the domain was handed as `isGrounded`. */
  readonly grounded: boolean;
  /**
   * The domain decided this frame's vertical velocity itself, instead of leaving it at the 0 that
   * ordinary grounded locomotion produces: a jump, or any frame of a homing dash — including the
   * arrival frame, whose velocity is the bounce.
   */
  readonly ownsClimb: boolean;
}

/**
 * The velocity to hand the character controller for one frame.
 *
 * {@link alignToSurface} *replaces* `velocity.y` with the climb the surface demands rather than adding
 * to it, so it may only be shown a velocity whose vertical component is the surface's to decide.
 * Grounded locomotion is the only such frame: `nextVerticalSpeed` returns 0 for it, and the climb is
 * then entirely a fact about the ground. Every other velocity the domain emits carries a vertical
 * speed that the substitution would throw away — a jump's `jumpSpeed`, a dash's climb toward an
 * overhead crystal, an arrival's `homingBounceSpeed`.
 *
 * Both homing cases genuinely reach a grounded frame, which is why the jump alone is not enough of a
 * guard: `stepGroundContact` moves an `airborne` contact to `grounded` on any supported frame, while
 * `isHomingFrame` keeps a dash alive regardless of `isGrounded`. A dash skimming ground on its way to
 * an overhead crystal was flattened to horizontal for as long as the probe held support, and a bounce
 * — purely vertical, so its `intoSlope` is 0 — was replaced with `(0, 0, 0)` before Havok saw it,
 * while the crystal still flashed and the knight still restarted its jump clip.
 */
export const solverVelocity = (
  velocity: Vec3,
  surfaceNormal: Vec3,
  { grounded, ownsClimb }: SolverFrame,
): Vec3 => (grounded && !ownsClimb ? alignToSurface(velocity, surfaceNormal) : velocity);
