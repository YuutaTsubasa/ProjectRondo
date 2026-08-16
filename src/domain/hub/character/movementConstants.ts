export const MovementConstants = {
  // maxSpeed in units/s. The knight is ~1.9u tall, so 12 (~sprint) made the walk animation
  // foot-slide; ~4 reads as a brisk walk that roughly matches the walk cycle. Accel/decel are
  // scaled down with it to keep the same ~0.3s ramp feel (were 40/50 at maxSpeed 12). Tune live
  // in dev via `window.moveConfig` (see playerController).
  maxSpeed: 4, acceleration: 13, deceleration: 17, gravity: 24, jumpSpeed: 9,
} as const;
