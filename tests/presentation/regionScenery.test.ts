import {CITY_LOOP,CITY_EXPLORATION_ROUTE} from '../../src/domain/town/townTerraces';
// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { createRegionScenery } from '../../src/presentation/region/regionScenery';
import { COURSE_ENTRANCE, COURSE_RETURN, REGION_INTERACTION_PLACES, REGION_PLACES, REGION_TRAILS, regionHeight } from '../../src/domain/region/regionLayout';
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate', () => ({ PhysicsAggregate: class {} }));
it('keeps interactions and every road clear of scenery colliders', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const scenery = createRegionScenery(scene);
    const isBlocked = (x: number, z: number) => scenery.cameraSolids.some(b => b.min.x < x + .65 && b.max.x > x - .65 && b.min.z < z + .65 && b.max.z > z - .65 && b.min.y < regionHeight(x, z) + 2.3 && b.max.y > regionHeight(x, z));
    for (const place of REGION_PLACES) expect(isBlocked(place.x, place.z)).toBe(false);
    for (const trail of [...REGION_TRAILS,CITY_LOOP,CITY_EXPLORATION_ROUTE]) for (let i = 1; i < trail.length; i++) {
      const [ax, az] = trail[i - 1], [bx, bz] = trail[i];
      for (let t = 0; t <= 1; t += .025) {
        const x=ax+(bx-ax)*t,z=az+(bz-az)*t;
        expect(isBlocked(x,z),`Road blocked at ${x}, ${z}`).toBe(false);
      }
    }
    expect(isBlocked(COURSE_RETURN.x, COURSE_RETURN.z)).toBe(false);
    for(let z=38;z<=46;z+=.5)expect(isBlocked(COURSE_ENTRANCE.x,z)).toBe(false);
    const entry=scene.getMeshByName('region-palace-entry-lintel')!;
    expect(entry.position.x).toBe(COURSE_ENTRANCE.x);expect(entry.position.z).toBe(COURSE_ENTRANCE.z);
    for(const target of REGION_INTERACTION_PLACES){
      const pole=scene.getMeshByName('region-beacon-base-'+target.id)!;
      expect([pole.position.x,pole.position.z]).toEqual([target.x,target.z]);
    }
    const beacon=scene.getMeshByName('region-place-course')!;
    expect(Math.hypot(beacon.position.x-COURSE_ENTRANCE.x,beacon.position.z-COURSE_ENTRANCE.z)).toBeLessThan(6);
    expect(scene.meshes.some(m=>m.name.startsWith('region-ruins-'))).toBe(false);
    const water = scene.getMeshByName('region-restored-water')!;
    expect(water.isEnabled()).toBe(false);
    scenery.setWaterRestored(true);
    expect(water.isEnabled()).toBe(true);
    scenery.setWaterRestored(false);
    expect(water.isEnabled()).toBe(false);
    expect(scene.meshes.filter(m => m.name.startsWith('region-place-'))).toHaveLength(REGION_PLACES.length);
  } finally { scene.dispose(); engine.dispose(); }
});
