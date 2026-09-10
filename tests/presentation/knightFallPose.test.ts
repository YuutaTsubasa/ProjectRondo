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
 *
 * **All five write the same channel of the same node**, so what a frame renders there is the blend
 * itself, and a value belonging to no clip is a pose the knight cannot be in — which is the whole of
 * what the second suite below is about. Four of them are flat, one value apiece; the jump is a ramp
 * across its full length, so which *frame* of it is on the bones can be read off the value too, and
 * "the frame the segment ended on" is a claim a test can make rather than take on trust.
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
/** `movementConstants.ts`: the longest a dash runs before it gives up and drops the knight. */
const HOMING_MAX_DURATION = 0.6;

/** Where the jump segment ends — `knight.ts`'s `JUMP_FALL_END`, restated here because the test's
 *  claim is about that number and a test that imported it could not disagree with it. */
const JUMP_FALL_END = 1.3;
/** The flat value each of the other four clips writes. Far apart, and none of them a sum or an
 *  average of the others, so any mixture of two is visibly neither. */
const POSE = { idle: 10, walk: 20, run: 30, kick: 50 } as const;
/** The jump's ramp, over the clip's whole length. */
const JUMP_AT_FRAME_ZERO = 100;
const JUMP_AT_CLIP_END = 200;
/** What that ramp reads at {@link JUMP_FALL_END} — the last frame of the retimed segment, and so the
 *  pose every descent that outlasts the segment should be held in. */
const FALL_POSE = JUMP_AT_FRAME_ZERO
  + (JUMP_AT_CLIP_END - JUMP_AT_FRAME_ZERO) * (JUMP_FALL_END / JUMP_CLIP_SECONDS);

interface Rig {
  readonly knight: Knight;
  readonly motion: { -readonly [K in keyof KnightMotionSample]: KnightMotionSample[K] };
  step(): void;
  run(seconds: number): void;
  /** Which locomotion clips are driving bones now. Empty means the airborne pose still owns them. */
  locomotion(): string[];
  /** The blend on the shared channel this frame — the pose itself. */
  pose(): number;
  /** How many times the jump group has been started since the rig was mounted. */
  jumpStarts(): number;
}

function clip(
  bone: TransformNode, name: string, seconds: number, keys: readonly [number, number],
): AnimationGroup {
  const animation = new Animation(
    `${name}Animation`, 'position.y', 60,
    Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
  animation.setKeys([{ frame: 0, value: keys[0] }, { frame: seconds * 60, value: keys[1] }]);
  const group = new AnimationGroup(name, bone.getScene());
  group.addTargetedAnimation(animation, bone);
  return group;
}

function mount(): Rig {
  const engine = new NullEngine();
  engine.getDeltaTime = () => STEP_MS;
  const scene = new Scene(engine);
  scene.useConstantAnimationDeltaTime = true;
  scene.activeCamera = new TargetCamera('cam', new Vector3(0, 0, -10), scene);

  // The one channel every clip writes. Its starting value is the "rest pose" Babylon mixes in
  // whenever the weights on it sum to less than 1, and 0 is nothing any clip writes, so a frame that
  // let the weights fall short shows up as a value pulled toward zero rather than blending in
  // silently.
  const bone = new TransformNode('bone', scene);
  bone.position.y = 0;

  const flat = (name: keyof typeof POSE, seconds: number) =>
    clip(bone, name, seconds, [POSE[name], POSE[name]]);
  const animations = {
    idle: flat('idle', 2), walk: flat('walk', 1), run: flat('run', 0.8),
    jump: clip(bone, 'jump', JUMP_CLIP_SECONDS, [JUMP_AT_FRAME_ZERO, JUMP_AT_CLIP_END]),
    kick: flat('kick', 1.5),
  };
  const knight: Knight = {
    animations,
    planted: 1,
    trail: new TrailMesh('trail', new TransformNode('trailGen', scene), scene, 0.1, 10, false),
    // Nothing to release: this rig never runs `loadKnight`, so nothing put the seating pass or the
    // foot plant on this scene's frame loop. The animation observer is `driveKnightAnimation`'s own,
    // and it hands its unsubscribe back separately.
    release: () => {},
  };

  const motion = {
    planarSpeed: 8, airborne: false, homing: false, homingEntrySeconds: null, bounced: false,
  };
  driveKnightAnimation(scene, knight, () => motion, () => ({ walk: 4, run: 8, airtime: AIRTIME }));

  // Every `AnimationGroup.start()` on the jump, counted. The hold is a restart, so how many there
  // are is the difference between pinning a pose once and re-pinning it every frame for the length
  // of a fall.
  let jumpStarts = 0;
  animations.jump.onAnimationGroupPlayObservable.add(() => { jumpStarts += 1; });

  return {
    knight, motion,
    step: () => scene.render(),
    run: (seconds) => { for (let i = 0; i < steps(seconds); i++) scene.render(); },
    locomotion: () => (['idle', 'walk', 'run'] as const).filter((k) => animations[k].isPlaying),
    pose: () => bone.position.y,
    jumpStarts: () => jumpStarts,
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

    // The segment is long over — `SUMMIT_FALL_SECONDS` is two thirds again past `AIRTIME` — and
    // what is on the bones is the frame it ended on and no other.
    expect(rig.pose()).toBeCloseTo(FALL_POSE, 6);
    // And nothing has taken the pose back: a locomotion clip at weight 0 is stopped and writes no
    // bones.
    expect(rig.locomotion()).toEqual([]);
  });

  it('holds it for a fall of any length, not for some margin past the segment', () => {
    const rig = running();
    rig.motion.airborne = true;
    // Four times the longest fall the tower can produce. Nothing in the hold is a countdown.
    rig.run(SUMMIT_FALL_SECONDS * 4);
    expect(rig.locomotion()).toEqual([]);
    expect(rig.pose()).toBeCloseTo(FALL_POSE, 6);
  });

  it('gives the pose back at touchdown, and there only', () => {
    const rig = running();
    rig.motion.airborne = true;
    rig.run(SUMMIT_FALL_SECONDS);
    expect(rig.locomotion()).toEqual([]);

    rig.motion.airborne = false;
    rig.run(1);
    expect(rig.locomotion()).toEqual(['run']);
    expect(rig.pose()).toBeCloseTo(POSE.run, 6);
    // And the held frame is let go of on the ground, rather than sitting in the blend at weight 0
    // — a clip left playing at weight 0 still bleeds into the pose, which is the reason the
    // locomotion clips are stopped rather than zeroed.
    expect(rig.knight.animations.jump.isPlaying).toBe(false);
  });
});

describe('the retime a jump is built on', () => {
  it('runs the segment for the airtime it is handed', () => {
    // This is what makes a jump on **flat ground** indifferent to the hold above: the segment ends as
    // the character lands, and the hold has no frames to cover.
    //
    // It is not, as it was first written up, what makes the hub indifferent to it. `airtime` is the
    // *flat-ground* airtime — 0.375 s of rise and 1.6875 u of fall back to the height it left. Land
    // `h` below takeoff and the capsule is off the ground for `0.375 + √((1.6875 + h) / 12)`, which
    // is more than 0.75 s for every `h > 0`, so **every jump that lands downhill holds the final
    // frame for the difference**, and the hub is rolling terrain. The amount is bounded and small:
    // scanning `terrainHeight` on a 0.25 u grid over the walkable belt (`r ≤ 42`) gives 7.15 u of
    // relief and, between two walkable points one jump's 6 u reach apart, a largest gap of 3.15 u —
    // 1.010 s off the ground, so 0.260 s held. That is an improvement rather than a regression (a
    // quarter second of falling pose beats a quarter second of running in mid-air), but it is a
    // common path and not a tower-only one. Pure falls are the rare case: a fall needs a 10.83 u drop
    // before `FALL_GRACE_SECONDS` and `airtime` are used up, and the hub's whole relief buys 0.572 s.
    //
    // What marks the end of the segment is the pose reaching {@link FALL_POSE}, not the group
    // stopping: the group no longer stops off the ground, it is re-pinned on that same frame. The
    // ramp only reads `FALL_POSE` when the segment is at its last frame *and* carrying the whole
    // weight, and it approaches from below the whole way (everything it blends against here is
    // lower), so the first frame that reaches it is the frame the segment finished on.
    const rig = running();
    rig.motion.airborne = true;
    let elapsed = 0;
    do {
      rig.step();
      elapsed += STEP_MS / 1000;
    } while (rig.pose() < FALL_POSE - 1e-9 && elapsed < 10);

    // Two of those steps are Babylon starting the group rather than playing it: the launch cue fires
    // in `onBeforeRenderObservable`, which is after that step's `scene.animate()`, and the step after
    // it is the one the animatable primes its delay offset on. Take those off and what is left is
    // the segment's own advance, which is `airtime` to within the step it finishes inside.
    const advancing = elapsed - (2 * STEP_MS) / 1000;
    expect(Math.abs(advancing - AIRTIME)).toBeLessThanOrEqual(STEP_MS / 1000);
  });
});

/**
 * **Whatever pose is held off the ground is one clip's own frame, at full weight** — the rule the
 * hold above needs and did not have.
 *
 * A stopped `AnimationGroup` writes nothing at all, so a "held" pose is really whatever the last
 * *blend* left on the bones, and that is the clip's own frame only when the clip was the whole of
 * that blend. An ordinary fall meets the condition by luck: nothing else is playing. A homing dash
 * entered in mid-air does not. Its kick clip is retimed onto the dash and can outlive the jump
 * segment, the two cross-fade into one another, and whichever stopped last froze the bones part-way
 * through that fade — a value belonging to neither pose, held there for the rest of the descent, and
 * different for every entry timing. Measured on this rig before the fix: 67.6, 50.8 and 92.4, on a
 * scale where the kick's pose is 50 and the segment's last frame 159.99.
 *
 * Below are every way the knight can be off the ground with the segment spent under it. They assert
 * the *same number* in all of them, which is the point: what a descent is held in is not allowed to
 * depend on how the descent started.
 */
describe('the pose a descent is held in', () => {
  /** Runs a descent, then keeps rendering long past every clip and fade involved — the jump
   *  segment's 0.75 s, the kick's 0.6 s and two 0.1 s eases, several times over — and reports what
   *  is left on the bones. */
  function descent(enter: (rig: Rig) => void): number {
    const rig = running();
    enter(rig);
    rig.run(SUMMIT_FALL_SECONDS * 2);
    expect(rig.locomotion()).toEqual([]);
    return rig.pose();
  }

  /** Walked off an edge: the segment starts, runs out, and nothing else is ever in the blend. */
  const fall = () => descent((rig) => { rig.motion.airborne = true; });

  /** A dash begun from the ground. `offGround` rises on the dash's own entry frame, so the jump
   *  segment starts there too, and its 0.75 s outlives the dash's 0.6 s — the kick fades out under a
   *  segment that is still running. This case was already right; it is here to be compared against. */
  const dashFromGround = () => descent((rig) => {
    rig.motion.homing = true;
    rig.motion.homingEntrySeconds = 0.5;
    rig.run(HOMING_MAX_DURATION);
    rig.motion.homing = false;
    rig.motion.airborne = true;
  });

  /** A dash begun `at` seconds into a fall and retimed onto an `expected` flight time, then timing
   *  out at `homingMaxDuration`. Entered late enough, the kick outlives the segment — which is the
   *  ordinary way to chain a dash, not a corner. */
  const dashFromAir = (at: number, expected: number) => descent((rig) => {
    rig.motion.airborne = true;
    rig.run(at);
    rig.motion.homing = true;
    rig.motion.homingEntrySeconds = expected;
    rig.run(HOMING_MAX_DURATION);
    rig.motion.homing = false;
  });

  /** A dash that arrives instead of timing out: the domain hands out a bounce, the segment restarts
   *  at its bounce seam, and the knight comes back down with more descent left than that restart
   *  covers. */
  const bounce = () => descent((rig) => {
    rig.motion.airborne = true;
    rig.run(0.3);
    rig.motion.homing = true;
    rig.motion.homingEntrySeconds = 0.4;
    rig.run(0.4);
    rig.motion.homing = false;
    rig.motion.bounced = true;
    rig.step();
    rig.motion.bounced = false;
  });

  it('is the frame the jump segment ends on, for an ordinary fall', () => {
    expect(fall()).toBeCloseTo(FALL_POSE, 6);
    // Not the frame it starts on, and not the clip's own end either: the ramp makes those three
    // different numbers, so "the segment's last frame" is a claim rather than an assumption.
    expect(fall()).not.toBeCloseTo(JUMP_AT_CLIP_END, 6);
  });

  it('is that same frame for a dash entered from the ground', () => {
    expect(dashFromGround()).toBe(fall());
  });

  it('is that same frame for a dash entered in mid-air', () => {
    // The three timings measured at 67.6, 50.8 and 92.4 before the fix. They differ in when the dash
    // started and in how long it was expected to run, which between them decides whether the kick
    // clip, the dash itself or the jump segment ends last.
    expect(dashFromAir(0.30, 0.60)).toBe(fall());
    expect(dashFromAir(0.25, 0.55)).toBe(fall());
    expect(dashFromAir(0.30, 0.40)).toBe(fall());
  });

  it('is that same frame once a bounce has run out', () => {
    expect(bounce()).toBe(fall());
  });

  it('does not depend on where in the descent the dash was entered', () => {
    // The whole of a jump, every 0.05 s. A dash entered around 0.25 s in or later is one whose kick
    // outlives the segment — the boundary the held pose used to slide across, and one no player can
    // see.
    const held = fall();
    for (let step = 1; step <= 15; step++) {
      expect(dashFromAir(step * 0.05, 0.55)).toBe(held);
    }
  });
});

/**
 * What the hold costs, and where it stops costing it.
 *
 * The hold is a restart — `AnimationGroup.start()` on a one-frame range — so the question "how
 * many times" has a right answer and several wrong ones. Once per descent is the right one: the
 * pose is pinned and then left alone. Once per *frame* is what a hold that did not loop would do,
 * since the group would end on the frame it started and be found stopped again on the next one; the
 * pose it leaves is the same, so nothing else here can tell the two apart. And on the ground the
 * answer is none at all: a clip left playing at weight zero still bleeds its motion into the pose,
 * which is why `driveKnightAnimation` stops the locomotion clips it is not using rather than zeroing
 * them, and a hold that did not ask whether the character was off the ground would fight that stop
 * on every frame the knight spent standing still.
 */
describe('what pinning the held frame costs', () => {
  it('restarts the jump once for the launch and once for the hold, however long the fall', () => {
    const rig = running();
    rig.motion.airborne = true;
    rig.run(SUMMIT_FALL_SECONDS * 4);
    expect(rig.jumpStarts()).toBe(2);
  });

  it('does not restart it at all while the knight is on the ground', () => {
    const rig = running();
    rig.motion.airborne = true;
    rig.run(SUMMIT_FALL_SECONDS);
    rig.motion.airborne = false;
    rig.run(1);
    const afterLanding = rig.jumpStarts();
    rig.run(1);
    expect(rig.jumpStarts()).toBe(afterLanding);
    expect(rig.knight.animations.jump.isPlaying).toBe(false);
  });
});
