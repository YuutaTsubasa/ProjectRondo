import { DEFAULT_CONFIG, type MovementConfig } from '../hub/character/movementConfig';

/** Trial tuning: faster traversal with a shorter start-up and a sub-two-unit stopping distance. */
export const COURSE_MOVEMENT: MovementConfig = {
  ...DEFAULT_CONFIG,
  runSpeed: 10,
  acceleration: 22,
  deceleration: 28,
};
