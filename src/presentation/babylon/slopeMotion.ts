import { vec3, type Vec3 } from '../../domain/math/vec3';

/**
 * Keeps the character moving at its intended speed across sloped ground.
 *
 * The domain thinks in flat ground: it accelerates a **horizontal** velocity toward `maxSpeed` /
 * `runSpeed`. The world is not flat, so two conversions bracket the physics step — tilt the domain's
 * horizontal velocity onto the surface on the way in, and report the speed the character actually
 * travelled along that surface on the way back.
 *
 * Without the pair, the two ends disagree and feed each other downward. A velocity tilted onto a
 * slope has a smaller *horizontal* component; the domain reads that back as "current speed" and only
 * adds `acceleration * delta` to it, so the loop settles at roughly
 * `acceleration * delta / (1 - cos(slope))` instead of the intended top speed. Measured on the hub
 * before this existed: running collapsed from 8 u/s to **2.9** on a 4° rise and **1.4** on a 22° one —
 * slopes that plainly do not look steep. (The effective angle is worse than the terrain's average
 * gradient, because the collider's half-unit triangles are locally steeper than the smooth height
 * field: a 7° hillside presents ~19° contact normals.)
 */

/** Below this a vector has no usable direction, and normalising it would divide by ~zero. */
const EPSILON = 1e-6;

/**
 * Rotates `velocity` onto the plane of a surface with unit normal `normal`, keeping its speed. Uphill
 * gains a vertical component and loses horizontal reach; running across the slope is unchanged.
 */
export const alignToSurface = (velocity: Vec3, normal: Vec3): Vec3 => {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (speed < EPSILON) return velocity;

  const intoSurface = velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z;
  const tangentX = velocity.x - normal.x * intoSurface;
  const tangentY = velocity.y - normal.y * intoSurface;
  const tangentZ = velocity.z - normal.z * intoSurface;

  const tangentLength = Math.hypot(tangentX, tangentY, tangentZ);
  if (tangentLength < EPSILON) return velocity;

  const rescale = speed / tangentLength;
  return vec3(tangentX * rescale, tangentY * rescale, tangentZ * rescale);
};

/**
 * The inverse of {@link alignToSurface}: re-expresses a velocity that follows a slope as the flat
 * velocity of the same speed, so the domain's horizontal bookkeeping stays honest. The vertical
 * component is left alone — only the horizontal pair is rescaled.
 */
export const flattenToGroundSpeed = (velocity: Vec3): Vec3 => {
  const horizontal = Math.hypot(velocity.x, velocity.z);
  if (horizontal < EPSILON) return velocity;

  const rescale = Math.hypot(velocity.x, velocity.y, velocity.z) / horizontal;
  return vec3(velocity.x * rescale, velocity.y, velocity.z * rescale);
};
