import { describe, it, expect } from 'vitest';

import { phaseOf, weightOf, type AnimationClip } from '../../src/presentation/audio/clipSample';

/**
 * Pins the conversion from the animation rig to the domain's four numbers.
 *
 * `locomotionGait` and `footstepCadence` are covered as pure functions, but they only ever see what
 * these two produce: a wrong `from`/`to` span, a sign lost in the phase normalisation, or a weight
 * read off the wrong object would leave the whole domain suite green while putting every footfall at
 * the wrong point in the cycle — silently, since nothing throws and the footsteps still fire. That is
 * the item §7 of the audio design spec marks as needing a rendering scene and a pair of ears; the
 * arithmetic half of it does not, because both functions are pure functions of four plain properties.
 *
 * Hence the fake: a plain object with the four properties a real `AnimationGroup` carries. No
 * `vi.mock`, no `Scene`, no loaded knight. `hubAudio.ts` passes a real group to the same signature,
 * so the compiler is what checks that this shape is the rig's shape.
 */
const clip = (over: Partial<AnimationClip> = {}): AnimationClip => ({
  isPlaying: true,
  from: 0,
  to: 100,
  animatables: [{ masterFrame: 0, weight: 1 }],
  ...over,
});

describe('phaseOf', () => {
  it('is the position within the clip, not the raw frame', () => {
    // `from` is not always 0 — the knight's clips are segments of one baked timeline — so a phase that
    // ignored it would be off by the segment's own offset at every gait.
    expect(phaseOf(clip({ from: 20, to: 40, animatables: [{ masterFrame: 25, weight: 1 }] }))).toBe(
      0.25,
    );
  });

  it('wraps to [0, 1) at and past the end of the clip', () => {
    // A looping group reports frames at and beyond `to`. Phase 1 is phase 0 — the same instant in the
    // cycle — and the cadence compares phases across frames, so a 1 here would read as a full cycle of
    // travel in one frame.
    expect(phaseOf(clip({ from: 0, to: 10, animatables: [{ masterFrame: 10, weight: 1 }] }))).toBe(0);
    expect(phaseOf(clip({ from: 0, to: 10, animatables: [{ masterFrame: 25, weight: 1 }] }))).toBe(0.5);
  });

  it('wraps a frame below `from` forwards rather than returning a negative phase', () => {
    // `%` in JavaScript keeps the sign of its left operand, so the bare `p % 1` this normalisation
    // wraps would hand the domain -0.5 — a phase no contact point ever matches, and one that reads as
    // the cycle running backwards.
    const phase = phaseOf(clip({ from: 10, to: 20, animatables: [{ masterFrame: 5, weight: 1 }] }));
    expect(phase).toBe(0.5);
  });

  it('has no phase when the clip is stopped or has no animatable', () => {
    // `null`, not 0: 0 is a real point in the cycle that the cadence would fire a step on, and
    // `cadenceSample` treats a missing phase as "this clip has nothing to say" instead.
    expect(phaseOf(clip({ isPlaying: false }))).toBeNull();
    expect(phaseOf(clip({ animatables: [] }))).toBeNull();
  });

  it('has no phase when the clip spans nothing', () => {
    // An empty or inverted span is a division by zero or a mirrored cycle. Both are `null` rather
    // than `NaN` reaching the domain, where it would compare false against every threshold.
    expect(phaseOf(clip({ from: 30, to: 30 }))).toBeNull();
    expect(phaseOf(clip({ from: 30, to: 10 }))).toBeNull();
  });
});

describe('weightOf', () => {
  it('reads the weight the group is actually blending with', () => {
    expect(weightOf(clip({ animatables: [{ masterFrame: 0, weight: 0.25 }] }))).toBe(0.25);
  });

  it('is zero for a clip that is stopped or has no animatable', () => {
    // A stopped group keeps its last weight. Reporting it would let a clip that stopped mid-blend
    // outweigh the one actually driving the pose, and `cadenceSample` picks the gait by weight.
    expect(weightOf(clip({ isPlaying: false, animatables: [{ masterFrame: 0, weight: 1 }] }))).toBe(0);
    expect(weightOf(clip({ animatables: [] }))).toBe(0);
  });
});
