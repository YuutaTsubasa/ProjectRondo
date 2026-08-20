# M4 · Run + Jump Movement (Design)

**Date:** 2026-08-20
**Status:** Implemented (see §11 for what implementation changed)
**Milestone:** M4 Refined Hub World — run/jump movement pass (roadmap
`2026-08-18-refined-hub-world-roadmap.md` §7b·B; the "gated on downloaded anims" track)
**Predecessors:** M1 hub web parity (Idle/Walk pipeline), map scale-up (PR #21)

## 1. Goal & context

The knight can only walk. The roadmap gates a **run** ability and a **jump** ability on the user
supplying retargetable animations; they have now arrived as Mixamo clips (`Running.fbx`, `Jump.fbx`).
This pass delivers three things:

1. **Assets** — retarget both clips onto the knight through the existing Godot pipeline and ship them
   in `knight_web.glb` alongside Idle/Walk.
2. **Gameplay** — a sprint speed behind a held modifier, and a jump that is already half-built in the
   domain (`jumpSpeed: 9` exists and is wired; nothing triggers it visually).
3. **Foot planting** — fold in the long-standing *slight foot-float on flat ground* (roadmap §7b·B
   explicitly parks it here, because the proper fix touches the same animation layer).

The domain change is small and pure; most of the work is the asset pipeline and the animation
blending in `knight.ts`.

## 2. Source clips — what actually arrived

Both are Mixamo **in-place** clips (`mixamorig:*` skeleton, T-pose rest, Z-up, ~1.6 m rig) with **no
root motion** — exactly what this controller wants, since the capsule is moved by physics and the
knight is a visual child of it.

| Clip | Frames @30 fps | Duration | Shape |
| --- | --- | --- | --- |
| `Running.fbx` | 20 (last duplicates first) | 0.633 s after trim | seamless run cycle |
| `Jump.fbx` | 66 | 2.167 s | one-shot: stand → crouch → launch → apex → land → recover |

The knight rig is Character Creator (`CC_Base_*`, 101 joints) whose 23 principal bones were renamed to
Godot's humanoid profile by the existing import retarget. Mixamo's 23 humanoid bones map onto those
one-for-one, so the clips ride the same path Idle/Walk already took.

## 3. Asset pipeline — reuse, do not reinvent

Unchanged chain (README §"regenerating the knight GLB"):

```
Mixamo FBX → Godot import retarget (mixamo_humanoid BoneMap) → extract_anims.gd → KnightAnims.res
           → export_web_glb.gd → __prototype__/knight_web.glb → gltf-transform resize+webp
           → public/models/knight_web.glb
```

Three deltas, all minimal:

- **`extract_anims.gd`** gains `Run` → `Running.fbx` and `Jump` → `Jump.fbx` in `SRC`, and a
  `NON_LOOPING` list so **Jump exports as `LOOP_NONE`** while every cycle clip stays `LOOP_LINEAR`.
  The existing −5° thigh adduction (the model's wide A-stance correction) applies to all four clips —
  it corrects the *model*, not the clip.
- **`.import` files** for the two new FBX carry the same `_subresources` bone_map block as
  `Walking.fbx.import`; every other import parameter already matches Godot's defaults.
- Nothing else changes. `export_web_glb.gd` picks up whatever the library holds.

**Reproduction was verified before adding anything:** re-running the untouched pipeline on Godot
**4.7.2** (4.7.1 is what the original machine used) reproduced the shipped Idle/Walk animation data to
within 3.3e-23 — bit-identical modulo denormals — with identical node/mesh/joint counts, and the final
GLB came out within 0.004 % of the shipped byte size. The pipeline is therefore safe to re-run on this
machine and this Godot.

### Environment notes for the next machine

- `pnpm dlx @gltf-transform/cli …` (the README recipe) **fails on Windows** — pnpm's hard-linked store
  breaks the CLI's own peer resolution. Install the CLI into a scratch dir with npm instead.
- `@gltf-transform/cli@4.4.2` pulls `sharp@0.35.x` transitively via `ndarray-pixels`, which errors with
  `colourspace: parameter space not set` on this libvips. **Pin `sharp` to `0.34.5`** (the version the
  CLI itself declares) and the resize step works.
- Godot's asset cache can silently serve a stale import: after editing a `.import` file, delete
  `.godot/imported/<name>.fbx-*` before re-importing, or the bone renaming appears not to apply.

## 4. Domain — run speed

`MovementConfig` gains **`runSpeed`**; `MovementInput` gains **`runRequested: boolean`**. `step` picks
`runRequested && direction ≠ zero ? runSpeed : maxSpeed` as the planar target. Nothing else in the
domain changes: acceleration/deceleration, gravity and the jump path are untouched, and `runRequested`
while standing still is a no-op (there is no in-place sprint).

**Choosing `runSpeed = 8`.** Measured from the shipped GLB, the toe's fore-aft excursion relative to
the hips (≈ stride length, in model units) is:

| Clip | stride | cycle | stride/cycle |
| --- | --- | --- | --- |
| Walk | 0.566 | 1.033 s | 0.548 |
| Run | 0.680 | 0.633 s | 1.074 |

Run covers **1.96×** the ground per second that Walk does, so matching the existing walk feel means
`runSpeed ≈ 2 × maxSpeed = 8`.

> **Known trade-off, inherited not introduced.** Taken literally, the walk cycle's natural ground speed
> at the knight's display scale is ~1.1 u/s, but the game walks at 4 — the project deliberately traded
> physical accuracy for a map that does not feel enormous (see `movementConstants.ts`: "12 made the
> walk animation foot-slide; ~4 reads as a brisk walk"). `runSpeed = 8` keeps run's foot-slide ratio
> *identical to walk's* rather than making it worse. Retuning both together is out of scope here.

## 5. Input — the sprint modifier

**Shift** (either side) held = run. `input.ts` adds `shift` to `GAME_KEYS` (so the browser does not act
on it) and exposes `isRunHeld()`, mirroring the existing held-key pattern rather than the
`consumeJump()` edge-trigger pattern — sprint is a state, not an event.

## 6. Animation — blending four clips

### Locomotion: one scalar

Idle/Walk/Run is a single **locomotion parameter** `L ∈ [0, 2]` driven by planar speed, extending the
existing scalar cross-fade rather than replacing it with a state machine:

- `L = 0` idle · `L = 1` walk · `L = 2` run
- target `L` from speed: `0` below `WALK_THRESHOLD` (0.6), ramping `1 → 2` between `maxSpeed` and
  `runSpeed`
- `L` eases at the existing `BLEND_PER_SECOND` (1/0.2 s); the two clips bracketing `L` get weights
  `1-frac` / `frac`, and **any clip not contributing is stopped, not zero-weighted** — the existing
  code documents that a zero-weight clip still bleeds motion into the pose, and that stays true here.

### Jump: a segmented one-shot over the top

The clip is 2.167 s but only its middle is airborne. Measured hip-height phases:

| Phase | clip time | what happens |
| --- | --- | --- |
| stand | 0.00 – 0.20 s | idle stance (unused) |
| crouch | 0.20 – 0.54 s | anticipation (unused — the game's jump is instantaneous) |
| **launch → apex** | **0.54 – 1.05 s** | hips 0.72 → 1.24 |
| **fall** | **1.05 – 1.30 s** | hips descend, feet reach for the ground |
| **land + absorb** | **1.30 – 1.75 s** | touchdown, knees absorb |
| recover | 1.75 – 2.17 s | back to stance (unused — locomotion takes over) |

The airborne span (0.54 – 1.30 s ≈ **0.76 s**) is almost exactly the game's flat-ground airtime
(`2 × jumpSpeed / gravity = 2 × 9 / 24 = 0.75 s`), so the clip plays at speed ratio 1 with no
retiming:

- **on takeoff** — play `launch → fall` once, non-looping. If the player is still airborne when it
  ends (a fall off a slope), the group holds its last pose, which is the reaching-for-ground pose.
- **on touchdown** — play `land + absorb` once, then cross-fade back to locomotion.
- jump weight rises to 1 over ~0.1 s (faster than the 0.2 s locomotion blend — a jump should read as
  immediate) and falls back after the landing segment.

Airborne/grounded comes from the domain's `isGrounded`, which `playerController` already computes and
feeds through `motion`.

### Root-bone neutralisation applies to all four

`neutralizeRootBoneRotation` must run on Run and Jump too — the retarget bakes the same bogus
`RL_BoneRoot` reorientation into every clip. `dampenSwayTowardMean` stays **idle-only**; damping a run
or a jump would flatten exactly the motion we want.

## 7. Foot planting

Two defects, one of which the jump *forces* us to fix:

1. **The terrain re-anchor fights the jump (blocking).** `knight.ts` currently re-anchors the visual
   root every frame to `terrainHeight(x, z)` under the player, to stop the knight floating when the
   capsule rides a slope. Airborne, that subtracts the entire jump height — the capsule would fly while
   the knight stayed glued to the ground. **The re-anchor must apply only while grounded**, easing out
   over the takeoff blend so there is no visible pop.
2. **Constant-fudge sole clearance (the roadmap's foot-float).** Seating measures the *foot bones* and
   then adds a hand-tuned `FOOT_CLEARANCE = 0.14` because the shoe mesh extends below the bones. The
   fudge is close but not exact, which is the residual float on flat ground. Replace it by measuring
   the **actual lowest skinned vertex** of the posed knight once, at the same moment the existing
   seating pass runs, so the offset is derived rather than guessed.

Full two-bone foot IK (which would also plant feet across a slope's pitch) stays **out of scope** —
it is a rig-level change with its own risk, and neither defect above needs it.

## 8. Testing

- **Domain (Vitest, TDD):** `runSpeed` is the planar target when `runRequested` and a direction is
  held; `maxSpeed` when it is not; run does not change deceleration, gravity, or the jump path; run
  with no direction is a no-op.
- **Presentation (in-browser, per project convention):** run/walk/idle cross-fade at the right speeds;
  jump plays its segments and lands cleanly; the knight leaves the ground with the capsule; feet sit on
  flat ground with no visible gap and no sinking.
- **Regression:** the rebuilt GLB's Idle/Walk animation data must still match the previously shipped
  data (already verified for the baseline; re-check after adding the clips).

## 9. Out of scope

- Foot IK / slope-aware foot planting.
- Retuning walk/run speed against true stride length (would change the whole game's pacing).
- Air control tuning, double jump, jump-height variation by hold time.
- Run stamina, or any UI for it.

## 10. Modules touched

| Module | Change |
| --- | --- |
| `__prototype__/tools/extract_anims.gd` | `Run`/`Jump` sources; per-clip loop mode |
| `__prototype__/Assets/Animations/{Running,Jump}.fbx(+.import)` | new LFS assets + bone_map |
| `public/models/knight_web.glb` | rebuilt with four clips |
| `src/domain/hub/character/movementConfig.ts` · `movementConstants.ts` | `runSpeed` |
| `src/domain/hub/character/movementInput.ts` · `characterMovement.ts` | `runRequested` → planar target |
| `src/presentation/babylon/input.ts` | Shift → `isRunHeld()` |
| `src/presentation/babylon/playerController.ts` | pass `runRequested`; expose grounded |
| `src/presentation/babylon/knight.ts` | four clips, locomotion scalar, jump segments, foot planting |
| `src/presentation/babylon/hubScene.ts` | wire grounded into `driveKnightAnimation` |
| `README.md` · `docs/HANDOFF.md` | pipeline env notes (npm/sharp pin, import-cache gotcha) |

## 11. What implementation changed

Three things only measurement could have told us. All are in the shipped code; the design above is
otherwise unchanged.

**The grounded signal had to change.** §6 assumed `motion.isGrounded` was usable. It is not: it is
`supported && !ascending`, and because the domain is fed the *post-solve* velocity, that velocity
points up for most of an uphill walk — measured **0 grounded frames out of 12** while simply walking
forward. Driving the jump clip and the foot plant from it froze the knight mid-stride. `Player` now
also exposes **`isSupported`** (the raw probe) and **`justJumped`** (true on the frame the domain
accepted a jump), and the animation layer reads those.

**Landing needs a cleared-ground guard.** For the first few frames of a jump the support probe still
reports SUPPORTED — the capsule has not physically risen clear yet. Without a guard the jump ended one
frame after it began, re-planting the feet and pinning the knight to the ground for the first **0.23 s**
of a 0.43 s ascent, followed by a snap. The air phase now waits for the probe to let go once before it
will accept a landing, mirroring `playerController`'s ascending guard.

**The uncommanded-fall grace is 0.2 s, not 0.08 s.** At run speed the capsule genuinely skips off the
terrain's crests: over three seconds of running, unsupported stretches of 2, 3, 6, 9 and 27 frames
(walking never leaves the ground at all). A full crouch-and-launch clip thrown at a two-frame hop looks
far worse than ignoring it, so short skips are absorbed — the feet stay planted through them — while a
genuine fall still animates. A commanded jump bypasses the grace entirely via `justJumped`.

Two smaller adjustments followed: the jump segment starts at **0.72 s** rather than 0.54 s (starting at
the anticipation crouch left the knight winding up in mid-air for 0.2 s after the capsule had already
left the ground) and is **retimed onto the real airtime** so it neither runs out early nor cuts off
mid-rise; and locomotion weight is scaled by the jump's influence **only while the jump group is
actually playing**, because these are one-shot segments that stop themselves — reserving weight for a
stopped group left nothing driving the pose and froze the knight.

### Measured results

| Check | Result |
| --- | --- |
| Idle / walk / run blend | idle 1.0 → walk 1.0 at 3.97 u/s → run 1.0 at 8.00 u/s, and back |
| Jump arc | apex +1.70 u (physics predicts 1.69), visual tracks the capsule at a constant offset |
| Jump lifecycle | takeoff blend from frame 1, land segment, idle resumed by 1.33 s; re-triggers cleanly |
| Foot planting, standing | **−2.5 mm** against the terrain (was ~+10 cm of float) |
| Foot planting, walking | −16 mm |
| False jump triggers while running | none |

The remaining −4 to −7 cm of foot sink *while running* is the mocap's own stride dipping below the
seated reference plus the visual-Y smoothing lag. Correcting it properly is foot IK, which §9 keeps
out of scope.
