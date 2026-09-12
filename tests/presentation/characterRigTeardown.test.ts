import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';

import type { CharacterRigOptions } from '../../src/presentation/babylon/characterRig';
import type { Crystals } from '../../src/presentation/babylon/crystals';
import type { Shadows } from '../../src/presentation/babylon/shadows';

/**
 * The half of the rejected-build teardown that `levelTeardown.test.ts` cannot reach.
 *
 * A level fills its `LevelParts` bag from what `createCharacterRig` *returns*, so a rig that rejects
 * partway through being built never reaches `parts.rig` — `disposeLevel` would dispose the scene and
 * nothing else. That is not a corner case: the input listeners, the camera and the character
 * controller are all made before `await loadKnight`, and for the tower the knight's GLB is the only
 * rejection left at all, because `loadHavok` is compiled once for the page and has already resolved
 * from the hub's build (spec §6). It is the retryable failed tower entry the whole teardown exists
 * for.
 *
 * What that leaks if the rig does not release itself is six DOM listeners — inert, because the rig is
 * born suspended, but attached — and the `PhysicsCharacterController`'s `PhysicsShapeCapsule` and two
 * `HP_QueryCollector_Create(16)` handles, *unrecoverably*: the controller releases those through
 * `scene.getPhysicsEngine().getPhysicsPlugin()`, and by the time the level's own `catch` has run the
 * scene is gone. So the release has to happen here, before the throw leaves this function.
 *
 * Stubs for all four pieces, for `playerDispose.test.ts`'s reason: a real follow camera needs a
 * canvas, a real player needs a compiled Havok module and a live physics plugin, and a real knight
 * needs a GLB over the network. What is being pinned is which pieces are released and in what order,
 * and none of those four say anything about that.
 */
const { calls, loadKnight } = vi.hoisted(() => ({
  calls: [] as string[],
  loadKnight: vi.fn(),
}));

// The rig's `root`. Real `TransformNode` construction registers with the scene, and this suite's
// scene is an object literal; nothing here reads the node back. It carries a `position` only because
// the rig seeds the spawn into it before the camera binds — what that seed is *for* is pinned in
// `rigSpawnFrame.test.ts`, on a real node and a real camera.
vi.mock('@babylonjs/core/Meshes/transformNode', () => ({
  TransformNode: class { position = { copyFrom: vi.fn() }; },
}));

vi.mock('../../src/presentation/babylon/input', () => ({
  createInput: () => ({
    setEnabled: vi.fn(),
    dispose: () => void calls.push('input'),
  }),
}));

vi.mock('../../src/presentation/babylon/followCamera', () => ({
  createFollowCamera: () => ({
    camera: {},
    setEnabled: vi.fn(),
    dispose: () => void calls.push('follow'),
  }),
}));

vi.mock('../../src/presentation/babylon/playerController', () => ({
  createPlayer: () => ({
    motion: { velocity: new Vector3(), homing: null },
    airborne: false,
    homingEntrySeconds: 0,
    homingBounced: false,
    config: { maxSpeed: 4, runSpeed: 8, jumpSpeed: 9, gravity: 25 },
    dispose: () => void calls.push('player'),
  }),
}));

vi.mock('../../src/presentation/babylon/knight', () => ({
  loadKnight,
  // Both of the knight's frame-loop subscriptions hand back an unsubscribe, and the rig releases
  // them; these record that they were called, in the order they were.
  driveKnightAnimation: vi.fn(() => () => { calls.push('animation'); }),
}));

import { createCharacterRig } from '../../src/presentation/babylon/characterRig';

describe('createCharacterRig teardown', () => {
  const sceneDispose = vi.fn();

  beforeEach(() => {
    calls.length = 0;
    sceneDispose.mockClear();
    loadKnight.mockReset();
  });

  const scene = () => ({ activeCamera: null, dispose: sceneDispose }) as unknown as Scene;

  const options = (): CharacterRigOptions => ({
    canvas: {} as HTMLCanvasElement,
    makeShadows: () => ({}) as Shadows,
    groundHeight: () => 0,
    spawn: new Vector3(0, 1, 0),
    crystals: { positions: [] } as unknown as Crystals,
    descentFollow: false,
  });

  /** The tower's one remaining rejection: the knight's GLB, after all three pieces exist. */
  const failingBuild = (reason: unknown) => {
    loadKnight.mockRejectedValueOnce(reason);
    return createCharacterRig(scene(), options());
  };

  it('releases the input, the camera and the controller when the knight GLB rejects', async () => {
    const boom = new Error('404 /models/knight.glb');

    await expect(failingBuild(boom)).rejects.toBe(boom);

    // All three, and in the order a finished rig's `dispose()` uses — they go through one function.
    expect(calls).toEqual(['input', 'follow', 'player']);
  });

  it('leaves the scene to the level, which is what lets the controller release its Havok handles', async () => {
    await expect(failingBuild(new Error('nope'))).rejects.toThrow();

    // The counterfactual matters here: if the rig disposed the scene itself it would be disposing it
    // *before* the level's `catch` runs, and `PhysicsCharacterController.dispose()` reaches for
    // `scene.getPhysicsEngine().getPhysicsPlugin()`. The level disposes it, after this.
    expect(sceneDispose).not.toHaveBeenCalled();
  });

  it('releases once per attempt, however many times a failed entry is retried', async () => {
    // Step off the pedestal, step back on. Each attempt builds a fresh camera, a fresh set of
    // listeners and a fresh controller, so each attempt has its own three to release.
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(failingBuild(new Error(`attempt ${attempt}`))).rejects.toThrow();
    }

    expect(calls).toEqual([
      'input', 'follow', 'player',
      'input', 'follow', 'player',
      'input', 'follow', 'player',
    ]);
  });

  it('releases nothing on a build that finishes', async () => {
    loadKnight.mockResolvedValueOnce({ release: () => { calls.push('knight'); } });

    const rig = await createCharacterRig(scene(), options());

    // A rig that released its own pieces on the way out would hand the level a dead camera and a
    // disposed controller — the failure path is the only one that releases early.
    expect(calls).toEqual([]);

    rig.dispose();
    // The two frame-loop subscriptions first: both of them read pieces released after them (the
    // animation observer reads `player.motion`, the foot plant reads the player root), so a frame
    // that ran between the two halves of this list would read a disposed controller.
    expect(calls).toEqual(['animation', 'knight', 'input', 'follow', 'player']);
  });
});
