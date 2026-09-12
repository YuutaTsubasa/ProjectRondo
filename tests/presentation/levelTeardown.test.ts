import { describe, expect, it, vi } from 'vitest';
import type { Scene } from '@babylonjs/core/scene';

import { disposeLevel, type LevelParts } from '../../src/presentation/babylon/levelTeardown';

/**
 * `createLevelSwap` builds the incoming level before disposing the outgoing one — `App.svelte` only
 * supplies the `build` and `commit` halves — so a rejected build is
 * wreckage nobody outside the builder has a handle to — and a failed tower entry is retryable, so it
 * repeats per attempt. This is the rule both builders' success and failure paths go through.
 *
 * Two things are pinned here and nothing else: that a partial level is torn down at whatever stage it
 * got to, and that the rig goes before the scene. The order is not cosmetic —
 * `PhysicsCharacterController.dispose()` releases its Havok query collectors through
 * `scene.getPhysicsEngine().getPhysicsPlugin()`, which a disposed scene no longer has, and
 * `havokModule.ts` caches that heap for the life of the page by design (spec §6).
 *
 * What is *not* pinned here, and must not be read into it: what happens when the rig itself rejects
 * halfway through being built. A builder assigns `parts.rig` from what `createCharacterRig` returns,
 * so that failure arrives at `disposeLevel` as the empty bag and the rig has already released its own
 * pieces. `characterRigTeardown.test.ts` covers that half, and it is the half the tower actually has.
 *
 * Fakes rather than a real `Scene`: what is being pinned is the call order this module chooses, and a
 * real scene would need an engine, a WebGL context and a Havok compile to say nothing extra about it.
 */
describe('disposeLevel', () => {
  const trace = () => {
    const calls: string[] = [];
    const scene = { dispose: vi.fn(() => void calls.push('scene')) } as unknown as Scene;
    const rig = { dispose: vi.fn(() => void calls.push('rig')) };
    const audio = { dispose: vi.fn(() => void calls.push('audio')) };
    return { calls, scene, rig, audio };
  };

  it('disposes the rig before the scene, so the controller still has a physics engine to release through', () => {
    const { calls, scene, rig, audio } = trace();

    disposeLevel(scene, { rig, audio });

    expect(calls).toEqual(['rig', 'audio', 'scene']);
  });

  it('disposes a build that failed before it reached the rig — the scene alone', () => {
    const { calls, scene } = trace();

    // Havok, the first await in either builder: the scene exists and nothing else does. The tower's
    // knight GLB arrives here too, having released its own rig on the way — see the case below.
    disposeLevel(scene, {});

    expect(calls).toEqual(['scene']);
  });

  it('disposes a build that failed after the rig was handed over, before the audio', () => {
    const { calls, scene, rig } = trace();

    // The hub's tree load, or a throw out of the tower's `buildTower`: the rig has been RETURNED and
    // is in the bag, and there is no audio graph yet.
    //
    // Not the knight's GLB, which is the failure this reads like and is not. That one rejects inside
    // `createCharacterRig`, before the builder can assign `parts.rig`, so it arrives here as the
    // empty bag above, having released its own pieces first — `characterRigTeardown.test.ts` is
    // where that half is pinned.
    disposeLevel(scene, { rig });

    expect(calls).toEqual(['rig', 'scene']);
  });

  it('tears down the same pieces however many times a retry rebuilds them', () => {
    // A failed entry leaves the player on the pedestal, so they can step off and step back on. Each
    // attempt is a fresh scene and a fresh rig, and each one has to go.
    const attempts = [trace(), trace(), trace()];
    for (const { scene, rig } of attempts) {
      const parts: LevelParts = { rig };
      disposeLevel(scene, parts);
    }

    for (const { calls } of attempts) expect(calls).toEqual(['rig', 'scene']);
  });
});
