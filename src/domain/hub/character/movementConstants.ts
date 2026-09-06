/**
 * Movement tuning, in world units and seconds. Tune live in dev via `window.moveConfig` (see
 * playerController).
 *
 * The knight is ~1.9u tall, so `maxSpeed` 12 (~sprint) made the walk animation foot-slide; ~4 reads
 * as a brisk walk that roughly matches the walk cycle. Accel/decel are scaled down with it to keep
 * the same ~0.3s ramp feel (they were 40/50 at maxSpeed 12).
 *
 * `runSpeed` is 2x `maxSpeed` because the run clip covers 1.96x the ground per second that the walk
 * clip does (toe-vs-hips stride 0.680/0.633s against walk's 0.566/1.033s), so run inherits walk's
 * foot-slide ratio instead of worsening it. See the run/jump design spec, section 4.
 *
 * `turnRate` is angular (rad/s) rather than another linear acceleration, so a sprinting knight turns
 * as sharply as a walking one. Steering the heading instead of lerping the velocity vector is what
 * stops the model facing one way while the body still slides the other. 10 rad/s turns 90 degrees
 * in ~0.16s, which matches the pace the model used to swing round at.
 */
export const MovementConstants = {
  maxSpeed: 4, runSpeed: 8, turnRate: 10, acceleration: 13, deceleration: 17, gravity: 24, jumpSpeed: 9,

  /**
   * Homing attack. ALL FIVE ARE UNTUNED — four are derived starting points and `homingRange` is a
   * plain guess, and no pass has changed any of them. That is not the same as no evidence: the
   * 2026-09-05 browser pass exercised all five and every check passed at its derived value, which
   * is why none was retuned. But it ran at commit `d3b64cb`, before `05f1923` made the dash correct
   * course toward its target every frame, and it covered less than the list of names suggests — no
   * check measures dash speed by eye, for instance. Read the design spec §7 before treating any one
   * of these as evidenced; it records per constant what its check did and did not cover. Tune live
   * via `window.moveConfig` and record what they settle at.
   *
   * `homingSpeed` 24 is 3x `runSpeed`, so the dash reads as a dash rather than a fast run.
   * `homingBounceSpeed` 9 equals `jumpSpeed`, so a chain gains the height the player already has an
   * intuition for. `homingRange` 12 is derived from nothing — a guess at "far enough to be worth
   * aiming at, near enough that the dash is not a teleport". It is the one of the five with no
   * argument behind it, so it is the first to retune. For scale while doing so: the knight's jump
   * apex is `jumpSpeed²/(2*gravity)` = 1.6875 u (the run/jump design spec records the measured arc as
   * +1.70 u), so 12 u is ~7 apexes, and a running jump covers `runSpeed * 2*jumpSpeed/gravity` = 6 u
   * of ground, so it is two of those. `homingConeHalfAngle` 0.61 rad is 35 degrees — wide enough to
   * forgive a roughly-aimed camera, narrow enough that two crystals at different headings stay
   * distinguishable, which is the number route choice lives or dies on. `homingMaxDuration` 0.6 s
   * is the 0.5 s it takes to cross `homingRange` at `homingSpeed` plus margin; it is a safety
   * bound, not a feel knob (see characterMovement's dash branch). That bound is only meaningful
   * because `stepHoming` derives `remaining` from presentation's live offset to the target rather
   * than dead-reckoning it from `homingSpeed * delta` — a dash obstructed by terrain then genuinely
   * fails to reach zero and this is what stops it, instead of the value being unreachable dead code
   * (the defect the 2026-09-05 browser pass found and this fixes).
   */
  homingRange: 12,
  homingConeHalfAngle: 0.6109,
  homingSpeed: 24,
  homingBounceSpeed: 9,
  homingMaxDuration: 0.6,
} as const;
