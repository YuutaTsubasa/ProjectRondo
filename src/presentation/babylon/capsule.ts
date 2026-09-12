/**
 * The player's physics-capsule dimensions, and where a capsule is put when it is placed on a surface
 * rather than moved onto one — the single source shared by the character controller
 * (`playerController`), the knight's foot-seating (`knight`) and both levels' spawns and checkpoints,
 * so all of them stay in agreement if the capsule is ever resized (they used to hardcode the
 * half-height independently).
 */
export const CAPSULE_RADIUS = 0.5;
/** Half the height of the capsule's cylindrical section (excludes the two hemispherical caps). */
export const CYLINDER_HALF_HEIGHT = 0.5;
/** Total capsule height: the cylinder plus the two hemispherical caps. */
export const CAPSULE_HEIGHT = CYLINDER_HALF_HEIGHT * 2 + CAPSULE_RADIUS * 2;
/** Capsule centre-to-feet distance (half the total height) — how far the centre sits above the soles. */
export const CAPSULE_HALF = CAPSULE_HEIGHT / 2;

/**
 * How far the capsule's base starts above the surface it is placed on — the hub's spawn over the
 * terrain, the tower's spawn on its floor, and every tower checkpoint over its pad.
 *
 * Small and positive on purpose: a capsule that starts embedded pops through the one-sided MESH
 * collider and falls out of the world, so it is placed just clear and allowed to settle down onto the
 * surface. That is why a checkpoint is a point in open air above its platform and never a point on
 * it.
 *
 * **Untuned**: 0.3 u, and its direction is measured while its size is not. Spec §13.1 found a capsule
 * teleported 3 u BELOW a surface lost through the collider outright, while open air and "0.3 u above"
 * both settled cleanly — so the sign and the order of magnitude are fixed, and the gap the capsule
 * actually needs is not. Nobody has watched a spawn settle. It is a guess inside a constraint.
 */
export const SPAWN_CLEARANCE = 0.3;

/**
 * The world Y a capsule's CENTRE takes to stand {@link SPAWN_CLEARANCE} clear of a surface at
 * `surfaceY` — a spawn, or a checkpoint respawn.
 *
 * A function rather than the sum written out at each call site, because the two levels wrote the same
 * `surface + CAPSULE_HALF + 0.3` for the same reason and each kept its own copy of the 0.3; the rule
 * is one rule, and this is the one place that has to change if the clearance or the capsule does.
 */
export const spawnCentreY = (surfaceY: number): number => surfaceY + CAPSULE_HALF + SPAWN_CLEARANCE;
