// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { instantiateGuards } from '../../src/presentation/palace/palaceGuards';
import { createPalaceRun } from '../../src/domain/palace/palaceRun';
import { measureSkinnedSole } from '../../src/presentation/babylon/skinnedSole';
import type { Shadows } from '../../src/presentation/babylon/shadows';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(dispose => dispose()));
async function mount() {
  const engine = new NullEngine();
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  const container = await LoadAssetContainerAsync(readFileSync('public/palace/guard.glb'), scene, {
    pluginExtension: '.glb', pluginOptions: { gltf: { skipMaterials: true, animationStartMode: 0 } },
  });
  const shadows = { cast() {}, receive() {}, generator: { removeShadowCaster() {} } } as unknown as Shadows;
  const visual = instantiateGuards(container, scene, shadows);
  cleanup.push(() => { visual.dispose(); scene.dispose(); engine.dispose(); });
  const state = createPalaceRun(); visual.update(state);
  const guard = visual.guards[0];
  const node = (name: string) => guard.holder.getChildTransformNodes().find(n => n.name.endsWith(name))!;
  const position = (name: string) => { const n = node(name); n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
  const advance = (distance: number) => { state.guards[0].x += distance; state.elapsed += Math.abs(distance) / 1.6; visual.update(state); };
  return { visual, state, guard, node, position, advance };
}
it.each([1, -1] as const)('keeps the support boot planted while traveling in direction %s', async direction => {
  const { position, advance, state, visual } = await mount();
  state.guards[0].direction = direction; visual.update(state);
  const planted = position('DEF-foot.L');
  for (let i = 0; i < 7; i++) {
    advance(direction * .07);
    expect(position('DEF-foot.L').x).toBeCloseTo(planted.x, 3);
    expect(position('DEF-foot.L').y).toBeCloseTo(planted.y, 3);
  }
});
it('keeps a sole on the floor throughout a full walk cycle without backward knees', async () => {
  const { guard, state, position, advance } = await mount();
  for (let i = 0; i < 28; i++) {
    advance(.05);
    expect(Math.abs(measureSkinnedSole(guard.meshes) - state.guards[0].y)).toBeLessThan(.025);
    for (const side of ['L', 'R']) {
      const hip = position('DEF-thigh.' + side), knee = position('DEF-shin.' + side), ankle = position('DEF-foot.' + side);
      const along = (hip.x + ankle.x) / 2;
      expect(knee.x).toBeGreaterThan(along); // +X is the guard's forward direction.
    }
  }
});
it('uses distance rather than wall-clock playback and freezes defeated guards', async () => {
  const { guard, state, visual, position, advance } = await mount();
  expect(guard.run.isPlaying).toBeFalsy();
  advance(.2);
  const knee = position('DEF-shin.L');
  state.elapsed += 3; visual.update(state);
  expect(position('DEF-shin.L').asArray()).toEqual(knee.asArray());
  state.guards[0].defeated = true;
  visual.update(state);
  expect(guard.run.isPlaying).toBeFalsy();
});


it('returns to the same initial walk pose on reset and keeps each guard independent', async () => {
  const { guard, visual, state, advance, position } = await mount();
  const initial = position('DEF-foot.L');
  const other = visual.guards[1].holder.getChildTransformNodes().find(n => n.name.endsWith('DEF-shin.L'))!;
  const otherRotation = other.rotationQuaternion!.clone();
  advance(.4);
  expect(other.rotationQuaternion!.asArray()).toEqual(otherRotation.asArray());
  const reset = createPalaceRun(); visual.update(reset);
  expect(position('DEF-foot.L').x).toBeCloseTo(initial.x, 4);
  expect(position('DEF-foot.L').y).toBeCloseTo(initial.y, 4);
  expect(guard.holder.isEnabled()).toBe(true);
  state.guards[0].defeated = true; state.guards[0].defeatedFor = .6; visual.update(state);
  expect(guard.holder.isEnabled()).toBe(false);
  visual.update(reset);
  expect(guard.holder.isEnabled()).toBe(true);
});
it('swings each arm opposite its advancing leg', async () => {
  const { position } = await mount();
  expect(position('DEF-foot.L').x).toBeGreaterThan(position('DEF-foot.R').x);
  expect(position('DEF-hand.L').x).toBeLessThan(position('DEF-hand.R').x);
});
