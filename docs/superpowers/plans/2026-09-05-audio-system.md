# Audio System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the game its first audio — music, footsteps, ambience and AVG/UI cues — driven by a pure domain core over babylon's AudioV2.

**Architecture:** A pure `src/domain/audio/` decides *what should be heard* (footfall timing, which track, per-bus gain) and is unit-tested without a browser. A thin `src/presentation/audio/` makes noise with AudioV2: one engine, three buses, a manifest-driven sound bank that tolerates missing files, and one wiring file that touches the scene. Footsteps lock to the locomotion clip's playback phase, because the clips are not speed-scaled.

**Tech Stack:** TypeScript, Svelte 5 (runes), `@babylonjs/core` 9.21 (AudioV2 — already a dependency), Vitest, pnpm.

**Spec:** [`docs/superpowers/specs/2026-09-05-audio-system-design.md`](../specs/2026-09-05-audio-system-design.md)

## Global Constraints

- **`src/domain/` imports nothing from babylon, Svelte, or IO.** It is pure TypeScript, and every module in it is Vitest-covered. This is the project's non-negotiable architecture rule (`docs/engineering-principles.md`, `docs/HANDOFF.md` §1).
- **No new npm dependency.** AudioV2 ships inside `@babylonjs/core` 9.21 (`@babylonjs/core/AudioV2/...`). Do not add howler, tone, or an ffmpeg-wasm package.
- **A missing or unreadable audio file warns once and plays silence.** It never throws and never rejects a promise. See spec §4.2 for the incident this rule comes from.
- **Everything spatial is mono.** A stereo buffer cannot be panned; `water_pond.ogg` is mono for exactly this reason.
- **Deep imports only**, matching the rest of `src/presentation/babylon/` — `import { CreateAudioEngineAsync } from '@babylonjs/core/AudioV2/webAudio/webAudioEngine'`, never `from '@babylonjs/core'`.
- **Commands:** `pnpm test` (Vitest), `pnpm typecheck` (`tsc --noEmit && svelte-check`), `pnpm dev` (Vite). Tests live in `tests/`, mirroring the source path.
- **Assets are already committed** under `public/audio/` (commit `3f450b3`), as Git LFS pointers. `git lfs pull` before running the scene, or every sound is a missing file.
- **This machine's PATH trap:** a freshly installed tool is not on an already-running shell's PATH. If `pnpm` reports "command not found", use `C:/Program Files/nodejs/node.exe node_modules/vite/bin/vite.js`, or rebuild PATH in the shell first.

---

### Task 1: The cue vocabulary and the mixer

The two smallest pure modules, and everything else names types from them. Reviewed together because neither is meaningful alone.

**Files:**
- Create: `src/domain/audio/soundCue.ts`
- Create: `src/domain/audio/audioMixer.ts`
- Test: `tests/domain/audio/audioMixer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SoundCue` (string union), `AudioBusId = 'music' | 'sfx' | 'ambience'`, `SurfaceKind = 'grass'`, `surfaceCue(surface: SurfaceKind): SoundCue`; `MixerLevels`, `DEFAULT_LEVELS: MixerLevels`, `busGain(levels: MixerLevels, bus: AudioBusId): number`.

- [ ] **Step 1: Install dependencies in this worktree**

The worktree has no `node_modules` yet.

```bash
pnpm install
```

Expected: completes; `pnpm test` then runs the existing suite green.

- [ ] **Step 2: Write the cue vocabulary**

Create `src/domain/audio/soundCue.ts`:

```ts
/**
 * Every sound the game can ask for, by name.
 *
 * A closed union rather than free strings: the manifest is typed as `Record<SoundCue, CueSpec>`, so
 * adding a cue here fails the build until it has a file behind it, and a typo in a call site is a
 * type error instead of a sound that silently never plays.
 */
export type SoundCue =
  | 'footstep.armour'
  | 'footstep.grass'
  | 'jump.takeoff'
  | 'jump.land'
  | 'ui.type'
  | 'ui.move'
  | 'ui.confirm'
  | 'ambience.wind'
  | 'ambience.water'
  | 'music.hub'
  | 'music.avg';

/** The three mix groups. Master is the engine's own output, not a bus. */
export type AudioBusId = 'music' | 'sfx' | 'ambience';

/**
 * What the character is walking on. One surface today; the cue is derived rather than hard-coded so
 * a stone plaza or shallow water is a manifest entry plus a case here, not a redesign.
 */
export type SurfaceKind = 'grass';

/** The surface layer that plays *under* `footstep.armour` for a footfall. */
export const surfaceCue = (surface: SurfaceKind): SoundCue => `footstep.${surface}`;
```

- [ ] **Step 3: Write the failing mixer test**

Create `tests/domain/audio/audioMixer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { busGain, DEFAULT_LEVELS, type MixerLevels } from '../../../src/domain/audio/audioMixer';

const levels = (over: Partial<MixerLevels> = {}): MixerLevels => ({ ...DEFAULT_LEVELS, ...over });

describe('busGain', () => {
  it('multiplies the bus level by master', () => {
    expect(busGain(levels({ master: 0.5, sfx: 0.4 }), 'sfx')).toBeCloseTo(0.2);
  });

  it('reads each bus independently', () => {
    const l = levels({ music: 0.2, sfx: 0.4, ambience: 0.6 });
    expect(busGain(l, 'music')).toBeCloseTo(0.2);
    expect(busGain(l, 'sfx')).toBeCloseTo(0.4);
    expect(busGain(l, 'ambience')).toBeCloseTo(0.6);
  });

  it('mute overrides every level', () => {
    expect(busGain(levels({ master: 1, music: 1, muted: true }), 'music')).toBe(0);
  });

  it('clamps levels into [0, 1] rather than trusting the caller', () => {
    expect(busGain(levels({ master: 4, sfx: 4 }), 'sfx')).toBe(1);
    expect(busGain(levels({ sfx: -1 }), 'sfx')).toBe(0);
  });

  it('defaults to unity on every bus', () => {
    expect(busGain(DEFAULT_LEVELS, 'music')).toBe(1);
    expect(busGain(DEFAULT_LEVELS, 'sfx')).toBe(1);
    expect(busGain(DEFAULT_LEVELS, 'ambience')).toBe(1);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `pnpm test tests/domain/audio/audioMixer.test.ts`
Expected: FAIL — cannot resolve `src/domain/audio/audioMixer`.

- [ ] **Step 5: Write the mixer**

Create `src/domain/audio/audioMixer.ts`:

```ts
import type { AudioBusId } from './soundCue';

/**
 * The mix, as plain data. There is no settings UI yet (spec §9) — this exists so that when there is
 * one, the rules it binds to are already tested, and so the presentation layer has exactly one place
 * to read a bus gain from.
 */
export interface MixerLevels {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
  readonly ambience: number;
  readonly muted: boolean;
}

export const DEFAULT_LEVELS: MixerLevels = {
  master: 1,
  music: 1,
  sfx: 1,
  ambience: 1,
  muted: false,
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The gain to apply to one bus. Clamps rather than trusting its input: these values will come from a
 * slider and, later, from storage, and a level outside [0, 1] would be a distortion bug rather than
 * an obviously wrong number.
 */
export const busGain = (levels: MixerLevels, bus: AudioBusId): number =>
  levels.muted ? 0 : clamp01(levels.master) * clamp01(levels[bus]);
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test tests/domain/audio/audioMixer.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm typecheck
git add src/domain/audio tests/domain/audio
git commit -m "feat(audio): add the cue vocabulary and the bus mixer"
```

---

### Task 2: The music director

**Files:**
- Create: `src/domain/audio/musicDirector.ts`
- Test: `tests/domain/audio/musicDirector.test.ts`

**Interfaces:**
- Consumes: `SoundCue` from Task 1.
- Produces: `MusicScene = 'intro' | 'playing'`, `MusicChange { readonly track: SoundCue; readonly fadeSeconds: number }`, `CROSSFADE_SECONDS: number`, `musicChange(playing: SoundCue | null, scene: MusicScene): MusicChange | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/audio/musicDirector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { musicChange, CROSSFADE_SECONDS } from '../../../src/domain/audio/musicDirector';

describe('musicChange', () => {
  it('starts the AVG theme when nothing is playing during the intro', () => {
    expect(musicChange(null, 'intro')).toEqual({ track: 'music.avg', fadeSeconds: CROSSFADE_SECONDS });
  });

  it('starts the hub theme when nothing is playing during gameplay', () => {
    expect(musicChange(null, 'playing')).toEqual({ track: 'music.hub', fadeSeconds: CROSSFADE_SECONDS });
  });

  it('crosses from the AVG theme to the hub theme when the intro ends', () => {
    expect(musicChange('music.avg', 'playing')).toEqual({
      track: 'music.hub',
      fadeSeconds: CROSSFADE_SECONDS,
    });
  });

  it('asks for nothing while the right track is already playing', () => {
    expect(musicChange('music.avg', 'intro')).toBeNull();
    expect(musicChange('music.hub', 'playing')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test tests/domain/audio/musicDirector.test.ts`
Expected: FAIL — cannot resolve `src/domain/audio/musicDirector`.

- [ ] **Step 3: Write the director**

Create `src/domain/audio/musicDirector.ts`:

```ts
import type { SoundCue } from './soundCue';

/** What the game is doing, as far as the music is concerned. */
export type MusicScene = 'intro' | 'playing';

/** How long a track takes to hand over. Long enough to be a fade rather than a cut. */
export const CROSSFADE_SECONDS = 1.5;

export interface MusicChange {
  readonly track: SoundCue;
  readonly fadeSeconds: number;
}

const TRACKS: Record<MusicScene, SoundCue> = {
  intro: 'music.avg',
  playing: 'music.hub',
};

/**
 * What should change about the music, given what is playing now.
 *
 * Returns `null` when nothing should change, which is the whole point: the caller polls this every
 * time the game state might have moved and only acts on a non-null answer, so it cannot restart a
 * track that is already playing or fire a second crossfade into the one it just started. AudioV2
 * throws if a volume ramp is requested while another is in progress, so "ask for nothing" has to be
 * a first-class answer rather than something the caller filters out afterwards.
 */
export const musicChange = (playing: SoundCue | null, scene: MusicScene): MusicChange | null => {
  const track = TRACKS[scene];
  return playing === track ? null : { track, fadeSeconds: CROSSFADE_SECONDS };
};
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test tests/domain/audio/musicDirector.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/audio/musicDirector.ts tests/domain/audio/musicDirector.test.ts
git commit -m "feat(audio): add the music director"
```

---

### Task 3: Measure the foot-contact phases

Not a TDD task — a measurement, like the stride table in `2026-08-20-run-jump-movement-design.md` §4. Its output is four numbers plus the table that justifies them. **Do not guess these**; the whole point of phase-locking (spec §3.1) is that the sound lands on the visible footfall, and a guessed phase puts it half a step off.

**Files:**
- Create: `src/domain/audio/footContact.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `WALK_CONTACTS: readonly [number, number]`, `RUN_CONTACTS: readonly [number, number]` — phases in `[0, 1)`, index 0 = left foot, index 1 = right foot.

The clips are sampled directly, **not** by playing the game and recording frames. The first cut of
this task did the latter and could not run: the Browser pane is hidden in this environment, and a
hidden pane starves `requestAnimationFrame` *and* `setTimeout`, so the render loop never advances and
a per-frame sampler collects nothing (0 renders in 5.8 s, measured). Sampling the clip directly is
better anyway — it is deterministic, samples every phase evenly instead of however many frames
happened to land in each bin, needs no input driving, and because the render loop is stopped the
character is frozen, so the animation phase is the *only* thing moving the toes.

- [ ] **Step 1: Pull the LFS assets and start the dev server**

```bash
git lfs pull
```

Then start the preview with the `Claude_Browser` preview tool (`preview_start` with the name in
`.claude/launch.json`). The Browser pane being hidden is fine here, and the scene still builds:
`createHubScene` awaits Havok and the glTF loads, which are promise-driven, not frame-driven.

**Every snippet below must be fully synchronous** — no `await`, no `setTimeout`, no promise. Timers
are starved while the pane is hidden, so an asynchronous snippet times out instead of returning.

- [ ] **Step 2: Confirm the toe bones**

```js
window.hub.scene.skeletons[0].bones.map((b) => b.name).filter((n) => /toe|foot/i.test(n));
```

Expect a long list. The two to sample are **`LeftToes`** and **`RightToes`**: they are parented to
`LeftFoot`/`RightFoot` and are themselves the parent of the individual toe bones
(`CC_Base_L_BigToe1` and friends), which makes them the toe-base/ball-of-foot joint — the part that
stays on the ground through the whole stance phase, so its height has a flat, unambiguous minimum.
Do not use `LeftFoot`/`RightFoot` (those are the ankles) or `CC_Base_L/R_ToeBaseShareBone` (leaf
skin-weight helpers with no children). If this list ever comes back without `LeftToes`/`RightToes`,
the model changed — re-derive by walking `getParent()`/`children` and say so in your report.

- [ ] **Step 3: Sample both clips across their phase**

This plays each group only to create its animatables, pauses it immediately, then walks the phase
with `goToFrame`, forcing the toe nodes' world matrices each time. Heights are read off the
`TransformNode` the glTF loader links to each bone.

```js
(() => {
  const hub = window.hub;
  const skel = hub.scene.skeletons[0];
  const node = (n) => skel.bones.find((b) => b.name === n).getTransformNode();
  const L = node('LeftToes');
  const R = node('RightToes');
  const BINS = 100;
  const sample = (g) => {
    g.play(true);
    g.pause();
    const rows = [];
    for (let i = 0; i < BINS; i++) {
      g.goToFrame(g.from + (i / BINS) * (g.to - g.from));
      L.computeWorldMatrix(true);
      R.computeWorldMatrix(true);
      rows.push([L.absolutePosition.y, R.absolutePosition.y]);
    }
    g.stop();
    return rows;
  };
  window.__curves = {
    walk: sample(hub.knight.animations.walk),
    run: sample(hub.knight.animations.run),
  };
  return Object.fromEntries(
    Object.entries(window.__curves).map(([k, v]) => [k, v.length]),
  );
})()
```

Expect `{ walk: 100, run: 100 }`.

- [ ] **Step 4: Reduce the curves to contact phases**

```js
(() => {
  const report = {};
  for (const [gait, rows] of Object.entries(window.__curves))
    for (const [foot, col] of [['left', 0], ['right', 1]]) {
      const ys = rows.map((r) => r[col]);
      let bi = 0;
      for (let i = 1; i < ys.length; i++) if (ys[i] < ys[bi]) bi = i;
      const min = ys[bi];
      const max = Math.max(...ys);
      report[gait + '.' + foot] = {
        phase: +(bi / ys.length).toFixed(3),
        minY: +min.toFixed(4),
        maxY: +max.toFixed(4),
        lift: +(max - min).toFixed(4),
      };
    }
  // How far apart the two feet land, as a fraction of the cycle, measured the short way round.
  for (const gait of ['walk', 'run']) {
    const d = Math.abs(report[gait + '.left'].phase - report[gait + '.right'].phase);
    report[gait + '.separation'] = +Math.min(d, 1 - d).toFixed(3);
  }
  return report;
})()
```

Record the whole table.

- [ ] **Step 5: Apply the sanity checks**

State each result explicitly in your report. **If any fails, stop and report rather than shipping the
number** — a fabricated constant here is worse than no constant, because nothing downstream reveals
it as fabricated.

1. **`lift` is clearly non-zero** for all four curves (expect on the order of 0.1+ world units). A
   near-flat curve means the minimum is noise, not a footfall.
2. **The two feet of one gait land roughly half a cycle apart** — `separation` near 0.5, and in any
   case **not below 0.15**. Below that, the two nodes are on the same leg: go back to Step 2.
3. **The two gaits disagree with each other.** Walk and run are different clips; identical phases to
   three decimals would mean the same clip was sampled twice.

- [ ] **Step 6: Clean up**

```js
delete window.__curves;
'cleared';
```

- [ ] **Step 7: Write the constants with their measurement**

Create `src/domain/audio/footContact.ts`, substituting the measured numbers and the real bone names. Keep the table — this repo's convention is that a tuned constant ships with the measurement that produced it.

```ts
/**
 * The phases within each locomotion clip at which a foot is on the ground.
 *
 * These exist because the locomotion clips are **not speed-scaled**: `driveKnightAnimation` starts
 * Idle/Walk/Run with `group.play(true)` and never touches `speedRatio`, cross-fading them by weight
 * alone. The visible cadence is therefore fixed at each clip's authored rate (Walk 1.033 s, Run
 * 0.633 s — `2026-08-20-run-jump-movement-design.md` §4), and a footstep sound driven by distance
 * travelled would drift out of phase with the feet within a stride. Locking to the clip's phase is
 * what keeps sound and picture together.
 *
 * Measured from the shipped GLB by stepping each clip through 100 evenly spaced phases with
 * `goToFrame` and reading the world height of the toe-base joints `LeftToes` / `RightToes`, with the
 * render loop stopped so the character is frozen and the animation phase is the only thing moving
 * them. The contact is the phase at which a toe is lowest; `lift` is how far it rises above that,
 * which is what says the minimum is a footfall and not a flat curve:
 *
 * | Clip | Foot | contact phase | toe lift above contact |
 * | --- | --- | --- | --- |
 * | Walk | left | <PHASE> | <LIFT> |
 * | Walk | right | <PHASE> | <LIFT> |
 * | Run | left | <PHASE> | <LIFT> |
 * | Run | right | <PHASE> | <LIFT> |
 *
 * The two feet of a gait land <WALK_SEP> (walk) and <RUN_SEP> (run) of a cycle apart.
 *
 * Re-measure whenever the clips are re-exported: these are properties of the animation data, not of
 * the character, and the GLB pipeline has already changed once (see the README's regeneration notes).
 */

/** Phase in [0, 1) of each footfall in the Walk clip. Index 0 is the left foot. */
export const WALK_CONTACTS: readonly [number, number] = [0.0, 0.0]; // <- measured values

/** Phase in [0, 1) of each footfall in the Run clip. Index 0 is the left foot. */
export const RUN_CONTACTS: readonly [number, number] = [0.0, 0.0]; // <- measured values
```

- [ ] **Step 8: Commit**

```bash
git add src/domain/audio/footContact.ts
git commit -m "feat(audio): measure the knight's foot-contact phases"
```

---

### Task 4: The footstep cadence machine

**Files:**
- Create: `src/domain/audio/footstepCadence.ts`
- Test: `tests/domain/audio/footstepCadence.test.ts`

**Interfaces:**
- Consumes: `WALK_CONTACTS`, `RUN_CONTACTS` from Task 3.
- Produces: `Gait = 'idle' | 'walk' | 'run'`; `CadenceSample { gait: Gait; phase: number; airborne: boolean; elapsed: number }`; `Footfall { foot: 'left' | 'right'; playbackRate: number; volume: number }`; `FootstepCadence { step(sample: CadenceSample): Footfall | null }`; `createFootstepCadence(random?: () => number): FootstepCadence`; `MIN_STEP_SECONDS: number`; `crossed(prev: number, next: number, contact: number): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/audio/footstepCadence.test.ts`. Note the fixed `random` stub: the jitter is deliberately random in the game, so the tests pin it to make the numbers assertable.

```ts
import { describe, it, expect } from 'vitest';
import { createFootstepCadence, crossed, MIN_STEP_SECONDS } from '../../../src/domain/audio/footstepCadence';
import { WALK_CONTACTS } from '../../../src/domain/audio/footContact';

const [LEFT, RIGHT] = WALK_CONTACTS;
const before = (p: number) => (p - 0.02 + 1) % 1;
const after = (p: number) => (p + 0.02) % 1;

/** A cadence with a fixed random source, so playbackRate and volume are assertable. */
const fixed = (value = 0.5) => createFootstepCadence(() => value);

// Tested directly rather than through the machine: whether a wrap fires depends on where the
// measured contacts happen to sit, and a test that re-measures the asset is not testing the logic.
describe('crossed', () => {
  it('detects a contact passed within the frame', () => {
    expect(crossed(0.2, 0.4, 0.3)).toBe(true);
    expect(crossed(0.2, 0.4, 0.5)).toBe(false);
    expect(crossed(0.2, 0.4, 0.1)).toBe(false);
  });

  it('detects a contact passed across the wrap from 1 to 0', () => {
    expect(crossed(0.97, 0.03, 0.99)).toBe(true); // just before the wrap
    expect(crossed(0.97, 0.03, 0.01)).toBe(true); // just after it
    expect(crossed(0.97, 0.03, 0.5)).toBe(false); // the half of the cycle that was not travelled
  });

  it('is half-open, so a contact landed on exactly fires once and not again', () => {
    expect(crossed(0.2, 0.3, 0.3)).toBe(true);
    expect(crossed(0.3, 0.4, 0.3)).toBe(false);
  });
});

describe('createFootstepCadence', () => {
  it('does not fire on the first sample, having nothing to compare against', () => {
    const c = fixed();
    expect(c.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 0.016 })).toBeNull();
  });

  it('fires when the phase crosses a contact', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    const fall = c.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 0.016 });
    expect(fall).not.toBeNull();
    expect(fall!.foot).toBe('left');
  });

  it('does not fire again while the phase stays past the contact', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    c.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 0.016 });
    expect(
      c.step({ gait: 'walk', phase: after(LEFT) + 0.01, airborne: false, elapsed: 0.016 }),
    ).toBeNull();
  });

  it('attributes the second contact of the cycle to the other foot', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(RIGHT), airborne: false, elapsed: 0.016 });
    const fall = c.step({ gait: 'walk', phase: after(RIGHT), airborne: false, elapsed: 0.4 });
    expect(fall?.foot).toBe('right');
  });

  it('fires nothing while airborne', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    expect(c.step({ gait: 'walk', phase: after(LEFT), airborne: true, elapsed: 0.016 })).toBeNull();
  });

  it('does not pay out a stored step on landing', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    c.step({ gait: 'walk', phase: after(LEFT), airborne: true, elapsed: 0.5 });
    // Back on the ground, still past the contact: the crossing happened in the air and is gone.
    expect(c.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 0.016 })).toBeNull();
  });

  it('fires nothing while idle', () => {
    const c = fixed();
    c.step({ gait: 'idle', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    expect(c.step({ gait: 'idle', phase: after(LEFT), airborne: false, elapsed: 0.016 })).toBeNull();
  });

  it('re-seeds across a gait change instead of comparing phases between clips', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    // The run clip's phase is unrelated to the walk clip's; comparing them would fire spuriously.
    expect(c.step({ gait: 'run', phase: after(LEFT), airborne: false, elapsed: 0.016 })).toBeNull();
  });

  it('suppresses a second step inside the minimum interval', () => {
    const c = fixed();
    c.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    expect(c.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 1 })).not.toBeNull();
    c.step({ gait: 'walk', phase: before(RIGHT), airborne: false, elapsed: MIN_STEP_SECONDS / 4 });
    expect(
      c.step({ gait: 'walk', phase: after(RIGHT), airborne: false, elapsed: MIN_STEP_SECONDS / 4 }),
    ).toBeNull();
  });

  it('pays out one step for a frame that spans a whole cycle, and queues nothing', () => {
    // A tab switch or a hitch produces one enormous frame that crosses both contacts. Firing a
    // burst then is the failure, and so is paying the second one out on the following frame.
    const c = fixed();
    c.step({ gait: 'walk', phase: 0.0, airborne: false, elapsed: 0.016 });
    const fall = c.step({ gait: 'walk', phase: 0.99, airborne: false, elapsed: 5 });
    // Left is checked first, so the earlier contact of the two is the one that sounds.
    expect(fall?.foot).toBe('left');
    // The crossing that was not paid out is discarded, not remembered.
    expect(c.step({ gait: 'walk', phase: 0.995, airborne: false, elapsed: 0.016 })).toBeNull();
  });

  it('jitters playback rate and volume within their bands', () => {
    const low = createFootstepCadence(() => 0);
    low.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    const quiet = low.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 1 })!;
    const high = createFootstepCadence(() => 1);
    high.step({ gait: 'walk', phase: before(LEFT), airborne: false, elapsed: 0.016 });
    const loud = high.step({ gait: 'walk', phase: after(LEFT), airborne: false, elapsed: 1 })!;

    expect(quiet.playbackRate).toBeLessThan(1);
    expect(loud.playbackRate).toBeGreaterThan(1);
    expect(quiet.volume).toBeLessThan(loud.volume);
    for (const f of [quiet, loud]) {
      expect(f.playbackRate).toBeGreaterThanOrEqual(0.92);
      expect(f.playbackRate).toBeLessThanOrEqual(1.08);
      expect(f.volume).toBeGreaterThanOrEqual(0.85);
      expect(f.volume).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test tests/domain/audio/footstepCadence.test.ts`
Expected: FAIL — cannot resolve `src/domain/audio/footstepCadence`.

- [ ] **Step 3: Write the cadence machine**

Create `src/domain/audio/footstepCadence.ts`:

```ts
import { RUN_CONTACTS, WALK_CONTACTS } from './footContact';

export type Gait = 'idle' | 'walk' | 'run';

/** What the animation layer knows each frame, reduced to what the cadence needs. */
export interface CadenceSample {
  readonly gait: Gait;
  /** The dominant locomotion clip's playback position, normalised to [0, 1). */
  readonly phase: number;
  readonly airborne: boolean;
  /** Seconds since the previous sample. */
  readonly elapsed: number;
}

/** One footfall. The caller turns this into an armour layer plus a surface layer. */
export interface Footfall {
  readonly foot: 'left' | 'right';
  readonly playbackRate: number;
  readonly volume: number;
}

export interface FootstepCadence {
  /** The footfall that happened since the previous sample, or `null`. At most one per call. */
  step(sample: CadenceSample): Footfall | null;
}

/**
 * The shortest gap between two footsteps.
 *
 * Run's cycle is 0.633 s, so its two footfalls are 0.317 s apart — this sits comfortably below that
 * and so never suppresses a real step. What it does suppress is the walk↔run handover: for the few
 * hundred milliseconds where the blend crosses over, the machine re-seeds onto the new clip at
 * whatever phase that clip happens to be at, which can land just before one of its contacts and
 * produce a second step within a few frames of the last one.
 */
export const MIN_STEP_SECONDS = 0.2;

/** Playback-rate band for the jitter. ±8 % is audible as variation, not as a wrong pitch. */
const RATE_MIN = 0.92;
const RATE_MAX = 1.08;
/** Volume band. Only downward: the samples are peak-normalised, so 1 is the intended level. */
const VOLUME_MIN = 0.85;
const VOLUME_MAX = 1;

/**
 * Whether `contact` lies in the half-open interval (prev, next], going forwards and wrapping at 1.
 *
 * Exported for its own tests: the wrap is the one piece of arithmetic here that a test driving the
 * whole machine cannot pin down, because whether any given frame wraps past a contact depends on
 * where the measured contacts happen to sit in the clip.
 */
export const crossed = (prev: number, next: number, contact: number): boolean =>
  next >= prev
    ? contact > prev && contact <= next
    : contact > prev || contact <= next; // the phase wrapped past 1

/**
 * Turns the locomotion clip's playback phase into footfalls.
 *
 * Phase-locked rather than distance-accumulated — see {@link WALK_CONTACTS} for why the obvious
 * design does not work here.
 *
 * `random` is injected so the jitter is testable, and is deliberately **not** a seeded generator:
 * footstep variation has no reason to be reproducible the way terrain layout does, and taking a
 * dependency on `src/domain/math/rng.ts` would collide with the branch that is adding it.
 */
export function createFootstepCadence(random: () => number = Math.random): FootstepCadence {
  let lastPhase: number | null = null;
  let lastGait: Gait = 'idle';
  let sinceStep = Infinity;

  return {
    step({ gait, phase, airborne, elapsed }) {
      sinceStep += elapsed;

      // Airborne and idle both clear the phase rather than just skipping the check: keeping it would
      // let the crossing that happened mid-air (or mid-idle-sway) pay out on the frame the state
      // ends, which is a step sound with no step under it.
      if (airborne || gait === 'idle') {
        lastPhase = null;
        lastGait = gait;
        return null;
      }

      // The walk and run clips have unrelated phases, so a change of gait re-seeds instead of
      // comparing across them.
      if (gait !== lastGait) {
        lastGait = gait;
        lastPhase = phase;
        return null;
      }

      const prev = lastPhase;
      lastPhase = phase;
      if (prev === null) return null;

      const contacts = gait === 'run' ? RUN_CONTACTS : WALK_CONTACTS;
      // Left is checked first, so a frame long enough to span both contacts still yields one
      // footfall rather than a burst.
      const index = contacts.findIndex((c) => crossed(prev, phase, c));
      if (index < 0 || sinceStep < MIN_STEP_SECONDS) return null;

      sinceStep = 0;
      return {
        foot: index === 0 ? 'left' : 'right',
        playbackRate: RATE_MIN + random() * (RATE_MAX - RATE_MIN),
        volume: VOLUME_MIN + random() * (VOLUME_MAX - VOLUME_MIN),
      };
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test tests/domain/audio/footstepCadence.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Run the whole suite and typecheck**

```bash
pnpm test
pnpm typecheck
```

Expected: all green, including the pre-existing specs.

- [ ] **Step 6: Commit**

```bash
git add src/domain/audio/footstepCadence.ts tests/domain/audio/footstepCadence.test.ts
git commit -m "feat(audio): lock the footstep cadence to the locomotion clip's phase"
```

---

### Task 5: The audio engine and its buses

**Files:**
- Create: `src/presentation/audio/audioEngine.ts`

**Interfaces:**
- Consumes: `AudioBusId`, `MixerLevels`, `busGain`, `DEFAULT_LEVELS` from Task 1.
- Produces: `GameAudio { readonly engine: AudioEngineV2; readonly buses: Record<AudioBusId, AudioBus>; applyLevels(levels: MixerLevels): void; dispose(): void }`, `createGameAudio(levels?: MixerLevels): Promise<GameAudio>`.

No unit test: this file is a thin construction wrapper around AudioV2 whose entire behaviour is "did babylon build the graph", which a stub would assert about the stub. It is covered by the in-scene verification in Task 9.

- [ ] **Step 1: Write the engine wrapper**

Create `src/presentation/audio/audioEngine.ts`:

```ts
import { CreateAudioEngineAsync } from '@babylonjs/core/AudioV2/webAudio/webAudioEngine';
// The Create*Async factories all live in audioEngineV2, not beside the types they return.
import { CreateAudioBusAsync } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import type { AudioBus } from '@babylonjs/core/AudioV2/abstractAudio/audioBus';
import type { AudioEngineV2 } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';

import { busGain, DEFAULT_LEVELS, type MixerLevels } from '../../domain/audio/audioMixer';
import type { AudioBusId } from '../../domain/audio/soundCue';

const BUS_IDS: readonly AudioBusId[] = ['music', 'sfx', 'ambience'];

export interface GameAudio {
  readonly engine: AudioEngineV2;
  readonly buses: Record<AudioBusId, AudioBus>;
  /** Pushes a mix down onto the buses. */
  applyLevels(levels: MixerLevels): void;
  dispose(): void;
}

/**
 * Builds the audio graph: one engine, three buses.
 *
 * Browsers refuse to start an audio context without a user gesture. `resumeOnInteraction` (AudioV2's
 * default, set explicitly here because it is load-bearing) hangs the unlock off the first click, and
 * the game already requires one — to capture the mouse for gameplay, and to advance the AVG intro.
 * Until then everything below runs normally and is simply inaudible; nothing throws and nothing has
 * to be retried.
 *
 * `disableDefaultUI` turns off babylon's own "click to start audio" overlay, which would otherwise
 * paint a button over the canvas for a gesture the game is already collecting.
 */
export async function createGameAudio(levels: MixerLevels = DEFAULT_LEVELS): Promise<GameAudio> {
  const engine = await CreateAudioEngineAsync({
    resumeOnInteraction: true,
    disableDefaultUI: true,
  });

  const entries = await Promise.all(
    BUS_IDS.map(async (id) => [id, await CreateAudioBusAsync(id, {}, engine)] as const),
  );
  const buses = Object.fromEntries(entries) as Record<AudioBusId, AudioBus>;

  const applyLevels = (next: MixerLevels) => {
    for (const id of BUS_IDS) buses[id].volume = busGain(next, id);
  };
  applyLevels(levels);

  return {
    engine,
    buses,
    applyLevels,
    dispose: () => {
      for (const id of BUS_IDS) buses[id].dispose();
      engine.dispose();
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. If a deep import path fails to resolve, check it against `node_modules/@babylonjs/core/AudioV2/` — do not switch to a barrel import from `@babylonjs/core`.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/audio/audioEngine.ts
git commit -m "feat(audio): build the audio engine and its three buses"
```

---

### Task 6: The manifest and the sound bank

**Files:**
- Create: `src/presentation/audio/manifest.ts`
- Create: `src/presentation/audio/soundBank.ts`

**Interfaces:**
- Consumes: `SoundCue`, `AudioBusId` from Task 1; `GameAudio` from Task 5.
- Produces: `CueSpec`, `MANIFEST: Record<SoundCue, CueSpec>`; `SoundBank { play(cue, options?): void; startLoop(cue, options?): LoopHandle | null; dispose(): void }`, `LoopHandle { setVolume(value: number, fadeSeconds?: number): void; stop(): void }`, `loadSoundBank(audio: GameAudio): Promise<SoundBank>`.

- [ ] **Step 1: Write the manifest**

Create `src/presentation/audio/manifest.ts`. The volumes are the starting points from spec §5.5 — Task 9 tunes them in-scene.

```ts
import type { AudioBusId, SoundCue } from '../../domain/audio/soundCue';

export interface CueSpec {
  /** One entry per variant; a cue with several is chosen from by the caller. */
  readonly files: readonly string[];
  readonly bus: AudioBusId;
  /**
   * Playback volume. Every one-shot ships peak-normalised to −3 dBFS (`tools/audio/preprocess.mjs`),
   * so the balance between sounds lives here and nowhere else — re-cutting one asset cannot silently
   * change the level of the others.
   */
  readonly volume: number;
  readonly loop?: boolean;
  /** Streamed rather than decoded up front. For the multi-megabyte music tracks. */
  readonly streaming?: boolean;
  /** Present ⇒ positioned in the world. The file must be mono; a stereo buffer cannot be panned. */
  readonly spatial?: { readonly maxDistance: number };
}

const AUDIO = '/audio';

/**
 * Every cue, and the file behind it.
 *
 * Typed as a total record over `SoundCue`, so a cue added to the union fails the build here until it
 * has a file — rather than becoming a call site that silently plays nothing.
 */
export const MANIFEST: Record<SoundCue, CueSpec> = {
  // The armour layer plays on every footfall, on take-off and on landing: it is the only armour
  // sample there is, and playback-rate jitter is what stops that reading as a machine gun.
  'footstep.armour': { files: [`${AUDIO}/sfx/armor_step.ogg`], bus: 'sfx', volume: 0.45 },
  // Two variants, one per foot. Soft and long rather than percussive — the source was continuous
  // grass rustle, not discrete steps (spec §5.1).
  'footstep.grass': {
    files: [`${AUDIO}/sfx/footstep_grass_01.ogg`, `${AUDIO}/sfx/footstep_grass_02.ogg`],
    bus: 'sfx',
    volume: 0.25,
  },
  'jump.takeoff': { files: [`${AUDIO}/sfx/armor_step.ogg`], bus: 'sfx', volume: 0.5 },
  'jump.land': { files: [`${AUDIO}/sfx/armor_step.ogg`], bus: 'sfx', volume: 0.6 },

  // Lowest of all the one-shots: this is the most frequently repeated sound in the game.
  'ui.type': {
    files: [
      `${AUDIO}/sfx/ui_type_01.ogg`,
      `${AUDIO}/sfx/ui_type_02.ogg`,
      `${AUDIO}/sfx/ui_type_03.ogg`,
      `${AUDIO}/sfx/ui_type_04.ogg`,
    ],
    bus: 'sfx',
    volume: 0.3,
  },
  'ui.move': { files: [`${AUDIO}/sfx/ui_move.ogg`], bus: 'sfx', volume: 0.5 },
  'ui.confirm': { files: [`${AUDIO}/sfx/ui_confirm.ogg`], bus: 'sfx', volume: 0.6 },

  'ambience.wind': { files: [`${AUDIO}/ambience/wind_field.ogg`], bus: 'ambience', volume: 0.35, loop: true },
  // Positioned at the pond. maxDistance is a little past the pond's radius of 12, so the sound is
  // gone by the time the water is a feature in the distance rather than a place you are standing at.
  'ambience.water': {
    files: [`${AUDIO}/ambience/water_pond.ogg`],
    bus: 'ambience',
    volume: 0.6,
    loop: true,
    spatial: { maxDistance: 30 },
  },

  'music.hub': { files: [`${AUDIO}/music/hub_theme.mp3`], bus: 'music', volume: 0.5, loop: true, streaming: true },
  'music.avg': { files: [`${AUDIO}/music/avg_theme.mp3`], bus: 'music', volume: 0.55, loop: true, streaming: true },
};
```

- [ ] **Step 2: Write the sound bank**

Create `src/presentation/audio/soundBank.ts`:

```ts
// The Create*Async factories all live in audioEngineV2, not beside the types they return.
import { CreateSoundAsync, CreateStreamingSoundAsync } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import type { StaticSound } from '@babylonjs/core/AudioV2/abstractAudio/staticSound';
import type { StreamingSound } from '@babylonjs/core/AudioV2/abstractAudio/streamingSound';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

import type { SoundCue } from '../../domain/audio/soundCue';
import type { GameAudio } from './audioEngine';
import { MANIFEST, type CueSpec } from './manifest';

/** A running looped sound. */
export interface LoopHandle {
  /** Ramps to a new volume, or sets it immediately when `fadeSeconds` is 0. */
  setVolume(value: number, fadeSeconds?: number): void;
  stop(): void;
}

export interface PlayOptions {
  readonly playbackRate?: number;
  /** Scales the manifest volume, for per-instance jitter. */
  readonly gain?: number;
  /** Which variant to use; wraps, so a running counter is fine. */
  readonly variant?: number;
  readonly position?: Vector3;
}

export interface SoundBank {
  /** Plays a one-shot. A no-op for a cue that failed to load. */
  play(cue: SoundCue, options?: PlayOptions): void;
  /** Starts a loop, or returns `null` for a cue that failed to load. */
  startLoop(cue: SoundCue, options?: PlayOptions): LoopHandle | null;
  dispose(): void;
}

type Loaded = readonly (StaticSound | StreamingSound)[];

const load = async (audio: GameAudio, cue: SoundCue, spec: CueSpec): Promise<Loaded | null> => {
  try {
    const sounds = await Promise.all(
      spec.files.map((file) =>
        spec.streaming
          ? CreateStreamingSoundAsync(cue, file, { outBus: audio.buses[spec.bus] }, audio.engine)
          : CreateSoundAsync(
              cue,
              file,
              {
                outBus: audio.buses[spec.bus],
                ...(spec.spatial
                  ? {
                      spatialEnabled: true,
                      spatialDistanceModel: 'linear' as const,
                      spatialMaxDistance: spec.spatial.maxDistance,
                    }
                  : {}),
              },
              audio.engine,
            ),
      ),
    );
    return sounds;
  } catch (error) {
    // The one and only failure path, and it is deliberately not fatal. `loadKnight` rejecting on an
    // unpulled LFS pointer takes the whole scene down with it (docs/HANDOFF.md §3); audio must not
    // add a second instance of that. One warning, then silence for this cue only — which is also
    // what lets the system ship and be verified before every asset is final.
    console.warn(`[audio] cue "${cue}" unavailable, it will be silent:`, error);
    return null;
  }
};

/**
 * Loads every cue in the manifest.
 *
 * Resolves once all of them have either loaded or failed. It never rejects: a caller that has to
 * remember to `.catch` is the failure mode this is avoiding.
 */
export async function loadSoundBank(audio: GameAudio): Promise<SoundBank> {
  const cues = Object.keys(MANIFEST) as SoundCue[];
  const loaded = new Map<SoundCue, Loaded>();
  await Promise.all(
    cues.map(async (cue) => {
      const sounds = await load(audio, cue, MANIFEST[cue]);
      if (sounds) loaded.set(cue, sounds);
    }),
  );

  const pick = (cue: SoundCue, variant = 0) => {
    const sounds = loaded.get(cue);
    return sounds ? sounds[variant % sounds.length] : null;
  };

  return {
    play(cue, options = {}) {
      const sound = pick(cue, options.variant);
      if (!sound) return;
      const spec = MANIFEST[cue];
      if (options.position) sound.spatial.position = options.position;
      if (options.playbackRate !== undefined && 'playbackRate' in sound)
        (sound as StaticSound).playbackRate = options.playbackRate;
      sound.play({ volume: spec.volume * (options.gain ?? 1) });
    },

    startLoop(cue, options = {}) {
      const sound = pick(cue, options.variant);
      if (!sound) return null;
      const spec = MANIFEST[cue];
      if (options.position) sound.spatial.position = options.position;
      sound.play({ loop: true, volume: spec.volume * (options.gain ?? 1) });
      return {
        setVolume: (value, fadeSeconds = 0) => {
          // AudioV2 throws when a ramp is requested while one is already in progress. A zero-length
          // change is therefore set outright rather than ramped over the default 10 ms, and the
          // catch covers the other half of the same hazard: two fades landing on one sound inside
          // each other's window. Snapping to the value is the right degradation — a volume change
          // is never worth throwing out of a render frame, or into App.svelte's uncaught `.then`.
          try {
            if (fadeSeconds > 0) sound.setVolume(value, { duration: fadeSeconds });
            else sound.volume = value;
          } catch {
            sound.volume = value;
          }
        },
        stop: () => sound.stop(),
      };
    },

    dispose() {
      for (const sounds of loaded.values()) for (const s of sounds) s.dispose();
      loaded.clear();
    },
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/audio/manifest.ts src/presentation/audio/soundBank.ts
git commit -m "feat(audio): add the cue manifest and a missing-asset-tolerant sound bank"
```

---

### Task 7: Wire the hub — footsteps, jumps, ambience

**Files:**
- Create: `src/presentation/audio/hubAudio.ts`
- Modify: `src/presentation/babylon/hubScene.ts` (one import, one construction, one dispose line, one interface field)
- Modify: `src/presentation/babylon/knight.ts` (export `WALK_THRESHOLD`, one keyword)

**Interfaces:**
- Consumes: everything from Tasks 1–6; `Player` from `playerController`, `Knight` from `knight`, `POND` from `src/domain/hub/waterBody`.
- Produces: `HubAudio { setMusicScene(scene: MusicScene): void; dispose(): void }`, `createHubAudio(scene: Scene, camera: Camera, player: Player, knight: Knight): Promise<HubAudio>`; `HubScene.audio: HubAudio`.

- [ ] **Step 1: Write the wiring**

Create `src/presentation/audio/hubAudio.ts`:

```ts
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

import { createFootstepCadence, type Gait } from '../../domain/audio/footstepCadence';
import { musicChange, type MusicScene } from '../../domain/audio/musicDirector';
import { surfaceCue, type SoundCue } from '../../domain/audio/soundCue';
import { POND } from '../../domain/hub/waterBody';
import { WALK_THRESHOLD, type Knight } from '../babylon/knight';
import type { Player } from '../babylon/playerController';
import { createGameAudio } from './audioEngine';
import { loadSoundBank, type LoopHandle } from './soundBank';

export interface HubAudio {
  setMusicScene(scene: MusicScene): void;
  dispose(): void;
}

/** A clip's playback position in [0, 1), or `null` when it is not playing. */
const phaseOf = (group: AnimationGroup): number | null => {
  if (!group.isPlaying || group.animatables.length === 0) return null;
  const span = group.to - group.from;
  if (span <= 0) return null;
  const p = (group.animatables[0].masterFrame - group.from) / span;
  return ((p % 1) + 1) % 1;
};

/** How much of the pose this clip is contributing right now. Zero when it is not playing at all. */
const weightOf = (group: AnimationGroup): number =>
  group.isPlaying && group.animatables.length > 0 ? group.animatables[0].weight : 0;

/** Stands in when the audio graph could not be built at all. Every entry point is a no-op. */
const SILENT: HubAudio = { setMusicScene: () => {}, dispose: () => {} };

/**
 * Connects the scene to the audio.
 *
 * The only file that touches both, on purpose: `hubScene.ts` gains one construction and one dispose
 * call, which keeps this feature's footprint on a file another branch is also editing down to
 * something a rebase resolves on sight.
 *
 * **This can never fail the scene.** `createHubScene` awaits it, and `App.svelte` calls
 * `createHubScene(canvas).then(...)` with no `.catch` — so a rejection here would surface as an
 * unhandled rejection and a blank canvas. That is the same failure an unpulled knight GLB already
 * causes (`docs/HANDOFF.md` §3), and the reason `soundBank` tolerates missing files at all; it would
 * be absurd to be careful about one missing .ogg and then let a browser that refuses to open an
 * AudioContext take the whole game down. A failure here means a silent game, not a broken one.
 */
export async function createHubAudio(
  scene: Scene,
  camera: Camera,
  player: Player,
  knight: Knight,
): Promise<HubAudio> {
  try {
    return await buildHubAudio(scene, camera, player, knight);
  } catch (error) {
    console.warn('[audio] could not start; the game will be silent:', error);
    return SILENT;
  }
}

async function buildHubAudio(
  scene: Scene,
  camera: Camera,
  player: Player,
  knight: Knight,
): Promise<HubAudio> {
  const audio = await createGameAudio();
  const bank = await loadSoundBank(audio);

  // The listener rides the camera, not the character: what the player hears should match what the
  // player sees, and the third-person camera sits several units behind the knight.
  audio.engine.listener.attach(camera);

  const loops: LoopHandle[] = [];
  const wind = bank.startLoop('ambience.wind');
  if (wind) loops.push(wind);
  const water = bank.startLoop('ambience.water', {
    position: new Vector3(POND.centreX, POND.surfaceY, POND.centreZ),
  });
  if (water) loops.push(water);

  const cadence = createFootstepCadence();
  let wasAirborne = player.airborne;
  let music: LoopHandle | null = null;
  let playingTrack: SoundCue | null = null;

  const observer = scene.onBeforeRenderObservable.add(() => {
    const elapsed = scene.getEngine().getDeltaTime() / 1000;
    const { airborne } = player;

    // Take-off and landing ride the edges of the same `airborne` flag the jump clip uses, rather
    // than a second reading of the ground probe. `groundContact.ts` exists because two consumers
    // deciding "is it grounded" independently drifted apart; sound and pose stay on one source.
    if (airborne !== wasAirborne) bank.play(airborne ? 'jump.takeoff' : 'jump.land');
    wasAirborne = airborne;

    const v = player.motion.velocity;
    const speed = Math.hypot(v.x, v.z);
    const { walk, run } = knight.animations;
    // The clip that is actually driving the pose, by blend weight. "Run is playing at all" is not
    // the same question: the cross-fade starts the run clip the moment speed passes walking, so for
    // the whole handover it is playing while the walk pose is still what is on screen — and the two
    // clips' phases are unrelated, so reading the wrong one puts the sound anywhere in the cycle.
    const running = weightOf(run) > weightOf(walk);
    const gait: Gait = speed <= WALK_THRESHOLD ? 'idle' : running ? 'run' : 'walk';
    const phase = running ? phaseOf(run) : phaseOf(walk);
    if (phase === null) {
      cadence.step({ gait: 'idle', phase: 0, airborne, elapsed });
      return;
    }

    const fall = cadence.step({ gait, phase, airborne, elapsed });
    if (!fall) return;
    // Two layers, one footfall: the armour on the character and the surface under it.
    bank.play('footstep.armour', { playbackRate: fall.playbackRate, gain: fall.volume });
    bank.play(surfaceCue('grass'), {
      playbackRate: fall.playbackRate,
      gain: fall.volume,
      variant: fall.foot === 'left' ? 0 : 1,
    });
  });

  return {
    setMusicScene(next) {
      const change = musicChange(playingTrack, next);
      if (!change) return;
      music?.stop();
      music = bank.startLoop(change.track);
      playingTrack = music ? change.track : null;
      if (music) {
        music.setVolume(0);
        music.setVolume(1, change.fadeSeconds);
      }
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      music?.stop();
      for (const loop of loops) loop.stop();
      bank.dispose();
      audio.dispose();
    },
  };
}
```

- [ ] **Step 2: Export the walk threshold from `knight.ts`**

`hubAudio` has to classify the gait with the *same* threshold `driveKnightAnimation` uses, or the
cadence is told "walking" on a frame the animation still calls idle. Export the existing constant
rather than copying its value — in `src/presentation/babylon/knight.ts`, line 876:

```ts
/** Planar speed above which the knight is at least walking (mirrors Godot's WalkAnimationThreshold). */
export const WALK_THRESHOLD = 0.6;
```

Change only the `export` keyword. The value stays 0.6.

- [ ] **Step 3: Wire it into the scene**

In `src/presentation/babylon/hubScene.ts`, add the import beside the other presentation imports:

```ts
import { createHubAudio, type HubAudio } from '../audio/hubAudio';
```

Add the field to the `HubScene` interface, after `knight`:

```ts
  /** Music, footsteps and ambience. `App.svelte` drives the music scene through this. */
  readonly audio: HubAudio;
```

After the `await loadTrees(scene, shadows);` line, construct it:

```ts
  const audio = await createHubAudio(scene, follow.camera, player, knight);
```

In `dispose`, before `engine.dispose()`:

```ts
    audio.dispose();
```

And add `audio` to the returned object:

```ts
  return { engine, scene, follow, player, knight, audio, suspendInput, dispose };
```

- [ ] **Step 4: Typecheck and run the suite**

```bash
pnpm typecheck
pnpm test
```

Expected: both green. No new tests here — this file is wiring, verified in-scene in Task 9.

Read `createHubAudio` once more before committing and satisfy yourself that **no path through it can
reject**: everything that awaits is inside the `try`, and the `catch` returns rather than rethrows.
That property is the whole reason the function is split in two, and it is not covered by any test.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/audio/hubAudio.ts src/presentation/babylon/hubScene.ts src/presentation/babylon/knight.ts
git commit -m "feat(audio): wire footsteps, jumps and ambience into the hub"
```

---

### Task 8: Music follows the game mode

**Files:**
- Modify: `src/app/App.svelte`

**Interfaces:**
- Consumes: `HubScene.audio` from Task 7.
- Produces: nothing.

- [ ] **Step 1: Start the intro music when the scene is ready**

In `src/app/App.svelte`, inside the `createHubScene(canvas).then((h) => { ... })` callback, after the existing `hub.suspendInput(...)` line:

```ts
      // The mode is already known by the time the scene finishes loading — SKIP can beat it — so ask
      // for the track that matches the current mode rather than assuming the intro is still running.
      hub.audio.setMusicScene(gameMode.isPlaying ? 'playing' : 'intro');
```

- [ ] **Step 2: Cross to the hub theme when the intro ends**

In `finishIntro()`, after `hub?.suspendInput(false);`:

```ts
    hub?.audio.setMusicScene('playing');
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (this includes `svelte-check`, which covers `App.svelte`).

- [ ] **Step 4: Commit**

```bash
git add src/app/App.svelte
git commit -m "feat(audio): cross from the AVG theme to the hub theme when the intro ends"
```

---

### Task 9: Verify in the scene and tune the mix

The DoD from spec §7. Everything before this was testable without ears; this is not.

**Files:**
- Modify: `src/presentation/audio/manifest.ts` (volumes only)
- Modify: `docs/superpowers/specs/2026-09-05-audio-system-design.md` (record the tuned values)

- [ ] **Step 1: Start the scene with the assets present**

```bash
git lfs pull
```

Start the preview with `preview_start`, click once to capture the mouse and unlock audio.

- [ ] **Step 2: Check the console is clean**

Use `read_console_messages`. Expected: no `[audio]` warnings. A warning here means a cue's file is missing or still an LFS pointer — fix that before tuning anything, or you will tune around a silent sound.

- [ ] **Step 3: Verify each DoD item, in order**

Walk (W), run (Shift+W), jump (Space) on flat ground, then near and away from the pond at (−15, −5). Confirm, and write down what you observe for each:

1. Footsteps fire in step with the visible feet, at **both** walk and run. If they are consistently half a step off, the two `footContact` phases are swapped between feet — that is a sign convention, not a re-measurement.
2. Nothing fires while airborne; take-off and landing each sound exactly once.
3. Repeated steps do not read as a machine gun.
4. Wind is audible across the field; water rises approaching the pond and is gone at distance.
5. The AVG theme plays over the intro and crosses to the hub theme once, when the intro ends.
6. Reload and confirm silence before the first click, sound after it.

- [ ] **Step 4: Tune the manifest volumes**

Adjust only the `volume` values in `manifest.ts`. Target: footsteps present but not dominant under the music; the grass layer heard as texture under the armour rather than as its own sound; the wind bed below everything; typing (checked in Task 10) quiet enough to survive a long conversation.

Re-run the scene after each change — Vite forces a full reload on any source edit (`vite.config.ts`), so the scene rebuilds with the new values.

- [ ] **Step 5: Confirm the beds have no audible seam**

Stand still with the music muted (`window.hub.audio` has no mute; instead set `music.hub`'s volume to 0 in the manifest temporarily) and listen to the wind for at least three loop lengths (24 s) and the water for four (24 s). Expected: no pulse or click at the 8 s / 6 s marks. The seams measure 0.02–0.14 dB against 0.36–0.41 dB of ordinary variation (spec §5.3), so anything audible here means the shipped file is not the one the tool produced — re-run `node tools/audio/preprocess.mjs`.

- [ ] **Step 6: Confirm the missing-asset path**

```bash
mv public/audio/sfx/armor_step.ogg /tmp/armor_step.ogg
```

Reload the scene. Expected: exactly one `[audio] cue "footstep.armour" unavailable` warning, the grass layer still audible on every step, jump and landing silent, **and the scene otherwise completely intact** — this is the check that audio cannot do what an unpulled knight GLB does. Then restore it:

```bash
mv /tmp/armor_step.ogg public/audio/sfx/armor_step.ogg
```

- [ ] **Step 7: Confirm the frame budget is unmoved**

Audio is not a GPU cost, but the per-frame wiring must not allocate. In the console:

```js
window.hub.scene.getEngine().getFps().toFixed(1);
```

Confirm the number is still at the vsync cap (~59–60) while walking and running. A drop here points at an allocation in the `onBeforeRenderObservable` callback — the `Vector3` for the pond emitter is built once at setup, and nothing in the per-frame path should allocate.

- [ ] **Step 8: Record the results in the spec**

Replace spec §5.5's "starting points to be tuned" paragraph with the tuned values and one line on what each was tuned against, and add the observed DoD results to §7. Keep it to what was measured.

- [ ] **Step 9: Commit**

```bash
git add src/presentation/audio/manifest.ts docs/superpowers/specs/2026-09-05-audio-system-design.md
git commit -m "fix(audio): tune the mix in-scene and record the verification"
```

- [ ] **Step 10: Open PR-1**

```bash
git push -u origin claude/new-feature-discussion-d7fe44
```

Then open the PR against `main` with `gh` (full path: `C:\Program Files\GitHub CLI\gh.exe`), titled `feat(audio): music, footsteps, ambience and the audio system`. The description covers: what ships, the phase-locking finding (spec §3.1), the missing-asset policy, the asset preprocessing tool, and that AVG/UI cue wiring is deliberately held back to PR-2.

**Note:** LFS upload needs Git Credential Manager to have had one interactive login on this machine. If the push fails on credentials, that is the cause.

---

### Task 10: AVG and UI cues — PR-2, blocked

**Blocked on `claude/ui-token-system` merging to `main`.** It owns every file this task edits; doing it earlier buys nothing and costs a three-way merge on files that are being restyled. Rebase onto `main` after that merge, then do this task.

**Files:**
- Modify: `src/presentation/dialogue/Line.svelte` (typing tick)
- Modify: `src/presentation/dialogue/Choices.svelte` (move and confirm)

**Interfaces:**
- Consumes: `SoundBank` via a module-level accessor added in this task.
- Produces: nothing.

- [ ] **Step 1: Expose the bank to the UI**

The dialogue components are not passed the scene. Add `SoundBank` to hubAudio's existing `soundBank` import (it currently imports only `loadSoundBank` and `LoopHandle`), then add at module scope:

```ts
/**
 * The running bank, for UI code that has no route to the scene.
 *
 * A module-level handle rather than prop-drilling the bank down through the AVG component tree: the
 * dialogue UI is mounted beside the canvas, not inside it, and there is exactly one bank per page.
 * `null` before the scene loads and after it is disposed, so every call site has to handle its
 * absence — which is the same "silence, never throw" contract the bank itself has.
 */
let current: SoundBank | null = null;
export const uiSounds = (): SoundBank | null => current;
```

Set `current = bank;` after the bank loads in `createHubAudio`, and `current = null;` in its `dispose`.

- [ ] **Step 2: Play a tick per revealed character**

In `Line.svelte`, find where the typewriter advances the revealed character count. Play one tick per character revealed, cycling the four variants:

```ts
  import { uiSounds } from '../audio/hubAudio';

  let tick = 0;
  // One tick per character, cycling the four variants so a line does not machine-gun one sample.
  const typed = () => uiSounds()?.play('ui.type', { variant: tick++ });
```

Call `typed()` at each character reveal. If the typewriter can reveal several characters in one tick (a fast-forward or SKIP), call it **once** for that batch — a burst of ticks on SKIP is the failure mode.

- [ ] **Step 3: Play move and confirm on the choices**

In `Choices.svelte`:

```ts
  import { uiSounds } from '../audio/hubAudio';
```

Play `ui.move` when the highlighted choice changes, and `ui.confirm` when one is selected:

```ts
  const moved = () => uiSounds()?.play('ui.move');
  const confirmed = () => uiSounds()?.play('ui.confirm');
```

- [ ] **Step 4: Typecheck and verify in the scene**

```bash
pnpm typecheck
```

Then run the scene and play the intro: expect a tick per character at a comfortable level, one move sound per highlight change, one confirm per selection, and **no burst on SKIP**.

- [ ] **Step 5: Commit and open PR-2**

```bash
git add src/presentation/audio/hubAudio.ts src/presentation/dialogue
git commit -m "feat(audio): sound the AVG typewriter and choices"
```

---

## Self-Review

**Spec coverage.** §2 architecture → Tasks 1–7 create exactly the files listed. §3.1 phase-locked cadence → Tasks 3 and 4. §3.2 two-layer footstep and rate jitter → Task 4 (`Footfall`) and Task 7 (the two `bank.play` calls). §3.3 director → Task 2, wired in Task 8. §3.4 mixer → Task 1. §4.1 engine and unlock → Task 5. §4.2 missing-asset policy → Task 6, verified in Task 9 Step 6. §4.3 wiring, `airborne` edges, spatial pond → Task 7. §5 assets → already committed in `3f450b3`; consumed by Task 6's manifest. §5.5 mix balance → Task 9 Steps 4 and 8. §6 tests → Tasks 1, 2, 4. §7 DoD → Task 9 Steps 3–7. §8 sequencing → Task 9 Step 10 (PR-1) and Task 10 (PR-2). §9 out of scope → nothing here builds a settings panel or a second surface.

**Gap found and closed:** §7's "no per-frame allocation" had no step; it is now Task 9 Step 7.

**Types.** `SoundCue`/`AudioBusId`/`SurfaceKind` defined in Task 1 and used unchanged in Tasks 2, 6, 7. `MixerLevels`/`busGain` defined in Task 1, consumed in Task 5. `Footfall.foot` produced in Task 4 and consumed in Task 7 to pick the grass variant. `GameAudio.buses` produced in Task 5, indexed by `spec.bus` in Task 6. `LoopHandle` produced in Task 6, used in Task 7 for both ambience and music. `HubAudio` produced in Task 7, consumed in Task 8 via `HubScene.audio`. `SoundBank` produced in Task 6, re-exported through `uiSounds()` in Task 10.
