export const MovementConstants = {
  // maxSpeed in units/s. The knight is ~1.9u tall, so 12 (~sprint) made the walk animation
  // foot-slide; ~4 reads as a brisk walk that roughly matches the walk cycle. Accel/decel are
  // scaled down with it to keep the same ~0.3s ramp feel (were 40/50 at maxSpeed 12). Tune live
  // in dev via `window.moveConfig` (see playerController).
  //
  // runSpeed is 2x maxSpeed because the run clip covers 1.96x the ground per second that the walk
  // clip does (toe-vs-hips stride 0.680/0.633s against walk's 0.566/1.033s), so run inherits walk's
  // foot-slide ratio instead of worsening it. See the run/jump design spec, section 4.
  //
  // turnRate is angular (rad/s) rather than another linear acceleration, so a sprinting knight turns
  // as sharply as a walking one. Steering the heading instead of lerping the velocity vector is what
  // stops the model facing one way while the body still slides the other. 10 rad/s turns 90 degrees in
  // ~0.16s, which matches the pace the model used to swing round at.
  maxSpeed: 4, runSpeed: 8, turnRate: 10, acceleration: 13, deceleration: 17, gravity: 24, jumpSpeed: 9,
} as const;
