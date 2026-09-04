# Audio System — Design

**Date:** 2026-09-05
**Status:** Approved (design); assets preprocessed and committed, implementation pending
**Predecessors:** M1 hub parity, M2 AVG dialogue, M4/P1–P3 (terrain, map scale-up, run+jump, lighting,
water & landmarks)

## 1. Framing

The project has shipped four milestones without a single sound. This adds the first audio: music,
character footsteps, ambience, and AVG/UI cues.

It is **not** one of M4's four phases. It is an independent track, in the same sense the run+jump
movement pass was — it neither blocks nor depends on P4 (life & motion), and it was picked precisely
because it barely touches the files the two in-flight branches own (§8).

**Scope:** BGM, character movement SFX, ambience, and AVG/UI cues. **Out:** a volume settings panel
and its persistence (§9).

## 2. Architecture

The project's non-negotiable split applies unchanged: a pure `src/domain/` core decides *what should
be heard*, and a thin `src/presentation/` layer makes noise.

```
src/domain/audio/          pure, Vitest-covered
  soundCue.ts        the cue vocabulary
  footstepCadence.ts clip phase -> footfall events
  musicDirector.ts   game state -> desired track
  audioMixer.ts      per-bus gain from volumes + mute
src/presentation/audio/    thin
  audioEngine.ts     AudioV2 engine, three buses, first-gesture unlock
  manifest.ts        cue -> file(s), bus, volume, loop, spatial
  soundBank.ts       loading, and the missing-asset policy
  hubAudio.ts        the per-frame wiring; the only file that touches the scene
public/audio/{music,sfx,ambience}/
tools/audio/preprocess.mjs  the source -> shipped-asset recipe
```

**No new dependency.** `@babylonjs/core` 9.21 already ships **AudioV2**
(`AudioV2/webAudio`, `AudioV2/abstractAudio`): engine, buses, static and streaming sounds, spatial
audio, volume ramping, and `unlockAsync`. Everything below is built on it.

## 3. The domain

### 3.1 `footstepCadence` — phase-locked, not distance-accumulated

**The obvious design is wrong here, and the reason is worth recording.** The natural way to drive
footstep audio is to accumulate travelled distance and fire a step every stride length, so the step
rate scales with speed for free. **That desynchronises from the visible feet in this project**,
because `driveKnightAnimation` starts the locomotion clips with `group.play(true)` and never sets
`speedRatio`: Idle/Walk/Run are cross-faded **by weight only** and each plays at its authored rate no
matter how fast the body is moving. The visible cadence is therefore fixed — Walk's cycle is 1.033 s
and Run's is 0.633 s (measured in `2026-08-20-run-jump-movement-design.md` §4) — while a
distance-driven cadence would rise continuously with speed and slide out of phase with the feet
within a stride.

(This is the audible face of a trade the project already made deliberately: the walk clip's natural
ground speed is ~1.1 u/s and the game walks at 4, accepting foot-slide for a map that does not feel
enormous. Audio locks to the animation, which is what the player sees.)

So the cadence machine is **locked to the dominant locomotion clip's phase**:

- Input per frame: the dominant gait (`idle | walk | run`), that clip's normalised phase in `[0, 1)`,
  the previous phase, and `airborne`.
- It fires when the phase crosses one of that gait's **contact phases** — two per cycle, one per
  foot — handling the wrap at 1 → 0.
- **Contact phases are measured from the shipped GLB, not guessed**: sample the toe bones' height
  over one cycle of each clip and take the minima, the same method that produced the stride table.
  The implementation plan owns that measurement; the constants ship with their table, as the rest of
  this codebase's tuned constants do.
- `airborne` suppresses firing and clears the crossing state, so landing cannot dump a step that was
  "owed" from mid-air.
- A gait change re-seeds the phase state rather than comparing across clips — the walk and run clips
  have unrelated phases, and a raw comparison across a blend would fire spuriously.
- A minimum interval guard (shorter than the fastest real cadence) absorbs the double-fire a
  walk↔run handover can otherwise produce.

It emits `{ cue, foot }` — not audio. One footfall produces **two** cues (§3.2).

### 3.2 The footstep is two layers

The armour and the ground are separate sounds, because that is what the assets are: one armour
sample bound to the character, and a grass surface sound. A footfall plays `footstep.armour` plus
the current surface's cue, together. Grass is the only surface today; the cue id carries the surface
so a stone plaza or shallow water is a manifest entry rather than a redesign.

**There is exactly one armour sample**, and it has to serve walking, running, take-off and landing.
Repetition is broken at play time, not in the asset: each instance gets a random playback rate and
volume within a narrow band. Take-off and landing use the same sample with their own bands, so all
three read as the same armour.

The randomness is injected (`random: () => number`), so the cadence and its jitter stay pure and
testable with a stub. It deliberately does **not** use a seeded generator: footstep variation has no
reason to be reproducible, and `src/domain/math/rng.ts` is a file the P4 branch is adding — taking a
dependency on it would manufacture a merge conflict for nothing.

### 3.3 `musicDirector`

A state machine from game state to the desired track: `intro` → `avg_theme`, `playing` →
`hub_theme`. It reports only what *should* be playing; the presentation diffs that against what *is*
and crossfades. Extending it to per-game-mode tracks later is a new case, not a new design.

### 3.4 `audioMixer`

`master`/`music`/`sfx`/`ambience` in `[0, 1]` plus a mute flag → the effective gain per bus. Small,
but it is the thing a settings panel will bind to later, and it is easier to get right with tests
than through a slider.

## 4. The presentation

### 4.1 `audioEngine`

`CreateAudioEngineAsync` plus three buses (music / sfx / ambience). Browsers block audio until a user
gesture; the game already requires a click to capture the mouse, and the AVG intro is click-driven,
so `unlockAsync()` hangs off that same first gesture. Before it resolves the game is silent and
raises nothing.

### 4.2 `soundBank` and the missing-asset policy

**A missing or unreadable audio file warns once and plays silence. It never throws, and never
rejects a promise.** This is not defensive habit, it is a specific lesson this repo has already
written down: `loadKnight` rejects when the knight GLB is an unpulled LFS pointer, `App.svelte` calls
it with `.then()` and no `.catch`, and the result is an unhandled rejection and a blank canvas — a
missing texture takes down the whole scene. Audio must not add a second instance of that. It also has
a practical payoff: the system is verifiable and mergeable before every asset is final, and a
contributor without `git lfs pull` gets a quiet game rather than a broken one.

### 4.3 `hubAudio`

The only file that touches the scene. Per frame it reads the knight's gait, clip phase and `airborne`
and plays what the cadence machine returns.

Jump take-off and landing fire off the **edges of the same `airborne` flag the animation uses** —
not off a second reading of the ground probe. `groundContact.ts` exists precisely because two
consumers deciding "is it on the ground" independently drifted into disagreeing; sound and pose stay
on one source for the same reason.

Ambience is two things: a non-positional wind bed, and a **spatial** emitter at the pond
(`POND` is (−15, −0.95, −5), radius 12 — `src/domain/hub/waterBody.ts`), so the water is audible near
the shore and gone across the field.

## 5. The assets

### 5.1 What the sources actually were

Nine files, supplied by the user. Measured before cutting, and three of them were not what their
names suggested:

| Source | Measured | Consequence |
| --- | --- | --- |
| `白い通り角.mp3` | 64 kbps, 48 kHz stereo, 7:03 | hub theme, copied verbatim |
| `AVGBG.mp3` | 64 kbps, 48 kHz stereo, 7:59 | AVG theme, copied verbatim |
| `armor-step.wav` | 0.145 s mono 44.1 kHz, one hit, −13.8 dBFS peak | the only armour sample; §3.2 |
| `Third-person_game_gr_#1…` | **Not discrete footsteps** — 2 s of continuous rustle with two sweeps (transients at 0.570 s, 1.205 s) | cut into two soft surface layers, not percussive steps |
| `AVG_visual_novel_typ_#4…` | **18** separate ticks over 1.54 s, ~40 ms each | four of the best-isolated become the typing variants |
| `AVG_visual_novel_opt_#2…` | Attack at 0, but rings on for the full 2 s | trimmed to 0.3 s, or a menu move drones |
| `AVG_visual_novel_opt_#4…` | **Two** hits (0.00 s and 0.64 s) | first only, or one press sounds like two |
| `Open_grassland_wind__#2…` | 2 s with its **own** fade in and out; steady only 0.42–1.42 s | steady middle only, then rebuilt (§5.3) |
| `Natural_stream_water_#3…` | **1.0 s**, peak clipped at 0.0 dBFS | rebuilt and normalised well down |

### 5.2 Music is copied, not transcoded

Both tracks are already 64 kbps MP3. Re-encoding them to Vorbis would add a second generation of
lossy artefacts to spend roughly the same number of bytes, so they ship as-is. That accepts MP3's
encoder-padding gap at the loop point — but on a 7-to-8 minute track that seam arrives once per
seven minutes, which is a different order of problem from the same seam on a one-second ambience
clip.

### 5.3 The ambience beds are built, not trimmed

Neither ambience source can be looped directly: 1–2 s of broadband noise on repeat is heard as a
pulse at the loop rate. `tools/audio/preprocess.mjs` sums three copies of the source read cyclically
at different rates and offsets, which decorrelates them and averages out the source's own loudness
contour.

**The loop point needs no crossfade.** The rates are quantised so each layer advances a whole number
of source lengths across the output and returns to its starting phase, making `out[n] === out[0]` by
construction. The first cut used a 0.5 s equal-power crossfade of the tail onto the head instead and
left a 1.9 dB level step at the seam; lengthening it to 1.5 s made it **worse** (2.1 dB), because
equal-power assumes the two sides are uncorrelated and here they are the same material at an offset.
Quantised rates measure **0.02 dB and 0.14 dB** on the wind's two channels, against interior 50 ms
steps of 0.36–0.41 dB median — the seam is now quieter than the material's own variation.

Each layer still splices hard where it wraps past the end of the source. **Measured, and it does not
surface:** across both finished beds the largest single-sample jump is 1.44–1.56× the 99.9th
percentile of ordinary jumps, with no outlier above 3× anywhere — one layer's step, at `1/sqrt(3)`
gain and under two other layers still running, stays inside the noise's own variation. All figures
are measured after the Vorbis round trip, which is the shipped path.

**The repetition is reduced, not removed.** Three detuned layers of one second of stream is still one
second of stream. Replacing the two ambience sources with longer recordings is the only real fix, and
re-running the tool is the whole cost of doing it.

### 5.4 What ships

Encoded Vorbis q4, all one-shots peak-normalised to −3 dBFS so the mix balance lives in the manifest
and re-cutting one sound cannot silently change the others.

| File | Size | Detail |
| --- | --- | --- |
| `music/hub_theme.mp3` | 3308 KB | copied |
| `music/avg_theme.mp3` | 3741 KB | copied |
| `sfx/armor_step.ogg` | 5.3 KB | 0.145 s mono |
| `sfx/footstep_grass_01.ogg` / `_02.ogg` | 7.0 / 7.1 KB | 0.350 s mono |
| `sfx/ui_type_01..04.ogg` | 4.4–4.5 KB | 0.060 s mono |
| `sfx/ui_move.ogg` | 6.5 KB | 0.300 s mono |
| `sfx/ui_confirm.ogg` | 8.2 KB | 0.450 s mono |
| `ambience/wind_field.ogg` | 131 KB | 8 s stereo, seamless |
| `ambience/water_pond.ogg` | 57 KB | 6 s mono (spatial ⇒ mono), seamless |

SFX and ambience total **≈ 240 KB**; the two music tracks are 6.9 MB. `*.mp3` and `*.ogg` join the
LFS-tracked extensions in `.gitattributes`.

Everything spatial is mono: a stereo buffer cannot be panned.

### 5.5 Mix balance

Per-cue volumes in the manifest are **starting points to be tuned in-scene**, not measurements — the
sources were normalised to a common peak, which equalises their level but not their loudness or their
role. The grass layer starts well under the armour layer, and the typing tick starts lowest of all
because it is the most frequently repeated sound in the game. The plan's verification step tunes them
against the running scene and records the result.

## 6. Testing

Pure, so unit-tested rather than debugged in the browser:

- **`footstepCadence`** — fires at the measured contact phases; handles the 1 → 0 wrap; fires nothing
  while `airborne`, and does not fire a stored step on landing; re-seeds across a gait change instead
  of comparing phases across clips; the minimum-interval guard absorbs a walk↔run double-fire; a
  frame long enough to span a whole cycle (a tab switch, a hitch) fires **at most one** step rather
  than a burst.
- **`musicDirector`** — intro → playing changes track exactly once, and is idempotent while the state
  holds.
- **`audioMixer`** — mute overrides everything, values clamp, master multiplies.

## 7. Definition of done

- `pnpm test` green, including the cases above.
- Walking and running produce footsteps **in step with the visible feet** at both gaits; nothing fires
  while airborne; take-off and landing each sound once.
- Repeated steps do not read as a machine gun (the one armour sample is jittered).
- The AVG intro plays `avg_theme`; finishing it crossfades to `hub_theme`, once.
- The wind bed is audible across the field; the water is audible near the pond and gone at distance.
- Neither ambience bed has an audible seam over several minutes.
- **Deleting any one audio file leaves one console warning, every other sound working, and the scene
  intact.**
- Silent before the first gesture, correct after it.
- Frame budget unchanged — audio is not a GPU cost, but confirm no per-frame allocation in the wiring.

## 8. Sequencing, and staying out of the way

Two branches are in flight: `claude/ui-token-system` owns `src/app/*.css`, `main.ts` and
`src/presentation/dialogue/*.svelte`; `claude/p4-life-and-motion` owns
`src/presentation/babylon/{scatter,trees,clouds,wind,hubScene}.ts` and `src/domain/hub/*`.

- **PR-1 — the system and the hub wiring.** All new files, plus exactly one import, one
  `createHubAudio(...)` and one dispose line in `hubScene.ts` — a trivial rebase against P4.
- **PR-2 — AVG and UI cues.** Touches `src/presentation/dialogue/*.svelte`, so it lands **after** the
  UI token branch merges. The cues, the assets and the manifest entries all ship in PR-1; only the
  call sites wait.

## 9. Out of scope

- **A volume settings panel and its persistence.** `audioMixer` gives it a tested model to bind to,
  but menus and save/load remain deferred, and the UI files are contended right now.
- **Per-surface footsteps beyond grass.** The cue id carries the surface; there is one surface sound.
- **Ambient creature sounds** (birds, insects) — P4's territory.
- **Re-recording the ambience sources.** Noted as the real fix for §5.3's residual repetition.

## 10. Asset provenance

`public/audio/CREDITS.md` records where each source came from and under what licence. The entries are
the user's to fill: the six AI-generated SFX and the two music tracks were supplied from outside the
repo, and their terms are not derivable from the files. **This must be complete before any public
release**, and is not a blocker for merging.
