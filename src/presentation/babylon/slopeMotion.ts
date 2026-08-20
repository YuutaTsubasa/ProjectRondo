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
 */
export const alignToSurface = (velocity: Vec3, normal: Vec3): Vec3 => {
  if (normal.y < WALKABLE_SLOPE_COSINE) return velocity;

  const intoSlope = velocity.x * normal.x + velocity.z * normal.z;
  return vec3(velocity.x, -intoSlope / normal.y, velocity.z);
};
