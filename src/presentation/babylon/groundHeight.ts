/**
 * "How high is the ground at this x/z, if this world can say" — the one question the character asks
 * about a world it is otherwise ignorant of. An argument rather than an import because the hub
 * answers it from a height field and the tower cannot answer it at all, and a character that imports
 * one of those answers is a character that only works in one scene.
 *
 * **`null` is a distinct answer from any height, and the reason this type exists in this shape.** A
 * height field is the surface under a character anywhere over it, so the hub answers everywhere. A
 * world built of stacked platforms has no such function: it can state where its floor is, but the
 * floor is the surface under a character standing at the base and under nobody standing 40 u up on a
 * slab. Handing back the floor there is a *wrong* answer rather than an imprecise one, and it was
 * wrong in the way that is hardest to see coming — the knight was rendered down on the tower floor at
 * every platform edge, where the foot probe's ray misses the slab and falls back to this query while
 * the capsule is still on the platform. So `null` says "no answer here" and each consumer decides
 * what it does without one, rather than every world being forced to invent a number.
 */
export type GroundHeight = (x: number, z: number) => number | null;

/**
 * A world with no ground *field* to query — the tower's.
 *
 * Every surface a character stands on there is a collider (the floor slab, and each platform), which
 * the foot probe's own raycast finds without help, and which `playerController`'s support probe finds
 * for the capsule. What is left for this query to describe is a single plane at the base, true only
 * for a character standing on it, and there is no (x, z) at which that is reliably the answer: the
 * whole level is stacked above it.
 *
 * The camera consumes the same query, and what it loses here is small and known: with no ground under
 * it to clear, `followCamera`'s floor is `minCameraHeight` 0.5 rather than the floor plus
 * `CAMERA_GROUND_CLEARANCE` 0.6, and its grounded anti-judder anchor never engages at the base. Both
 * only ever applied within a couple of units of y 0 — the tower's floor is flat, so there is no
 * judder there to damp — and 0.5 is still above the floor at y 0, which is what that clamp is for.
 */
export const unknownGround: GroundHeight = () => null;
