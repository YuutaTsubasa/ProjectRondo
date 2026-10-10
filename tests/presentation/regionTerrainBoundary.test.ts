// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { createRegionTerrain } from '../../src/presentation/region/regionTerrain';
import { REGION_BOUNDS, REGION_TOWN_EDGE_Z } from '../../src/domain/region/regionLayout';

// Moving the town edge must move the seam, without shifting the far end of the meadow.
vi.mock('../../src/domain/town/townLayout', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/domain/town/townLayout')>();
  return { ...original, TOWN_BOUNDS: { ...original.TOWN_BOUNDS, minZ: -59 } };
});
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate', () => ({ PhysicsAggregate: class {} }));

it('keeps terrain ends aligned with the region and town after the town boundary changes', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const { ground } = createRegionTerrain(scene);
    const box = ground.getBoundingInfo().boundingBox;
    expect(REGION_TOWN_EDGE_Z).toBe(-59);
    expect(box.minimum.z).toBeCloseTo(REGION_BOUNDS.minZ, 4);
    expect(box.maximum.z).toBeCloseTo(REGION_TOWN_EDGE_Z, 4);
  } finally { scene.dispose(); engine.dispose(); }
});
