import { type NormalizedPlanarDirection, NONE } from '../../kernel/normalizedPlanarDirection';

export interface MovementInput {
  readonly direction: NormalizedPlanarDirection;
  readonly jumpRequested: boolean;
  /** Sprint modifier held. A state, not an edge — unlike `jumpRequested`. */
  readonly runRequested: boolean;
}

export const NONE_INPUT: MovementInput = { direction: NONE, jumpRequested: false, runRequested: false };
