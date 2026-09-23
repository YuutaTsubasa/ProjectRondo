// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { createPalaceScenery } from '../../src/presentation/palace/palaceScenery';
import { PALACE_LAYOUT } from '../../src/domain/palace/palaceLayout';
import { createPalaceRun } from '../../src/domain/palace/palaceRun';
import type { Shadows } from '../../src/presentation/babylon/shadows';

it('builds world-anchored architectural volumes instead of image backdrops and tile cards', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const scenery = createPalaceScenery(scene, { cast() {}, receive() {} } as unknown as Shadows);
    expect(scene.meshes.some(m => /palaceBackdrop|palaceTileFacing/.test(m.name))).toBe(false);
    expect(scene.textures.some(t => /white_palace_.*webp/.test(t.name))).toBe(false);
    const buildings = scene.meshes.filter(m => m.metadata?.palaceBuilding);
    expect(buildings.length).toBeGreaterThan(5);
    for (const mesh of buildings) {
      mesh.computeWorldMatrix(true);
      const size = mesh.getBoundingInfo().boundingBox.extendSizeWorld;
      expect(Math.min(size.x, size.y, size.z)).toBeGreaterThan(.01);
    }
    const before = buildings.map(m => m.getWorldMatrix().asArray().slice());
    scenery.update(createPalaceRun(), 170);
    buildings.forEach((m, i) => expect(m.computeWorldMatrix(true).asArray()).toEqual(before[i]));
    expect(scene.meshes.length).toBeLessThan(280);
  } finally { scene.dispose(); engine.dispose(); }
});

it('keeps every playable top aligned with the original collision and its jump gaps open', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    createPalaceScenery(scene, { cast() {}, receive() {} } as unknown as Shadows);
    for (const [i, platform] of PALACE_LAYOUT.platforms.entries()) {
      const mesh = scene.getMeshByName('palaceWalkable' + i)!;
      expect(mesh).not.toBeNull(); mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      expect(box.maximumWorld.y).toBeCloseTo(platform.y, 4);
      expect(box.minimumWorld.x).toBeCloseTo(platform.x, 4);
      expect(box.maximumWorld.x).toBeCloseTo(platform.x + platform.width, 4);
      expect(box.minimumWorld.z).toBeLessThan(-1);
      expect(box.maximumWorld.z).toBeGreaterThan(1);
    }
  } finally { scene.dispose(); engine.dispose(); }
});


it('renders solid collectible coins and checkpoint feedback once per newly reached checkpoint', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const scenery = createPalaceScenery(scene, { cast() {}, receive() {} } as unknown as Shadows);
    const run = createPalaceRun();
    const coin = scene.getMeshByName('palaceCoin0')!;
    coin.computeWorldMatrix(true);
    const centerRay = new Ray(new Vector3(coin.position.x, coin.position.y, 5), new Vector3(0, 0, -1), 10);
    expect(centerRay.intersectsMesh(coin).hit).toBe(true);
    scenery.update(run, 9);
    const pulse = scene.getMeshByName('palaceCheckpointPulse')!;
    expect(pulse).not.toBeNull(); expect(pulse.isEnabled()).toBe(false);
    run.checkpoint = 0; run.elapsed = 1; scenery.update(run, 50);
    expect(pulse.isEnabled()).toBe(true);
    expect(pulse.position.x).toBe(PALACE_LAYOUT.checkpoints[0]!.x);
    run.elapsed = 1.7; scenery.update(run, 50);
    expect(pulse.scaling.x).toBeGreaterThan(1);
    run.elapsed = 4; scenery.update(run, 50);
    expect(pulse.isEnabled()).toBe(false);
    expect(scene.getMeshByName('checkpointRing0')!.material!.name).toBe('palaceCheckpointActive');
    scenery.update(createPalaceRun(), 9);
    expect(scene.getMeshByName('checkpointRing0')!.material!.name).toBe('palaceCheckpointDormant');
    run.elapsed = 1; scenery.update(run, 50);
    expect(pulse.isEnabled()).toBe(true);
  } finally { scene.dispose(); engine.dispose(); }
});
