import type { Vec3 } from '../../domain/math/vec3';

export interface ReticleState {
  readonly target: Vec3 | null;
  readonly elapsed: number;
}
export const HIDDEN_RETICLE: ReticleState = { target: null, elapsed: 0 };
const ACQUIRE_SECONDS = 0.16;

/** Static anchors: compare coordinates, not object identity, so continuous preview does not pulse. */
export function stepReticle(state: ReticleState, target: Vec3 | null, dt: number): ReticleState {
  if (!target) return HIDDEN_RETICLE;
  const same = state.target && state.target.x === target.x && state.target.y === target.y && state.target.z === target.z;
  return {
    target: same ? state.target : { ...target },
    elapsed: same ? Math.min(ACQUIRE_SECONDS, state.elapsed + Math.max(0, dt)) : 0,
  };
}

export function reticleAppearance(state: ReticleState): { scale: number; alpha: number } {
  if (!state.target) return { scale: 1, alpha: 0 };
  const remaining = Math.pow(1 - state.elapsed / ACQUIRE_SECONDS, 3);
  return { scale: 1 + 0.22 * remaining, alpha: 0.95 - 0.25 * remaining };
}