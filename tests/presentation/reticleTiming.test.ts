import { describe, expect, it } from 'vitest';
import { stepReticle, HIDDEN_RETICLE, reticleAppearance } from '../../src/presentation/babylon/reticleTiming';

const a = { x: 1, y: 2, z: 3 };
const b = { x: 4, y: 5, z: 6 };
describe('reticle acquisition', () => {
  it('settles while the same target is supplied every frame', () => {
    let state = stepReticle(HIDDEN_RETICLE, a, 0);
    const start = reticleAppearance(state);
    for (let i = 0; i < 60; i++) state = stepReticle(state, { ...a }, 1 / 60);
    expect(reticleAppearance(state).scale).toBeLessThan(start.scale);
    expect(reticleAppearance(state).scale).toBeCloseTo(1);
  });
  it('restarts the acquisition only when the target changes or is reacquired', () => {
    const settled = stepReticle(stepReticle(HIDDEN_RETICLE, a, 0), a, 1);
    const changed = stepReticle(settled, b, 0);
    expect(reticleAppearance(changed).scale).toBeGreaterThan(reticleAppearance(settled).scale);
    const hidden = stepReticle(settled, null, 0);
    expect(reticleAppearance(hidden).alpha).toBe(0);
    expect(reticleAppearance(stepReticle(hidden, a, 0))).toEqual(reticleAppearance(changed));
  });
  it('gives the same acquisition appearance at equal elapsed time across frame rates', () => {
    const at = (fps: number) => {
      let state = stepReticle(HIDDEN_RETICLE, a, 0);
      for (let i = 0; i < fps / 10; i++) state = stepReticle(state, a, 1 / fps);
      return reticleAppearance(state);
    };
    expect(at(30).scale).toBeCloseTo(at(120).scale, 10);
    expect(at(60).alpha).toBeCloseTo(at(120).alpha, 10);
  });
});