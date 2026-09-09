import { describe, expect, it, vi } from 'vitest';
import type { Scene } from '@babylonjs/core/scene';

import { disposeLevel, type LevelParts } from '../../src/presentation/babylon/levelTeardown';

/**
 * `App.svelte` builds the incoming level before disposing the outgoing one, so a rejected build is
 * wreckage nobody outside the builder has a handle to — and a failed tower entry is retryable, so it
 * repeats per attempt. This is the rule both builders' success and failure paths go through.
 *
 * Two things are pinned here and nothing else: that a partial level is torn down at whatever stage it
 * got to, and that the rig goes before the scene. The order is not cosmetic —
 * `PhysicsCharacterController.dispose()` releases its Havok query collectors through
 * `scene.getPhysicsEngine().getPhysicsPlugin()`, which a disposed scene no longer has, and
 * `havokModule.ts` caches that heap for the life of the page by design (spec §6).
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

    // Havok, the first await in either builder: the scene exists and nothing else does.
    disposeLevel(scene, {});

    expect(calls).toEqual(['scene']);
  });

  it('disposes a build that failed between the rig and the audio', () => {
    const { calls, scene, rig } = trace();

    // The knight's GLB, or one of the hub's tree assets: a rig with listeners on the window and a
    // Havok character controller, and no audio graph yet.
    disposeLevel(scene, { rig });

    expect(calls).toEqual(['rig', 'scene']);
  });

  it('tears down the same pieces however many times a retry rebuilds them', () => {
    // A failed entry leaves the player on the pedestal, so they can step off and step back on. Each
    // attempt is a fresh scene and a fresh controller, and each one has to go.
    const attempts = [trace(), trace(), trace()];
    for (const { scene, rig } of attempts) {
      const parts: LevelParts = { rig };
      disposeLevel(scene, parts);
    }

    for (const { calls } of attempts) expect(calls).toEqual(['rig', 'scene']);
  });
});
