import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

import type { FollowCamera } from '../../src/presentation/babylon/followCamera';
import type { InputState } from '../../src/presentation/babylon/input';
import type { Crystals } from '../../src/presentation/babylon/crystals';

// Hoisted, because `vi.mock`'s factory is lifted above the imports.
const { controllerDispose, ControllerStub } = vi.hoisted(() => {
  const controllerDispose = vi.fn();
  class ControllerStub {
    dispose = controllerDispose;
  }
  return { controllerDispose, ControllerStub };
});
vi.mock('@babylonjs/core/Physics/v2/characterController', () => ({
  PhysicsCharacterController: ControllerStub,
  CharacterSupportedState: { UNSUPPORTED: 0, SLIDING: 1, SUPPORTED: 2 },
}));
// The reticle builds a plane, a dynamic texture and a material; none of that is what is under test.
vi.mock('../../src/presentation/babylon/homingReticle', () => ({
  createHomingReticle: () => ({ showAt: vi.fn(), hide: vi.fn() }),
}));

/**
 * `scene.dispose()` reaches the character controller's `CCTransformNode` and its `PhysicsBody`
 * through the physics-body dispose observer, but nothing in the scene graph points at the
 * `PhysicsCharacterController` itself — so its `PhysicsShapeCapsule` and its two
 * `HP_QueryCollector_Create(16)` handles stayed in the Havok WASM heap, which `havokModule.ts` keeps
 * for the life of the page by design (spec §6). One hub ⇄ tower round trip leaked a set; nothing
 * bounded how many.
 *
 * Stubs, not a real controller: the real one needs a compiled Havok module and a live physics plugin
 * to construct at all, and what is being pinned is only that `createPlayer` hands out a way to
 * release it and that the per-frame observer goes with it.
 */
describe('createPlayer().dispose', () => {
  const previousWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    controllerDispose.mockClear();
    // `devHandles.ts` writes `window.moveConfig` / `window.charController` in a dev build, and this
    // suite runs in the node environment, where there is no window to write to.
    (globalThis as { window?: unknown }).window = {};
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = previousWindow;
  });

  const build = async () => {
    const { createPlayer } = await import('../../src/presentation/babylon/playerController');
    const add = vi.fn();
    const removeCallback = vi.fn();
    const scene = {
      onBeforeRenderObservable: { add, removeCallback },
      onDisposeObservable: { addOnce: vi.fn() },
    } as unknown as Scene;
    const root = { position: new Vector3(), rotation: new Vector3() } as unknown as TransformNode;
    const player = createPlayer(
      scene,
      root,
      {} as unknown as FollowCamera,
      {} as unknown as InputState,
      { positions: [] } as unknown as Crystals,
      new Vector3(0, 1, 0),
    );
    return { player, add, removeCallback };
  };

  it('releases the Havok character controller', async () => {
    const { player } = await build();

    expect(controllerDispose).not.toHaveBeenCalled();
    player.dispose();

    expect(controllerDispose).toHaveBeenCalledTimes(1);
  });

  it('takes its per-frame observer off the scene, and the same function it put on', async () => {
    const { player, add, removeCallback } = await build();

    expect(add).toHaveBeenCalledTimes(1);
    player.dispose();

    // Not merely "something was removed": a released controller left registered would be handed to
    // `checkSupport` and `integrate` on the next frame the scene renders.
    expect(removeCallback).toHaveBeenCalledWith(add.mock.calls[0][0]);
  });
});
