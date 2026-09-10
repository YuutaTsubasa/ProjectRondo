// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Animation } from '@babylonjs/core/Animations/animation';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { TrailMesh } from '@babylonjs/core/Meshes/trailMesh';

import {
  driveKnightAnimation,
  type Knight,
  type KnightMotionSample,
} from '../../src/presentation/babylon/knight';

/**
 * What the knight does while it is falling and the jump clip has run out — the half of the airborne
 * pose `jumpPose.test.ts` cannot see, because `stepJumpPose` gets the off-ground signal right and
 * this bug was entirely downstream of it.
 *
 * The clip is a one-shot retimed onto `KnightTuning.airtime`, and `airtime` is a **jump's**: `2 ·
 * jumpSpeed / gravity`, 0.75 s at the shipped 9 and 24. That is a fact about a jump the player asked
 * for, and it is the one thing an uncommanded fall does not have — the tower's run 0.45 s to 1.250 s
 * (design spec §14.3). So the segment ended in mid-air and locomotion took the pose back for the rest
 * of the descent; with `FALL_GRACE_SECONDS`' 0.2 s debounce at the front of it, a fall read as playing
 * no animation at all.
 *
 * These run `driveKnightAnimation` itself, on a real `NullEngine` scene with real `AnimationGroup`s,
 * because the failure is not in any expression that could be pulled out and called: it is a clip
 * running out *while the frames keep coming*, which needs a clock. Both clocks here are pinned rather
 * than sampled — a synchronous render burst reports a ~0 ms delta, the reason
 * `followCameraObserver.test.ts` pins its own — and they are pinned to the same value, which is
 * Babylon's own {@link STEP_MS}: `Scene.useConstantAnimationDeltaTime` is what drives the clips, and
 * `Engine.getDeltaTime` is what drives the pose blend, and a test in which the two disagreed would
 * be measuring their difference.
 *
 * The clips are five two-key `AnimationGroup`s rather than the shipped GLB's: a test process has no
 * GLB, and what is asked of them is whether they are *playing*, which is Babylon's own bookkeeping
 * and not the knight's mocap. Their lengths are the real ones, so `frameAtSeconds` maps onto the same
 * ranges the runtime uses and the retime arithmetic is the real arithmetic.
 */

/** Babylon's constant animation step, in ms — `Scene.useConstantAnimationDeltaTime`'s fixed 16.0. A
 *  "step" below is therefore 16 ms and not the 60 fps frame the design spec counts in, so every
 *  duration here is written in seconds and converted. */
const STEP_MS = 16;
const steps = (seconds: number) => Math.ceil((seconds * 1000) / STEP_MS);

/** `characterRig.ts`: `(2 · jumpSpeed) / gravity`, at `movementConstants.ts`'s 9 and 24. */
const AIRTIME = 0.75;
/** The longest fall the tower's checkpoint spacing allows — off the summit balcony, spec §14.3. */
const SUMMIT_FALL_SECONDS = 1.25;
/** The shipped Jump clip's own length. */
const JUMP_CLIP_SECONDS = 2.167;

interface Rig {
  readonly knight: Knight;
  readonly motion: { -readonly [K in keyof KnightMotionSample]: KnightMotionSample[K] };
  step(): void;
  run(seconds: number): void;
  /** Which locomotion clips are driving bones now. Empty means the airborne pose still owns them. */
  locomotion(): string[];
}

function clip(scene: Scene, name: string, seconds: number): AnimationGroup {
  const target = new TransformNode(`${name}Target`, scene);
  const animation = new Animation(
    `${name}Animation`, 'position.y', 60,
    Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
  animation.setKeys([{ frame: 0, value: 0 }, { frame: seconds * 60, value: 1 }]);
  const group = new AnimationGroup(name, scene);
  group.addTargetedAnimation(animation, target);
  return group;
}

function mount(): Rig {
  const engine = new NullEngine();
  engine.getDeltaTime = () => STEP_MS;
  const scene = new Scene(engine);
  scene.useConstantAnimationDeltaTime = true;
  scene.activeCamera = new TargetCamera('cam', new Vector3(0, 0, -10), scene);

  const animations = {
    idle: clip(scene, 'idle', 2), walk: clip(scene, 'walk', 1), run: clip(scene, 'run', 0.8),
    jump: clip(scene, 'jump', JUMP_CLIP_SECONDS), kick: clip(scene, 'kick', 1.5),
  };
  const knight: Knight = {
    animations,
    planted: 1,
    trail: new TrailMesh('trail', new TransformNode('trailGen', scene), scene, 0.1, 10, false),
  };

  const motion = {
    planarSpeed: 8, airborne: false, homing: false, homingEntrySeconds: null, bounced: false,
  };
  driveKnightAnimation(scene, knight, () => motion, () => ({ walk: 4, run: 8, airtime: AIRTIME }));

  return {
    knight, motion,
    step: () => scene.render(),
    run: (seconds) => { for (let i = 0; i < steps(seconds); i++) scene.render(); },
    locomotion: () => (['idle', 'walk', 'run'] as const).filter((k) => animations[k].isPlaying),
  };
}

/** At full running speed on the ground, with the run clip owning the pose — the state a fall starts
 *  from, and the one the knight snapped back to in mid-air. */
function running(): Rig {
  const rig = mount();
  rig.run(1);
  expect(rig.locomotion()).toEqual(['run']);
  return rig;
}

describe('the airborne pose over a fall longer than a jump', () => {
  it('is still held once the retimed segment has run out', () => {
    const rig = running();
    rig.motion.airborne = true;
    rig.run(SUMMIT_FALL_SECONDS);

    // The segment is long over — this is the stretch of the fall the bug lived in, not a clip still
    // running.
    expect(rig.knight.animations.jump.isPlaying).toBe(false);
    // And nothing has taken the pose back: a locomotion clip at weight 0 is stopped and writes no
    // bones, so what the skeleton holds is the last values the segment wrote.
    expect(rig.locomotion()).toEqual([]);
  });

  it('holds it for a fall of any length, not for some margin past the segment', () => {
    const rig = running();
    rig.motion.airborne = true;
    // Four times the longest fall the tower can produce. Nothing in the hold is a countdown.
    rig.run(SUMMIT_FALL_SECONDS * 4);
    expect(rig.locomotion()).toEqual([]);
  });

  it('gives the pose back at touchdown, and there only', () => {
    const rig = running();
    rig.motion.airborne = true;
    rig.run(SUMMIT_FALL_SECONDS);
    expect(rig.locomotion()).toEqual([]);

    rig.motion.airborne = false;
    rig.run(1);
    expect(rig.locomotion()).toEqual(['run']);
  });
});

describe('the retime a jump is built on', () => {
  it('runs the segment for the airtime it is handed', () => {
    // This is what makes a *jump* indifferent to the hold above, and it is the whole of the claim
    // that the hub is unaffected: `airtime` is how long the capsule is off the ground on flat
    // ground, so the segment ends as the character lands and the hold has no frames to cover. Only a
    // descent that outlasts `airtime` — one the player did not launch — ever reaches it.
    const rig = running();
    rig.motion.airborne = true;
    let elapsed = 0;
    do {
      rig.step();
      elapsed += STEP_MS / 1000;
    } while (rig.knight.animations.jump.isPlaying && elapsed < 10);

    // Two of those steps are Babylon starting the group rather than playing it: the launch cue fires
    // in `onBeforeRenderObservable`, which is after that step's `scene.animate()`, and the step after
    // it is the one the animatable primes its delay offset on. Take those off and what is left is
    // the segment's own advance, which is `airtime` to within the step it finishes inside.
    const advancing = elapsed - (2 * STEP_MS) / 1000;
    expect(Math.abs(advancing - AIRTIME)).toBeLessThanOrEqual(STEP_MS / 1000);
  });
});
