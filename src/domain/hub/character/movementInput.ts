import { type NormalizedPlanarDirection, NONE } from '../../kernel/normalizedPlanarDirection';

export interface MovementInput {
  readonly direction: NormalizedPlanarDirection;
  readonly jumpRequested: boolean;
}

export const NONE_INPUT: MovementInput = { direction: NONE, jumpRequested: false };
