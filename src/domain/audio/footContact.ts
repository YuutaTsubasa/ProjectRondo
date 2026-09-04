/**
 * The phases within each locomotion clip at which a foot is on the ground.
 *
 * These exist because the locomotion clips are **not speed-scaled**: `driveKnightAnimation` starts
 * Idle/Walk/Run with `group.play(true)` and never touches `speedRatio`, cross-fading them by weight
 * alone. The visible cadence is therefore fixed at each clip's authored rate (Walk 1.033 s, Run
 * 0.633 s — `2026-08-20-run-jump-movement-design.md` §4), and a footstep sound driven by distance
 * travelled would drift out of phase with the feet within a stride. Locking to the clip's phase is
 * what keeps sound and picture together.
 *
 * Measured from the shipped GLB by stepping each clip through 100 evenly spaced phases with
 * `goToFrame` and reading the world height of the toe-base joints `LeftToes` / `RightToes`, with the
 * render loop stopped so the character is frozen and the animation phase is the only thing moving
 * them. The contact is the phase at which a toe is lowest; `lift` is how far it rises above that,
 * which is what says the minimum is a footfall and not a flat curve:
 *
 * | Clip | Foot | contact phase | toe lift above contact |
 * | --- | --- | --- | --- |
 * | Walk | left | 0.33 | 0.2902 |
 * | Walk | right | 0.83 | 0.2514 |
 * | Run | left | 0.4 | 0.8985 |
 * | Run | right | 0.82 | 0.801 |
 *
 * The two feet of a gait land 0.5 (walk) and 0.42 (run) of a cycle apart. 0.42 is on the low side of
 * "roughly half a cycle" but is what the measurement above actually found for Run — not a defect in
 * the numbers below, just a less symmetric gait than Walk's.
 *
 * Re-measure whenever the clips are re-exported: these are properties of the animation data, not of
 * the character, and the GLB pipeline has already changed once (see the README's regeneration notes).
 */

/** Phase in [0, 1) of each footfall in the Walk clip. Index 0 is the left foot. */
export const WALK_CONTACTS: readonly [number, number] = [0.33, 0.83]; // <- measured values

/** Phase in [0, 1) of each footfall in the Run clip. Index 0 is the left foot. */
export const RUN_CONTACTS: readonly [number, number] = [0.4, 0.82]; // <- measured values
