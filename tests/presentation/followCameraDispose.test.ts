// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

import { createFollowCamera } from '../../src/presentation/babylon/followCamera';
import { unknownGround } from '../../src/presentation/babylon/groundHeight';

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const release of mounted.splice(0)) release();
});

const build = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  mounted.push(() => { scene.dispose(); engine.dispose(); });
  const target = new TransformNode('player', scene);
  const canvas = document.createElement('canvas');
  const follow = createFollowCamera(scene, target, canvas, unknownGround, false);
  return { scene, target, follow };
};

/**
 * The camera places itself from `onBeforeRenderObservable`. Nothing today runs a frame between
 * `follow.dispose()` and the scene going down — `releaseRig` calls them back to back, and `place`'s
 * inputs (the player root, and `groundHeight`, a closure) both outlive `player.dispose()` anyway — so
 * this is not a live crash. It is teardown completeness: a subscription with no handle can never be
 * removed by anything, so `dispose()` would not be a full release and any future caller that takes
 * the camera down without the scene would keep placing one that is gone. `characterRig.ts` states
 * the same standard for its own ordering — right today, written so it stays right if a frame ever
 * does run in that window.
 *
 * `playerDispose.test.ts` pins the same property for the player's observer. This is its
 * counterpart, and without it deleting the removal leaves every suite green:
 * `characterRigTeardown.test.ts` mocks this module away, and `followCameraObserver.test.ts` —
 * the one suite that builds a real camera — releases its mounts through the scene without ever
 * calling `follow.dispose()`.
 */
describe('createFollowCamera().dispose', () => {
  it('takes its per-frame observer off the scene', async () => {
    const { scene, follow } = build();
    const before = scene.onBeforeRenderObservable.observers.length;
    expect(before).toBeGreaterThan(0);

    follow.dispose();
    // `Observable.remove` marks the observer and splices it on a `setTimeout(…, 0)`, so the array is
    // read after that turn rather than straight after `dispose`. The marking is what stops it firing
    // in the meantime, which is what the next test measures.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scene.onBeforeRenderObservable.observers.length).toBe(before - 1);
  });

  it('stops placing the camera once disposed', () => {
    const { scene, target, follow } = build();
    scene.render();
    const placed = follow.camera.position.clone();

    follow.dispose();
    // The move a live subscription would follow. Nothing else in this scene writes the camera, so an
    // unchanged position after a render is the observer being gone rather than the ease being slow.
    target.position.set(50, 0, 50);
    scene.render();

    expect(follow.camera.position.equals(placed)).toBe(true);
  });
});
