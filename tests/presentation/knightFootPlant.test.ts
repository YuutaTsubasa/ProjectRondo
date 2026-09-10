// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';

import { plantFeet } from '../../src/presentation/babylon/knight';
import { unknownGround, type GroundHeight } from '../../src/presentation/babylon/groundHeight';
import { terrainHeight } from '../../src/presentation/babylon/terrainHeight';
import { CAPSULE_HALF } from '../../src/presentation/babylon/capsule';

/**
 * The foot plant, run for real, against the case that had no test and shipped a visible bug: the
 * knight drawn down on the tower's floor while its capsule stood on a platform 20 or 40 u up.
 *
 * **The rule these hold** is the one the bug broke and nothing else states: *a frame the ground probe
 * cannot answer moves the plant not at all.* The knight is parented to the capsule root, so its local
 * Y is exactly its disagreement with the capsule, and the assertion is that such a frame leaves that
 * number alone — exactly, not within a tolerance.
 *
 * It is stated that way because the obvious looser form does not carry its own weight. "Never
 * disagrees with the capsule by more than the character's own height" sounds like the rule, and is
 * nearly vacuous: the correction the plant legitimately makes is ~0.13 u, so a 1.9 u bound leaves
 * room for a fourteenfold error before it says anything. Restore the old behaviour and the bound
 * catches it at 18 u and above only because the numbers there are enormous; the exact comparison
 * catches it at every height the two answers actually differ at.
 *
 * They do not differ at one of them. The `standing on 0 u` row is the tower's floor, where "hold the
 * last correction" and "answer with the floor" are the same answer, so no assertion at that height
 * can tell them apart. It is in the table anyway, because it is the height at which the shipped bug
 * was invisible and the reason nothing looked wrong until the climb started.
 *
 * Why this shape and not a scripted level: `loadKnight` fetches a GLB and `createPlayer` needs a
 * compiled Havok module, neither of which a test process has, and neither says anything about the
 * correction. {@link plantFeet} takes the two nodes and the ground query and nothing else, and it is
 * the thing that got it wrong. The scene is real (`NullEngine`, a real `onBeforeRenderObservable`,
 * real `scene.render()` frames) and so is the probe inside it; what is faked is the one call the
 * probe makes into the physics engine, which is where "the ray missed" has to come from — Havok
 * cannot be asked for a miss it does not have a world to miss in.
 */

/** A capsule that has climbed: the tower's floor, then platforms at each section boundary and the
 *  summit balcony (`towerLevel.ts`'s 0 / 18 / 42 / 62, plus the 20 u mid-climb the owner reported
 *  from). The capsule's centre rides `CAPSULE_HALF` above whatever it stands on. */
const PLATFORM_TOPS = [0, 18, 20, 42, 62];

/** Where the seating in `loadKnight` left the root: feet at the capsule bottom. A non-zero value, so
 *  a plant that answered "0" rather than "unchanged" could not pass by coincidence. */
const SEATED_LOCAL_Y = 0.25;

interface Rig {
  readonly scene: Scene;
  readonly root: TransformNode;
  readonly capsule: TransformNode;
  readonly knight: { planted: number };
  /** What the next frame's ray reports: a height, or `null` for a miss. */
  hit: number | null;
  frame(): void;
  /** The knight's rendered offset from the capsule it is parented to — the disagreement itself. */
  drift(): number;
}

function mount(ground: GroundHeight, capsuleY: number): Rig {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new TargetCamera('cam', new Vector3(0, 0, -10), scene);
  scene.activeCamera = camera;

  const capsule = new TransformNode('player', scene);
  capsule.position.set(3, capsuleY + CAPSULE_HALF, -7);
  const root = new TransformNode('knight', scene);
  root.parent = capsule;
  root.position.y = SEATED_LOCAL_Y;

  const rig: Rig = {
    scene, root, capsule,
    knight: { planted: 1 },
    hit: null,
    frame: () => scene.render(),
    drift: () => root.position.y - SEATED_LOCAL_Y,
  };

  // The probe's only reach into the world. `raycastToRef` is the whole of the v2 physics engine it
  // uses, and a miss is a `PhysicsRaycastResult` with `hasHit` false — which is what `reset()` makes.
  const physics = {
    raycastToRef: (_from: Vector3, _to: Vector3, result: PhysicsRaycastResult) => {
      result.reset();
      if (rig.hit !== null) result.setHitData(new Vector3(0, 1, 0), new Vector3(3, rig.hit, -7));
    },
  };
  scene.getPhysicsEngine = () => physics as never;

  plantFeet(scene, root, capsule, rig.knight, SEATED_LOCAL_Y, ground);
  return rig;
}

describe('the foot plant against a world with no ground field', () => {
  it.each(PLATFORM_TOPS)('moves the plant not at all, standing on %d u', (top) => {
    const rig = mount(unknownGround, top);
    // Off the edge of the slab: the sole has passed the platform and the ray finds nothing within
    // its reach. The capsule is still supported, so the feet are still down — `planted` stays 1.
    rig.hit = null;
    rig.frame();

    // Answering with the tower's floor at 0 instead put the knight exactly `top` units below its own
    // capsule — which at the floor itself is nothing, and is why nothing looked wrong until the
    // climb started.
    expect(rig.drift()).toBe(0);
  });

  it('holds the plant it last measured rather than releasing it', () => {
    const rig = mount(unknownGround, 20);
    // On the slab: the capsule floats the measured tenth of a unit above what it stands on.
    rig.hit = 20 - 0.12;
    rig.frame();
    expect(rig.drift()).toBeCloseTo(-0.12, 6);

    // A stride later the sole is past the edge. Holding means this frame changes nothing at all.
    rig.hit = null;
    rig.frame();
    expect(rig.drift()).toBeCloseTo(-0.12, 6);
  });

  it('rides the capsule once the feet have left the ground', () => {
    const rig = mount(unknownGround, 42);
    rig.hit = null;
    rig.knight.planted = 0;
    rig.frame();
    // The fade owns the airborne case; the hold above must not outlive it. Exact, because this
    // branch writes `seatedLocalY` itself rather than computing its way back to it.
    expect(rig.drift()).toBe(0);
  });
});

describe('the foot plant against a world that answers everywhere', () => {
  /** The hub's own query, which is total: it returns a height for every (x, z) and never `null`. */
  const hub: GroundHeight = terrainHeight;

  it('still falls back to the height field when the ray misses', () => {
    const surface = hub(3, -7);
    expect(surface).not.toBeNull();
    // Stand the capsule where that height field says the ground is, then take the ray away — the
    // fallback this probe was written with, and the branch the tower's `null` must not disturb.
    const rig = mount(hub, surface as number);
    rig.hit = null;
    rig.frame();
    expect(rig.drift()).toBeCloseTo(0, 6);
  });

  it('applies the fade to a fallback answer exactly as it does to a hit', () => {
    const rig = mount(hub, (hub(3, -7) as number) + 0.3);
    rig.hit = null;
    rig.knight.planted = 0.5;
    rig.frame();
    // seatedLocalY − planted · (footY − surface): the arithmetic is untouched by this fix, and a
    // half-faded plant is what takeoff and landing ride.
    expect(rig.drift()).toBeCloseTo(-0.5 * 0.3, 6);
  });
});
