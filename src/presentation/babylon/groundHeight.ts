/**
 * "How high is the ground at this x/z" — the one question the character asks about a world it is
 * otherwise ignorant of. An argument rather than an import because the hub answers it from a height
 * field and the tower answers it with a floor, and a character that imports one of those answers is
 * a character that only works in one scene.
 */
export type GroundHeight = (x: number, z: number) => number;

/** A world whose ground is a single plane — the tower's floor. */
export const flatGround = (y: number): GroundHeight => () => y;
