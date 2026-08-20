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

**The grounded signal had to change.** §6 assumed `motion.isGrounded` was usable. It is not: it was
`supported && !ascending`, and because the domain is fed the *post-solve* velocity, that velocity
points up for most of an uphill walk — measured **0 grounded frames out of 12** while simply walking
forward. Driving the jump clip and the foot plant from it froze the knight mid-stride. `Player` now
also exposes **`isSupported`** (the raw probe) and **`justJumped`** (true on the frame a jump is
accepted), and the animation layer reads those.

That same rule turned out to break the **gameplay**, not just the visuals — see §12.

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

## 12. Follow-up — jumping while walking (bug fix)

Reported straight after the first pass: **the knight could not jump while walking.** Reproduced and
measured — 40 jump presses across 40 consecutive walking frames, **0 accepted**, with the support
probe reporting SUPPORTED on all 40. The cause is the same `ascending` rule §11 already flagged for
the animation layer, except here it reaches the gameplay: `motion.isGrounded` was
`supported && !ascending`, the post-solve velocity sits at +0.33..+0.42 u/s for the whole of a walk
across rolling terrain, and the domain only accepts a jump from a grounded motion. So the jump input
was silently discarded. (It had always been broken; nothing triggered a jump before this milestone,
so nobody noticed.)

Removing the rule fixed walking and running jumps but left a second, subtler failure: the probe
**chatters**. Measured over 150 frames of walking, per direction:

| Direction | frames without support | longest gap |
| --- | --- | --- |
| Forward | 0 / 150 | — |
| Diagonal | 15 / 150 | 3 frames |
| Backward | 59 / 150 | 4 frames |
| Sideways | 84 / 150 | 8 frames |

The capsule skips across the terrain collider's triangles, so a press landing inside one of those
bursts was consumed and thrown away — jumping worked, but only most of the time, which is exactly the
"sometimes it doesn't jump" the report describes.

**`src/presentation/babylon/groundContact.ts`** now owns this: a pure reducer over
`(supported, jumpPressed, verticalSpeed, delta)` returning the `isGrounded` / `jumpRequested` the
domain consumes, carrying

- a **takeoff guard** — grounding is suppressed only while a jump has yet to clear the floor, released
  when the probe lets go *or* the character starts falling (a jump into a low ceiling must not latch),
- **coyote time** (0.15 s) so the chatter bursts stay jumpable,
- a **jump buffer** (0.15 s) so a press made just before landing still fires,
- and a **spent-jump flag**, without which the reopening coyote window after takeoff would let a
  mashed key double-jump.

Being pure, it is unit-tested (12 cases in `tests/presentation/groundContact.test.ts`) rather than
verified by hand, matching how `terrainHeight` and `cameraRelativeDirection` are treated.

**Result:** 15 of 15 jumps accepted across standing, forward, sideways, backward, diagonal and
running, peak height consistently ~1.70 u; mashing the key through a full jump still produces exactly
one arc.

## 13. Follow-up — running collapses on gentle slopes (bug fix)

Reported as "some slopes drop me back to walking, and they don't even look steep". Measured by
teleporting to spots of known gradient and running straight uphill:

| Slope | Speed before | Speed after |
| --- | --- | --- |
| 1.4° | 7.95 | 8.00 |
| 4.3° | **2.87** | 8.00 |
| 7.0° | **3.04** | 8.00 |
| 13.4° | **2.09** | 8.00 |
| 16.1° | **2.47** | 8.00 |
| 21.8° | **1.38** | 8.00 |

So the animation was not at fault — it faithfully reported a character that really was crawling. A
**4° rise** cut running from 8 u/s to under 3.

**Cause: the domain and the physics disagreed about what "speed" means, and fed each other downward.**
Instrumenting the commanded velocity against the post-solve velocity showed them **identical** every
frame — the solver was not eating anything. The commanded value was itself decaying, 6.73 → 4.99 over
half a second. The loop:

1. The domain accelerates a **horizontal** velocity toward `runSpeed`.
2. Riding a slope tilts that velocity, so its **horizontal component** shrinks by `cos(slope)`.
3. `playerController` feeds the post-solve velocity back, and the domain reads the shrunken horizontal
   value as "current speed", adding only `acceleration * delta` on top.

Equilibrium is `acceleration * delta / (1 - cos(slope))` — for the measured contact angle that is
**3.95 u/s**, matching what was observed. The contact angle is also worse than the terrain's average
gradient: the collider's half-unit triangles are locally steeper than the smooth height field, so a 7°
hillside presents **~19°** contact normals.

**`src/presentation/babylon/slopeMotion.ts`** fixes it with two symmetric pure functions bracketing the
physics step — `alignToSurface` tilts the domain's flat velocity onto the contact plane (preserving
speed, so the character climbs instead of grinding into the hill), and `flattenToGroundSpeed` reports
the distance actually covered along the ground back as a flat speed, so the domain's bookkeeping stays
honest. A jump is the one grounded frame that skips both, since it must keep its vertical velocity.
11 unit tests, including that the two are inverses across every walkable angle.

**Regression checks:** downhill does not overspeed (8.00 at 7° and 21.8°); slopes near the ~32°
climb limit still slow the character down (3.3 u/s at 27°, run animation correctly giving way to walk);
walking on a slope is back to a full 4.00; jumps still reach 1.71 u on the flat; and — most
importantly — the **natural barrier still holds**: running straight at it from three different
bearings for six seconds each tops out at radius ~42.5 of a 50-unit half-field, exactly as designed.

## 14. Follow-up — turning feel, and sliding off slopes (bug fixes)

Two feel reports after §13 landed: "running turns feel odd", and "climbing is fine, but running
straight at a slope slides me off along its edge".

### Turning — the model and the body disagreed

Logging a 90° turn taken at full run speed:

| | before | after |
| --- | --- | --- |
| `facing` reaches the new heading | instantly (frame 1) | 0.17 s, steadily |
| model yaw reaches it | 0.20 s | tracks `facing` exactly |
| **velocity direction** reaches it | **0.60 s** | **0.17 s, equal to `facing` every frame** |
| speed through the corner | dips 8.00 → **6.05** | holds **8.00** |

So for roughly a third of a second the knight was fully facing the new direction while still
travelling in the old one — running visibly sideways. The cause was that the domain eased the
*velocity vector* toward its new target at a linear rate: a 90° turn at 8 u/s has to cover 11.3 u/s of
vector change, which at `acceleration` 13 takes 0.6 s, and doubling the speed doubles the turn radius.
Walking hid it; running did not.

The domain now **steers a heading and carries speed along it**. `nextFacing` rotates `motion.facing`
toward the input at a new angular `turnRate` (10 rad/s), and the planar velocity is simply that
heading times a speed that eases toward the requested top speed. Direction and speed stop competing,
turn radius no longer scales with speed, and — because the velocity *is* the facing — the model can
never disagree with the body. `playerController` accordingly sets the yaw straight from
`motion.facing` and its own `TURN_SPEED` lerp is gone: two smoothers meant two headings.

Below `PIVOT_FREELY_BELOW` (0.5 u/s) the heading snaps instead of swinging, so setting off from rest
does not pivot on the spot first. A part-pressed direction still asks for a proportionally lower top
speed, so analog input keeps working.

### Slopes — §13's fix was bending the heading

§13 projected the velocity onto the contact plane and rescaled it back to full speed. That fixed the
speed loss but introduced a worse problem: projection **rotates** the velocity toward the contour, and
the rescale then drove the character along it at full speed. Measured drift from the commanded
direction while running straight uphill: **62.6° on a 27° slope, 91° and 105° on 50° ones**.

The replacement adds *only* the vertical component that puts the velocity in the surface plane, and
leaves the horizontal pair exactly as the domain set it:

```
vy = -(vx * nx + vz * nz) / ny
```

The horizontal velocity is therefore untouched — it cannot shrink (so §13's feedback loop cannot form,
and `flattenToGroundSpeed` is no longer needed at all) and it cannot turn (so there is nothing to
slide along). Surfaces steeper than `WALKABLE_SLOPE_DEGREES` (40°, above the terrain's ~32° walkable
design limit and below the controller's own 60° limit) are handed over untouched, so a too-steep face
still blocks like a wall.

| Slope | drift before | drift after | speed after |
| --- | --- | --- | --- |
| 27.3° | 62.6° | **24.6°** | 7.90 |
| 49.7° | 91.2° | **14.7°** | 5.93 |
| 50.4° | 104.7° | **0.0°** | 4.43 |

### Regression checks

Running holds 8.00 at 1.4°, 7°, 16° and 21.8° with the run clip at full weight; walking a slope is
4.00 with the walk clip; jumps reach 1.71 standing, 1.72 walking, 1.82 running, all playing the jump
clip; feet sit 4.8 mm off flat ground. The **natural barrier is unchanged** — charging it from three
bearings tops out at radius 42.5–42.6, the same as before either slope change.

## 15. Follow-up — the landing tail (bug fix)

Reported as "sometimes a running jump lands into the tail of the jump clip instead of going straight
back to the run, and sometimes it doesn't".

**Root cause.** Babylon's `AnimationGroup.start()` returns early when the group is already started
(`animationGroup.pure.js:485`). §6's design switched the jump clip from its airborne segment to its
landing segment by calling `start()` again — which, while the airborne segment was still playing, was
**silently ignored**. Instrumenting `jump.start` through a real running jump caught it directly:

| call | segment | `isStarted` at call | effect |
| --- | --- | --- | --- |
| 1 | 43.2 → 78 (launch → fall) | `false` | plays |
| 2 | 78 → 106.8 (land) | **`true`** | **no-op** |

So the state machine believed it had switched to `land` while the clip just ran the fall segment to
its end. Whether the landing tail appeared depended purely on whether the airborne segment happened to
finish before touchdown — long airtime meant `isStarted` was already `false`, the call took, and the
tail played. Hence "sometimes".

**Fix.** Not to make the switch work — the landing clip is *not* wanted. It is half a second of
crouching and straightening back up to a stand, which a character still running at 8 u/s plainly is
not doing, and it read as the knight stalling on landing. Touchdown now simply ends the jump: the
`land` phase is gone, the jump weight falls away over `JUMP_BLEND_PER_SECOND` and locomotion takes the
pose straight back. A player who *has* stopped still looks settled, because idle blends in the same
way — the recovery adapts to what the player is actually doing instead of being baked into the clip.

`playSegment` keeps its `stop()` before `start()` regardless: the takeoff call hits the same trap when
hopping again before the previous segment has finished.

**Verified.** Standing, walking and running jumps each make exactly **one** `start()` call, and the
clip frame never passes the segment end (78) after touchdown — the tail is unreachable. The handoff
measured on a running jump: touchdown at 0.57 s, jump weight 1 → 0.82 → 0.45 → 0.07 → 0 while run
weight goes 0.15 → 0.49 → 0.93 → **1.00 by 0.67 s**. Three back-to-back hops each restart the segment
cleanly (`isStarted` false on every call) and reach full height.

### Known issue, separate from this one

The same traces show planar speed collapsing from 8.00 to **3.24** roughly 0.1 s *after* the jump
handoff has completed (jump weight already 0), with the support probe flickering — the capsule bounces
on the rolling terrain at run speed and the physics genuinely loses momentum, then re-accelerates over
~0.4 s. The locomotion blend faithfully follows it down into walk and back. This is the same run-speed
terrain skipping measured in §12 (47 of 180 frames unsupported while running), not an animation fault,
and it is left for a separate pass.

## 16. Review response

All six findings from the branch review held up against the code; each is fixed below. The two
architectural notes drove the shape of the fix rather than being deferred, because findings 2 and 3
were direct consequences of the duplication they named.

**One machine owns ground contact (#13).** `knight.ts` had grown a second copy of the airborne
decision — `phase`, `hasClearedGround`, `airborneFor`, its own `FALL_GRACE_SECONDS` — beside the one in
`groundContact.ts`. `GroundContactResult` now carries a debounced **`airborne`** flag, `Player` exposes
it, and the animation layer only detects its rising edge. `Knight.planted`'s own doc warned that
deciding this twice would let the two disagree; that is exactly what had happened.

**`GroundContact` is a union, not four flags (#16).** `{ grounded } | { rising } | { airborne, seconds,
jumpSpent }`. Finding 1 was a state that should never have been expressible.

| # | Finding | Fix |
| --- | --- | --- |
| 1 | Ground re-acquired mid-climb cancelled the jump — the old guard only covered an unbroken run of supported frames | The `rising` state ignores the probe entirely until the character stops going up, so re-contact on a rising slope cannot zero the climb |
| 2 | `hasClearedGround` could latch `'air'` forever if the probe never released, floating the knight and killing all further jump animation | Gone with the duplicate machine. `rising` ends on "no longer rising", so a jump into a low ceiling escapes |
| 3 | Pose snapped when the clip outlasted a long fall — `jumpInfluence` dropped 1 → 0 in one frame | The weight eases down whether or not the group is still playing; a stopped group holds its last pose, so locomotion fades in over it |
| 4 | Heading snapped below `PIVOT_FREELY_BELOW`, and nothing downstream smooths it — a standing reverse tap spun 180° in one frame | `PIVOT_TURN_RATE` (30 rad/s): brisk but bounded. Measured worst case now **37°** per frame |
| 5 | Comments still described the removed landing segment | Rewritten; `playSegment`'s `stop()` now documents the reason that still applies (re-playing the *same* range) |
| 6 | `rotateToward` test compared two identical calls — true of any implementation | Replaced with the step-size property and the exactly-opposite degenerate case |

Also: `approach` was duplicated in `characterMovement.ts` and `knight.ts`; it is now
`src/domain/math/scalar.ts`'s `moveToward` (#6). `MovementConstants`' ten-line `//` block became a doc
comment (#17).

**Verified.** 123 tests (up from 112 — the new ones cover mid-climb re-contact, the ceiling escape, the
apex, and the probe's short dropouts, none of which had coverage). In-browser: run 8.00 at 1.4°/7°/21.8°
with the run clip at full weight, walk 4.00, jumps 1.71/1.74/1.81 with no tail, a 90° turn in 0.17 s
with at most 4.06° between facing and velocity, and the barrier unchanged at radius 42.5–42.6.
