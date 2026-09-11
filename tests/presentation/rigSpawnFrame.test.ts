// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

import type { FollowCameraConfig } from '../../src/presentation/babylon/followCamera';
import type { Crystals } from '../../src/presentation/babylon/crystals';
import type { Shadows } from '../../src/presentation/babylon/shadows';

/**
 * The level's FIRST frame, framed on the spawn rather than on the world origin.
 *
 * `createCharacterRig` builds the camera immediately after the root and before the player, so the
 * camera's observer is the first of the frame's and it seeds its vertical follow from whatever the
 * root holds at that moment. Nothing else writes the root until the player's observer, one
 * registration later — so a root left where `new TransformNode` puts it hands the camera `(0, 0, 0)`
 * for the one frame that opens a level, and the follow then eases from there to the spawn at
 * `verticalSmoothing`. The hub's original spawn was the origin and hid it; the tower's is not.
 *
 * Real `Scene`, real `TransformNode` and the real `createFollowCamera` on `NullEngine`, for
 * `followCameraObserver.test.ts`'s reason — the wiring between the rig's construction order and the
 * camera's seed is the whole subject, and a stubbed camera would agree with any order at all. The
 * player and the knight are stubbed because they are the two pieces this environment cannot build (a
 * Havok character controller and a GLB over the network), and stubbing the player is also what makes
 * the defect legible: a player that never writes the root leaves the camera showing exactly what it
 * was seeded with, on every frame instead of only on the first.
 */
const FPS = 60;
const DT = 1 / FPS;

const { loadKnight, driveKnightAnimation } = vi.hoisted(() => ({
  loadKnight: vi.fn(async () => ({ release: vi.fn() })),
  driveKnightAnimation: vi.fn(() => vi.fn()),
}));

vi.mock('../../src/presentation/babylon/knight', () => ({
  loadKnight,
  driveKnightAnimation,
}));

vi.mock('../../src/presentation/babylon/playerController', () => ({
  // Takes the rig's `root` and hands it back the way the real one does, and writes it never — see
  // this file's header for why that is the point rather than a shortcut.
  createPlayer: (_scene: unknown, root: unknown) => ({
    root,
    motion: { velocity: new Vector3(), homing: null },
    airborne: false,
    homingEntrySeconds: null,
    homingBounced: false,
    config: { maxSpeed: 4, runSpeed: 8, jumpSpeed: 9, gravity: 24 },
    dispose: vi.fn(),
  }),
}));

import { createCharacterRig } from '../../src/presentation/babylon/characterRig';

/** The tower's opening position in spirit: off the origin on all three axes and high above the floor,
 *  so a camera seeded at `(0, 0, 0)` is nowhere near it and the difference cannot be a tolerance. */
const SPAWN = new Vector3(-4.9, 43.2, 8.1);

/**
 * Where the camera puts itself for an anchor at `p`, built in the camera's own order
 * (`anchor + orbit offset`, then the height) so the two agree bit for bit and a correctly seeded
 * first frame can be asserted as an identity. Yaw starts at zero, so the orbit offset is in +Z alone.
 */
const cameraFor = (p: Vector3, c: FollowCameraConfig) => new Vector3(
  p.x,
  p.y + Math.sin(-c.initialPitch) * c.distance + c.height,
  p.z + Math.cos(c.initialPitch) * c.distance,
);

const mounted: Array<() => void> = [];

async function mountRig() {
  const engine = new NullEngine();
  // Pinned rather than sampled, for `followCameraObserver.test.ts`'s reason: a synchronous render
  // burst reports a ~0 ms delta, and a zero delta takes the camera's seed branch on every frame,
  // which would hide an ease behind a permanent re-seed.
  engine.getDeltaTime = () => DT * 1000;
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const rig = await createCharacterRig(scene, {
    canvas: document.createElement('canvas'),
    makeShadows: () => ({}) as Shadows,
    // Null everywhere: the tower's answer, and it keeps both the grounded anchor and the camera's
    // ground clearance out of a test that is about the seed.
    groundHeight: () => null,
    spawn: SPAWN,
    crystals: { positions: [] } as unknown as Crystals,
    descentFollow: true,
  });
  const config = (window as unknown as { cameraConfig: FollowCameraConfig }).cameraConfig;
  // The rig before the scene, which is `levelTeardown.ts`'s order for the reason it gives there.
  mounted.push(() => { rig.dispose(); scene.dispose(); engine.dispose(); });
  return { scene, rig, config, frame: () => scene.render() };
}

afterEach(() => {
  for (const release of mounted.splice(0)) release();
});

describe('the first frame of a level', () => {
  it('frames the camera on the spawn, not on the world origin', async () => {
    const { rig, config, frame } = await mountRig();

    frame();

    // An identity, not a tolerance — the camera is placed from the spawn on this frame and has
    // nothing to ease toward.
    const want = cameraFor(SPAWN, config);
    expect(rig.follow.camera.position.x).toBeCloseTo(want.x, 4);
    expect(rig.follow.camera.position.y).toBeCloseTo(want.y, 4);
    expect(rig.follow.camera.position.z).toBeCloseTo(want.z, 4);
  });

  it('does not glide in from the origin over the frames after it', async () => {
    const { rig, config, frame } = await mountRig();
    frame();
    const opened = rig.follow.camera.position.clone();

    // Nothing moves the target here, so a camera that opened on the spawn cannot move either. A
    // camera that opened at the origin would be climbing 43.2 u at `verticalSmoothing` 9 across
    // exactly these frames, which is the defect this pins: it reaches half the height by frame 5 and
    // is still short of it at 60.
    for (let i = 0; i < 60; i++) {
      frame();
      expect(rig.follow.camera.position.equals(opened)).toBe(true);
    }
    // ...and the place it held all the way through is the spawn, not merely somewhere stable.
    expect(opened.y).toBeCloseTo(cameraFor(SPAWN, config).y, 4);
  });

  it('hands the camera a root already at the spawn, before the first frame runs at all', async () => {
    const { rig } = await mountRig();

    // The seed the two tests above observe, read at its source: the rig's root carries the spawn from
    // construction, which is what makes the camera's first read of it right whichever observer order
    // a level ends up with. Read back through the world matrix, which is a `Float32Array`, so this is
    // the destination to single precision rather than the identity the `Vector3` went in as.
    const at = rig.player.root.getAbsolutePosition();
    expect(Vector3.Distance(at, SPAWN)).toBeLessThan(1e-5);
  });
});
