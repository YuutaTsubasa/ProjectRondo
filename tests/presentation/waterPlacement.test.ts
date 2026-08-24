import { describe, it, expect } from 'vitest';
import { POND } from '../../src/domain/hub/waterBody';
import { terrainHeight } from '../../src/presentation/babylon/terrainHeight';

/** Samples the terrain on a 1-unit grid inside `radius` of the pond centre. */
function sampleDisc(radius: number): { x: number; z: number; y: number }[] {
  const cells: { x: number; z: number; y: number }[] = [];
  for (let dx = -radius; dx <= radius; dx += 1)
    for (let dz = -radius; dz <= radius; dz += 1) {
      if (Math.hypot(dx, dz) > radius) continue;
      const x = POND.centreX + dx;
      const z = POND.centreZ + dz;
      cells.push({ x, z, y: terrainHeight(x, z) });
    }
  return cells;
}

describe('pond placement', () => {
  it('sits over a basin — the centre is below the water surface', () => {
    expect(terrainHeight(POND.centreX, POND.centreZ)).toBeLessThan(POND.surfaceY);
  });

  it('floods a pool broad enough to read as water, not a puddle', () => {
    const submerged = sampleDisc(POND.radius).filter((c) => c.y < POND.surfaceY);
    // area = pi*r^2, so a >=6-unit-radius pool needs >=113 one-unit cells
    expect(submerged.length).toBeGreaterThanOrEqual(113);
  });

  it('is shallow enough to wade rather than swim', () => {
    const floor = Math.min(...sampleDisc(POND.radius).map((c) => c.y));
    expect(POND.surfaceY - floor).toBeLessThan(1.0);
  });

  it('has a shore — the disc is oversized, so its rim is dry land the bank can occlude', () => {
    const rim = sampleDisc(POND.radius).filter(
      (c) => Math.hypot(c.x - POND.centreX, c.z - POND.centreZ) > POND.radius - 1,
    );
    expect(rim.every((c) => c.y > POND.surfaceY)).toBe(true);
  });
});
