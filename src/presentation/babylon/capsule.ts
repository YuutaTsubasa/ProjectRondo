/**
 * The player's physics-capsule dimensions — the single source shared by the character controller
 * (`playerController`) and the knight's foot-seating (`knight`), so the knight stays planted if the
 * capsule is ever resized (they used to hardcode the half-height independently).
 */
export const CAPSULE_RADIUS = 0.5;
/** Half the height of the capsule's cylindrical section (excludes the two hemispherical caps). */
export const CYLINDER_HALF_HEIGHT = 0.5;
/** Total capsule height: the cylinder plus the two hemispherical caps. */
export const CAPSULE_HEIGHT = CYLINDER_HALF_HEIGHT * 2 + CAPSULE_RADIUS * 2;
/** Capsule centre-to-feet distance (half the total height) — how far the centre sits above the soles. */
export const CAPSULE_HALF = CAPSULE_HEIGHT / 2;
