// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

import { createFollowCamera } from '../../src/presentation/babylon/followCamera';
import { unknownGround } from '../../src/presentation/babylon/groundHeight';

/**
 * The camera places itself from `onBeforeRenderObservable`, and `place` reads the target's absolute
 * position and the ground field — both of which a level swap releases. `releaseRig` takes the
 * frame-loop subscriptions off before releasing what they read; a subscription with no handle cannot
 * be taken off, so it would run over a released player root on any frame between `follow.dispose()`
 * and the scene going down.
 *
 * `playerDispose.test.ts` pins the same property for the player's observer and says why the "same
 * function it put on" half matters. This is its counterpart: without it, deleting the removal would
 * leave every suite green — `characterRigTeardown.test.ts` mocks this module away, and
 * `followCameraObserver.test.ts` releases its mounts through the scene without ever calling
 * `follow.dispose()`.
 */
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
