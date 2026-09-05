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

**Amended after the first listen:** the two ambience beds are **shipped but not wired in** — see
§5.3a. Everything else stands.

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
Repetition is broken at play time, not in the asset: each footfall gets a random playback rate and
volume within a narrow band.

Take-off and landing get a **fixed** rate offset instead — up for the push-off, down for the landing.
Not a random band, because a jump is a single event and there is no repetition to break up; what there
is to solve is that the two are otherwise the same 0.145 s clip 1.6 dB apart, which reads as one sound
stuttering rather than as two ends of a jump. All three still read as the same armour.

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

Ambience *was* two things — a non-positional wind bed, and a **spatial** emitter at the pond — and
is currently wired to neither (§5.3a). What follows describes what the wiring does when it returns.

Ambience is two things: a non-positional wind bed, and a **spatial** emitter at the pond
(`POND` is (−15, −0.95, −5), radius 12 — `src/domain/hub/waterBody.ts`), so the water is audible near
the shore and gone across the field.

## 5. The assets

### 5.1 What the sources actually were

Nine files, supplied by the user. Measured before cutting, and three of them were not what their
names suggested:

| Source | Measured | Consequence |
| --- | --- | --- |
| `白い通り角.mp3` | VBR ~202 kbps, 48 kHz stereo, **2:14** | hub theme, copied verbatim |
| `AVGBG.mp3` | VBR ~204 kbps, 48 kHz stereo, **2:30** | AVG theme, copied verbatim |
| `armor-step.wav` | 0.145 s mono 44.1 kHz, one hit, −13.8 dBFS peak | the only armour sample; §3.2 |
| `Third-person_game_gr_#1…` | **Not discrete footsteps** — 2 s of continuous rustle with two sweeps, of unlike shape: the first has a real attack into a peak at 0.585 s, the second no attack at all, climbing 130 ms into a plateau at 1.32–1.40 s | cut into two soft surface layers, not percussive steps, each **cut on its energy rather than on where the rustle begins** (§5.4a) |
| `AVG_visual_novel_typ_#4…` | **18** separate ticks over 1.54 s, ~40 ms each | four of the best-isolated become the typing variants |
| `AVG_visual_novel_opt_#2…` | Attack at 0, but rings on for the full 2 s | trimmed to 0.3 s, or a menu move drones |
| `AVG_visual_novel_opt_#4…` | **Two** hits (0.00 s and 0.64 s) | first only, or one press sounds like two |
| `Open_grassland_wind__#2…` | 2 s with its **own** fade in and out; steady only 0.42–1.42 s | steady middle only, then rebuilt (§5.3) |
| `Natural_stream_water_#3…` | **1.0 s**, peak clipped at 0.0 dBFS | rebuilt and normalised well down |

### 5.2 Music is copied, not transcoded — and does not loop cleanly

Both tracks are already lossy MP3. Re-encoding them to Vorbis would add a second generation of
artefacts to spend roughly the same number of bytes, so they ship as-is.

**Two corrections to an earlier version of this section, both of which made the loop look better than
it is.** Their durations were read as 7:03 and 7:59 from the first frame header's 64 kbps; both files
are VBR at ~200 kbps, and the real durations are **2:14** and **2:30**. And the seam was described as
MP3 encoder padding, a couple of tens of milliseconds. It is not: both tracks have a **composed
ending**, so looping them jumps from a decayed tail back to a full-level opening.

Measured as RMS over the last and first half-second of each file:

| Track | final 0.5 s | first 0.5 s | step at the loop |
| --- | --- | --- | --- |
| `hub_theme` | −28.7 dB | −17.7 dB | **11 dB**, every 2:14 |
| `avg_theme` | −74.5 dB (silence) | −23.2 dB | **51 dB**, every 2:30 |

`hub_theme` is the one that matters: it plays for as long as the player is in the hub, so that jump
arrives every two and a quarter minutes. `avg_theme` only has to survive the intro dialogue, which is
shorter than one pass.

This is not something the code can fix on its own — a track with an ending has no loop point to find.
The options are to crossfade the tail into the head at playback (the machinery for it already exists in
`setMusicScene`, but it would need a second concurrent instance of the same streaming sound), to trim
each track to a musically-continuous loop region, or to replace them with loop-ready versions. Which
one is right depends on the music, so it is the user's call rather than this spec's.

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

### 5.3a …and they are shipped but switched off

**On the first listen both beds read as too repetitive, and they are no longer wired in.** That is
§5.3's stated limitation arriving exactly where it was predicted: three detuned layers of a one-second
stream is still one second of stream, and the ear finds the period whatever the loop point does. The
seams are genuinely inaudible — that part worked — but seamlessness was never the problem.

What was removed is only the wiring: `hubAudio` no longer starts either loop, and the two cue ids and
their manifest entries are gone, so nothing fetches or decodes them. **The assets, the recipe and the
credits stay** — `public/audio/ambience/` still holds both files and `tools/audio/preprocess.mjs` still
builds them.

Bringing ambience back is a small change on top of longer source recordings: re-run the tool, restore
the two `SoundCue` members and their manifest entries, and start the loops in `buildHubAudio` (the
pond emitter's position comes from `POND` in `src/domain/hub/waterBody.ts`). **Do not restore the
wiring without new sources** — the code was never the problem, and the same one-second stream will
sound the same way again.

The `ambience` mixer bus and its `AudioBusId` member are deliberately kept: the bus is part of the
mix model a settings panel will bind to (§3.4), and it is what ambience will route through when it
returns. It currently carries nothing.

### 5.4 What ships

Encoded Vorbis q4, all one-shots peak-normalised to −3 dBFS so the mix balance lives in the manifest
and re-cutting one sound cannot silently change the others.

| File | Size | Detail |
| --- | --- | --- |
| `music/hub_theme.mp3` | 3308 KB | copied |
| `music/avg_theme.mp3` | 3741 KB | copied |
| `sfx/armor_step.ogg` | 5.3 KB | 0.145 s mono |
| `sfx/footstep_grass_01.ogg` / `_02.ogg` | 6.0 / 5.9 KB | 0.235 / 0.220 s mono |
| `sfx/ui_type_01..04.ogg` | 4.4–4.5 KB | 0.060 s mono |
| `sfx/ui_move.ogg` | 6.5 KB | 0.300 s mono |
| `sfx/ui_confirm.ogg` | 8.2 KB | 0.450 s mono |
| `ambience/wind_field.ogg` | 131 KB | 8 s stereo, seamless — **shipped, not wired (§5.3a)** |
| `ambience/water_pond.ogg` | 57 KB | 6 s mono (spatial ⇒ mono), seamless — **shipped, not wired** |

SFX and ambience total **≈ 238 KB**; the two music tracks are 6.9 MB. `*.mp3` and `*.ogg` join the
LFS-tracked extensions in `.gitattributes`.

Everything spatial is mono: a stereo buffer cannot be panned.

### 5.4a The two footstep layers have to *start* together

**Heard in play: the grass layer arrived noticeably after the armour.** Both cues are played on the
same frame, so the delay was entirely in the assets — the cuts had been aligned to where each rustle
sweep begins, not to where its energy is, leaving a silent-ish run-up inside the clip.

Measured on the shipped files, as the time from the file's start to the point it reaches 12 dB below
its own peak:

| | onset, first cut | onset, corrected | energy peak, first cut | energy peak, corrected |
| --- | --- | --- | --- | --- |
| `armor_step` (the reference) | 5 ms | 5 ms | 40 ms | 40 ms |
| `footstep_grass_01` | 25 ms | **0 ms** | 85 ms | **40 ms** |
| `footstep_grass_02` | 55 ms | **0 ms** | 245 ms | **95 ms** |

The second was the audible offender: a quarter of a second is far past the window in which two sounds
fuse into one event, so it read as a separate noise after the step rather than as the ground under it.

**Onset is the thing to align, not the peak.** `footstep_grass_02` still peaks at 95 ms against the
armour's 40, because that is the shape of the material — it is a scuff, not an impact, and it has no
attack to move. With the onsets together it reads as the surface continuing under the armour, and the
difference in shape is what makes the two variants sound unlike each other, which is why there are
two. Their fade-ins are 3 ms rather than the 10 ms used elsewhere, for the same reason: long enough to
stop a mid-signal cut clicking, short enough not to put the delay back.

Re-cut any future surface layer against this table. A surface sound whose onset is more than about
20 ms behind the armour's will be heard as late.

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

This list splits into what a machine can establish and what needs a person with speakers and a
rendering window. The Task 9 in-scene pass ran with the browser pane hidden, which starves
`requestAnimationFrame` — the scene's promise-driven loads still complete, but no frame ever renders,
so nothing that depends on the game actually running (walking, jumping, elapsed real time) could be
exercised. Each item below is marked with what was actually established, not a summary judgement.

- **Verified** — `pnpm test` green, including the cases in §6: 25 test files, 156 tests, all passing.
- **Unverified (listening + a rendering scene)** — walking and running producing footsteps in step
  with the visible feet at both gaits; nothing firing while airborne; take-off and landing each
  sounding once. `footstepCadence`'s airborne/landing rules are unit-tested in isolation (§6), but
  whether the sound lands with the visible foot needs eyes and ears on a running scene.
- **Unverified (listening)** — repeated steps not reading as a machine gun. The playback-rate jitter
  exists in code; how it sounds was not and could not be judged here.
- **Partially verified, with a correction to this item's own wording** — in the live scene,
  `setMusicScene('intro')`, a repeated `setMusicScene('intro')`, then `setMusicScene('playing')` all
  completed with no throw. That confirms the director's idempotent (`null`) result is actually acted
  on — the repeated call did not restart the intro track — but it does not demonstrate an
  overlapping-ramp guard: AudioV2 does not throw when a volume ramp is requested while another is
  already in progress (it silently cancels the in-flight ramp and replaces it, see `soundBank.ts`'s
  `LoopHandle.setVolume`), so this call sequence exercised the ramp path and would not have thrown
  either way. **Unverified (listening)**: that the AVG intro actually starts `avg_theme`, that
  finishing the intro triggers the crossfade in real play (rather than a direct call), and that the
  crossfade sounds like a fade rather than a cut.
- **Moot, and the reason is now known** — the wind bed audible across the field, the water audible
  near the pond and gone at distance, and neither bed having an audible seam. Both beds were listened
  to after this record was first written and **both read as too repetitive**, so neither is wired in
  any more (§5.3a). The seam was never the problem; the one-second and two-second sources are. These
  items return only with longer recordings, and would need re-verifying then.
- **Verified, with a correction to this item's own wording** — removing `public/audio/sfx/armor_step.ogg`
  and reloading produced **three** `[audio] cue "…" unavailable` warnings, not one:
  `footstep.armour`, `jump.takeoff` and `jump.land` all warned, because the manifest (§5, `manifest.ts`)
  maps all three cue ids to that single file — one warning per affected cue id, not one per file. No
  `[audio] could not start` appeared (the graph still built), no other cue warned (the other eight
  manifest entries loaded and decoded fine), and `window.hub` / `window.hub.audio` were still present
  after the reload — the scene stayed intact. Restoring the file and reloading again produced zero
  `[audio]` warnings. The resilience property this item is really after — one missing asset cannot take
  down the graph or silence anything else — holds; "leaves one console warning" only holds for a cue
  whose file backs no other cue.
- **Unverified (listening, and needs a user gesture to test against)** — silent before the first
  gesture, correct after it.
- **Not established** — the mix balance. Every `volume` in `manifest.ts` is still §5.5's untuned
  starting point; tuning them needs a running scene and ears, and was explicitly out of scope for this
  pass.
- **Partially verified by static read, not measurement** — `hubAudio.ts`'s `onBeforeRenderObservable`
  callback allocates a small options object literal on *every* frame for the `cadence.step({...})`
  call (both the early-return `{ gait: 'idle', phase: 0, airborne, elapsed }` branch and the normal
  `{ gait, phase, airborne, elapsed }` branch), not only on an actual footfall — so "no per-frame
  allocation in the wiring" does not hold literally, though the allocation is a small, short-lived
  object and its actual cost was not measured. `bank.play(...)`'s options objects are allocated only on
  a footfall, not every frame. **Unverified**: frame budget / frame rate itself, since the hidden pane
  never renders a frame to measure.

None of the above changes §5.5: the per-cue volumes remain starting points to be tuned in-scene, not
measurements.

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
- **Re-recording the ambience sources.** The real fix for §5.3's residual repetition, and now the
  precondition for wiring ambience back in at all (§5.3a).

## 10. Asset provenance

`public/audio/CREDITS.md` records where each source came from and under what licence. The entries are
the user's to fill: the six AI-generated SFX and the two music tracks were supplied from outside the
repo, and their terms are not derivable from the files. **This must be complete before any public
release**, and is not a blocker for merging.
