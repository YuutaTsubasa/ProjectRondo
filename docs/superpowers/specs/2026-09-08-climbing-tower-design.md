# Climbing Tower — design

Date: 2026-09-08. The first playable **mode**, and the first thing in this project that is not the
hub. It is entered from the hub's colonnade and runs in its own Babylon `Scene`.

Owner decisions, settled one at a time in brainstorming, are recorded inline where they bind. Where a
decision has a live alternative, the alternative and the reason it was not taken are recorded too —
a decision nobody can see the alternatives to is a decision that gets silently re-made.

## 1. Why this, and why now

The homing attack shipped in PR #39. Its own spec opens by arguing that the move had to come first
because **the move's numbers are the tower's grammar** — `homingRange` 12, `homingConeHalfAngle`
0.6109 rad (35°), `homingBounceSpeed` 9 between them decide how far apart crystals can sit and
whether a chain is possible at all. That argument only pays off if the tower is built next, against
those numbers, while they are still cheap to move.

Two things that spec listed as blocking the tower have both cleared:

- **A second scene, not a far corner of the hub.** Homing spec §11: the hub costs ~5.1 ms/frame at
  720p with shadows at 91 % of it, and its four CSM cascades are configured for a 100 × 100 plain
  (`shadowMaxZ = 120`, verified in `shadows.ts:24`), which is the wrong shape for a vertical climb. A
  separate scene both frees that budget and lets the tower configure its own shadows. That decision
  is inherited here, not re-made.
- **Mode routing waited for PR #33.** #33 is merged.

## 2. What the player does

- **The tower is white, and it is one solid central column** with platforms and crystals spiralling
  up its outside. The column itself is not standable — it is the thing that tells you which face you
  are on and how high you have got, and the thing you fall past.
  - *Rejected: floating platforms with no column.* Easier to author, but you lose the read on your own
    height, and the camera has nothing to orbit.
  - *Rejected: climbing up a hollow interior.* `followCamera` has no collision avoidance; inside a
    tube it would sit in the wall every frame. That is a camera project, not a level.
- **Three sections, alternating in what they ask of you**: platform jumping, then a homing chain,
  then a mix. The alternation is the point — one section of each cannot establish a rhythm.
- **A checkpoint at the start of each section.** Falling puts you back at the start of the section
  you were in, not at the bottom of the tower.
  - *Rejected: true Only Up, no checkpoints.* The strongest version emotionally, and the wrong one
    for the mode nobody has played yet: every development pass would re-climb from zero. The choice
    is one-way in the cheap direction — removing checkpoints later is a deletion, while adding them
    later means re-authoring the level's shape around them.
- **There is no death.** You fall, you watch yourself fall past the column, and below a threshold you
  are returned to your checkpoint.
  - **Now measured — see §13.2, which supersedes the "watch yourself fall" claim:** the knight's root
    crosses the bottom of the frame at 43 % of the fall, and screenshots show no knight at all by
    touchdown. The bullet above is kept as the record of what was believed before the probe ran.
- **The top is a place.** A pedestal at the summit returns you to the hub, and reaching it is what
  finishing the tower means.

## 3. The sections are matched on time, not on height

The two climbing vocabularies gain height at very different rates, both bounded by numbers that
already ship:

- **Jumping** is bounded by the jump apex, `jumpSpeed²/(2·gravity)` = 9²/48 = **1.6875 u**. A step
  that gains much more than ~1.4 u has no margin for a missed landing.
- **A homing link** is bounded by `homingRange` 12 and the 35° cone, and the crystal may sit directly
  overhead. A link that gains 6–8 u vertically is comfortable.

So a 20-unit stretch is ~14 platform steps or ~3 crystals. Matching the sections on height would make
the jumping section three times longer to play than the chain. They are therefore matched on
**roughly equal play time**, which makes their heights differ:

| Section | Vocabulary | Height (u) | Approx. content |
|---|---|---|---|
| 1 | Platform jumping | 18 | ~13 steps |
| 2 | Homing chain | 24 | ~4 crystals |
| 3 | Mixed | 20 | both |

**Untuned.** These three heights are derived from the rates above, not measured against play. Nobody
has climbed this. They are the first thing to move after the first real playthrough, and the plan
should treat them as data, not as structure.

## 4. Falling

A fall from the top of a section to its floor is `√(2h/gravity)` — for a 20 u section, **1.29 s**.
That is long enough to register as a loss without being a punishment queue.

**Now measured — see §13.2, which supersedes this claim.** The duration itself is confirmed (§13's own
faithfulness check measured 1.290 s against this section's analytic 1.291 s), but §13.2 found the
knight's root crosses the bottom of the frame at 43 % of that time and the screen shows no knight at
all by touchdown — so whether the fall stays legible enough to "register as a loss without being a
punishment queue" is not established by that measurement. The paragraph above is kept as the record of
what was believed before the probe ran.

The respawn rule: when the player's height falls below the active checkpoint's height by a margin,
return them to the active checkpoint. Checkpoints activate on the way **up** only — passing a
checkpoint's height going down does not deactivate it, or a fall would strand you one section lower
than the rule promises.

That margin is a named constant, and it is **Untuned**: it has to be deep enough that stepping off a
ledge just below a checkpoint does not snap you, and shallow enough that a real fall does not read as
a hang before it resolves. Nobody has felt either edge.

The tower has a **solid floor at its base**, and section 1's checkpoint stands on it. The floor is
not the safety net — the respawn rule is — but it is what a fall visibly ends against, and it is what
still catches a player if the respawn rule has a hole in it.

## 5. Entry and exit

**The affordance.** A glowing ring on the ground inside the colonnade, drawn with a runtime
`DynamicTexture` the way `homingReticle.ts` and `scatter.ts` already draw theirs — no image file, and
nothing entering Git LFS. It is lit at all times and detects nothing; it says "this leads somewhere",
and that is its whole job.

**The trigger is the central pedestal**, which already exists in `landmark.ts`: radius 1.6, height
0.55, at (−6, 32). It has to be climbed onto, which is why there is no confirm key — the act of
standing on it is already deliberate, and the pedestal has no other purpose to conflict with.

**The colonnade is not spent on this mode.** `landmark.ts`'s own doc records why the shape is a ring
of eight pillars: "each pillar can later carry one mode-entrance with room to spare for three modes",
and an arch "would have been one entrance for three modes". The ring of light is the shared
affordance and the pedestal is the shared trigger; when a second mode exists, the pillars become the
selector and neither the ring nor the pedestal has to change.

**Re-entry must not loop.** Returning from the tower places the player *beside* the pedestal, not on
it, and the trigger is edge-triggered — it must see the player leave before it can fire again.
Arriving on top of your own trigger is the shape of bug that only appears once the round trip exists.

**Exit is the summit pedestal only.** Because the respawn rule returns you to your checkpoint, a
player past section 1 cannot descend; the summit is the only way out. This is accepted for v1 on the
grounds that the tower is only three sections, and that a give-up route belongs with the pause UI
that does not exist yet (§12). How long a climb actually takes is not known — nobody has played it —
so if it turns out to be long enough that wanting out mid-climb is a real feeling, this is the
decision to re-open first.

## 6. Architecture: who owns the engine

`createHubScene` currently constructs the `Engine` itself (`hubScene.ts:63` — the only `new Engine`
in `src/`), and its `dispose()` calls `engine.dispose()`, which tears down the WebGL context. An
engine that dies with a level cannot outlive a level swap.

**The engine moves up to `App.svelte`.** Both scene builders take an existing engine; each level's
`dispose()` disposes its own scene and its own listeners, and nothing but unmount disposes the
engine.

**One scene is alive at a time.** Entering the tower disposes the hub scene and builds the tower's on
the same engine; leaving reverses it.

- *Rejected: keep both scenes alive and switch which one renders.* Instant both ways, at the cost of
  two scene graphs and two Havok worlds resident, and of every hub observer having to be genuinely
  stopped rather than merely not drawn. A cost that is paid but not seen is the hardest kind to find
  — and switching from the chosen design to this one later is a local change, while the reverse is
  not.
- The Havok WASM module (`await HavokPhysics()`) is a genuine singleton and is cached across the
  swap. The knight's GLB is not: Babylon meshes belong to a scene, so it reloads. A load pause in
  each direction is accepted.

## 7. The character rig, and the terrain coupling that blocks it

Both scenes need the same character: player root, follow camera, input, `createPlayer`, `loadKnight`,
`driveKnightAnimation`, and the `readMotion` sample the animation and audio layers share. Today those
~40 lines sit in the middle of `createHubScene`, interleaved with terrain, trees, water, clouds,
scatter and the landmark.

**What is extracted is the character rig, not a level framework.** Each scene keeps its own top-level
function and its own recipe; the rig is a unit they both call. No base class, no lifecycle interface,
no registry — there are two levels.

**One ordering constraint decides the rig's shape.** `hubScene.ts` documents that Babylon 9 keys
shadow generators by camera, so `createShadows(sun, camera)` must run after the camera exists and
before the world registers casters. The camera belongs to the rig; the sun belongs to the level; the
shadows are needed by both. So the rig takes the sun and a `makeShadows(camera)` callback, builds the
shadows at the right moment, and hands them back — the tower supplies its own cascade configuration
(the hub's is shaped for a 100 × 100 plain), and the ordering rule lives in one place instead of
being remembered twice.

Crystals are the one piece of level content the rig needs (`createPlayer` takes them). They can be
built before the shadows exist because `crystals.ts` deliberately registers no shadow casters — its
own doc gives the reason. So the order is one pass, not two phases:

> environment (yields the sun) → physics → level places crystals → rig (yields shadows) → level
> content → audio

**The blocker: the rig is not scene-agnostic today.** Three of its modules read the hub's height
field directly, and a tower has no height field:

| Site | What it does | In a tower |
|---|---|---|
| `playerController.ts:95` | Spawn is `terrainHeight(0,0) + …` | Wrong outright — the spawn must become a parameter |
| `followCamera.ts:92,105` | Keeps the camera above `terrainHeight` | **Now measured — see §13.2, which supersedes this cell.** Benign only *near the hub origin*: `terrainHeight` has no domain guard and keeps returning 14–18 outside the field, so a tower placed beyond `EDGE_RADIUS` pins the camera at y ≈ 15–18 whatever the player does. The injected ground query below is a blocker, not tidiness |
| `knight.ts:854,858` | Foot-plant raycast falls back to `terrainHeight` when it misses | Only the fallback, but the fallback is the hub's ground under a tower |

The honest resolution is to make "what is the ground here" an injected query rather than an imported
constant, and to give `createPlayer` a spawn. The alternative — leaving the imports and relying on
the tower's coordinates happening to land where the field is flat — is the kind of accident that
holds until someone moves the tower.

## 8. New pure logic

Two pieces, both in `src/domain/`, both with Vitest, neither touching Babylon:

- **Tower progress.** Given the player's height and the section checkpoint heights: which checkpoint
  is active, and should the player respawn? Activation is upward-only (§4).
- **Mode routing.** `gameMode.svelte.ts` is a one-way `'intro' | 'playing'` gate today. It becomes a
  machine that can go `intro → hub ⇄ tower`. It is small, but it is a state machine, and this branch
  learned what unmeasured state machines cost.

One presentation-side rule is lifted out for the same reason:

- **The portal's edge trigger** — on the pedestal, off the pedestal, and the rule that it must see
  you leave before firing again — is a pure function tested like `homingLock.ts`, not a few lines
  inside a render observable. Half of PR #39's ten Major findings were state machines living
  untested inside `playerController`'s observable; this one starts outside it.

**A property to hold this design to: no domain movement code should change.** The tower uses the same
knight, the same `characterMovement.step`, the same homing. If the implementation finds itself
editing `characterMovement.ts`, something in this design is wrong and the right response is to stop
and say so, not to widen the domain.

## 9. Audio

The tower gets **character sound and no music**. `createHubAudio` bundles the footstep cadence, the
jump cues and the music director in one function, so this needs that function to be able to build the
character layer alone — a switch at its top level, not a rewrite. That file was hardened over 18
review rounds by another session and is not to be restructured for this.

If the split turns out not to be that cheap, the fallback is **no audio in the tower at all**,
recorded as a known gap. Silence in a level is a defect; silence pretending to be a design is worse.

## 10. Risks that could invalidate this design

- **Teleporting the character controller is unproven here.** The respawn rule and the spawn parameter
  both depend on moving a `PhysicsCharacterController`. `setPosition(position: Vector3)` exists on the
  type, but during PR #39's browser verification a `charController.setPosition` call was observed to
  have no effect, and the session worked around it rather than diagnosing it. If it cannot be made to
  work, checkpoints do not work, and §2's respawn decision has to be re-opened. **The plan must prove
  this first, before any level content is authored.**
- **The camera against a vertical climb.** `followCamera` has been shaped entirely by the hub. Nobody
  has flown it up 60 units next to a column. Its ground clamp is §7's benign-by-luck case; its
  behaviour on a fast vertical fall is simply unknown.

Both are cheap to probe and expensive to discover late, so both are probed before content.

**Both have now been probed — read §13 before acting on this section.** It supersedes the two bullets
above: the `setPosition` failure was a console aliasing artefact and teleporting works, while the
camera's behaviour on a vertical fall turned out worse than "unknown, probably fine". The bullets are
kept as the record of what was believed before the probe ran.

## 11. Testing and verification

- **Vitest** for the two domain pieces (§8) and the portal's edge trigger, red before green.
- **The browser** for everything that is a picture or a feel: the white column reading against its
  sky, the ring of light, the camera on a climb and on a fall, and whether the three section heights
  play as equal time.
- Anything watched but not measured stays marked **Untuned**, and anything nobody has watched says so
  — the rule this repo's review has enforced repeatedly, most recently across PR #39's 31 rounds.

## 12. Out of scope

- **A give-up route out of the tower mid-climb.** Belongs with a pause UI, which does not exist. Owner
  decision: build the UI separately later, rather than spend a key binding on a guess (§5).
- **Tower music** (§9).
- **Pillar-based mode selection.** The colonnade is built for it and this design deliberately leaves
  room for it, but there is one mode.
- **Enemies, damage, health** — unchanged from the homing spec.
- **Restructuring `hubAudio.ts`** beyond the one switch §9 needs.
- **A second climbing vocabulary beyond jumping and homing** — wall runs, grapples, moving platforms.
  The alternation this design commits to is between the two moves that already ship.

## 13. Probe findings

Both §10 risks were probed in the browser before any content was authored (Task 1, 2026-09-08). The
verdict is **go**: Risk A is a false alarm with a precise cause, and Risk B is real, larger than §10
assumed, and costs work rather than design.

**How these numbers were taken.** The Browser pane reported itself hidden the whole session and frame
delivery was erratic (1.93 fps measured over one early 6.7 s window; 118 fps averaged over the
session), so nothing here depends on the render loop: every trace is a synchronous burst of
`scene.render()` calls inside one console evaluation, driving `onBeforeRenderObservable` exactly as a
frame does, at the engine's own measured 6.3–6.8 ms delta. Two checks that this is faithful: a 20 u
fall at `gravity` 24 measured **1.290 s** against §4's analytic 1.291 s, and the 58.32 u drop from
y = 60 measured **2.208 s** against 2.205 s. Screenshots were taken with `engine.stopRenderLoop()`
held, because `followCamera` — unlike `playerController` — does not clamp `dt`, so a stalled loop's
half-second frame lets the camera fully catch up and produces a screenshot that flatly contradicts the
trace.

### 13.1 Risk A — `setPosition` works; the PR #39 report was a measurement artefact

`charController.setPosition` moves the capsule **exactly and immediately** — measured
`y 1.7727 → 11.7727` on a `+10`, no `integrate` needed, and the teleport persists with physics
resuming from the new height.

The reason PR #39 saw "no effect" is that `PhysicsCharacterController.getPosition()` returns the
controller's **live internal `Vector3`**, not a copy (`characterController.js:285`). Confirmed here:
`alias === c.getPosition()` is `true`, and a reference captured before the call reads back the new `y`
after it. So the natural console idiom
`const before = c.getPosition(); c.setPosition(…); before.y === c.getPosition().y` compares an object
with itself and is always true. §10's premise is withdrawn: **checkpoints work, and §2's respawn
decision does not need re-opening.**

The three candidate causes §10 listed were all checked and cleared. In particular `playerController`'s
observable does **not** re-seed the controller: its dataflow is controller → `root`, one way.

**What a respawn actually has to do.** `setPosition` alone is not a respawn, and neither is
`setPosition` plus `controller.setVelocity(0)`. Measured: after both, from a 19.7 u/s fall, the next
frame reads `player.motion.velocity.y = −19.87` and the capsule keeps falling — because
`playerController` recomputes `controller.setVelocity(...)` from the **domain's**
`player.motion.velocity` every frame before `integrate`, so a controller-side zero survives less than
one frame. `createPlayer` must therefore expose a `teleport(position)` that resets four things at
once: the controller position, the controller velocity, `player.motion.velocity`, and `visualY`.

The fourth is not optional either. `visualY` (here) and `smoothY` (`followCamera`) are private closure
state with no reset, so a raw teleport to y = 60 left the knight at 6.6 and the camera at 5.1 and then
*glided* them up through 53 units at rates 14 and 9. A checkpoint respawn built on `setPosition` alone
reads as a swoop across the level rather than a cut.

**Where a checkpoint may be placed.** Measured over 60 stepped frames: open air and "0.3 u above the
surface" both settle cleanly; a capsule teleported into the middle of a pillar squeezes out sideways
at ~0.7 u/s; a capsule teleported **3 u below** a surface is lost outright (−2.54 → −4.62, still
falling) because the ground collider is one-sided. Checkpoints are points in open air above their
platform, never points on it.

### 13.2 Risk B — the camera, measured

**The ground clamp at height is a confirmed no-op, and §7's "benign by luck" is too generous.**
Across an entire 20 u fall the grounded branch (`followCamera.ts:92`) was false on every frame — the
anchor is the raw `t.y` — and the clamp (`:105`) evaluated to **0.61** against a camera between 21.75
and 6.84, never active. The camera's `(x, z)` at the moment of that sample was not recorded, so 0.61
cannot be checked against the grid values below. Losing the terrain *anchor* costs the tower nothing:
the anchor hides the capsule micro-stepping across terrain triangles, and flat-topped box platforms
give it nothing to micro-step across. The *smoothing* is not lost — that lerp is unconditional and
still runs.

What is not benign is the clamp's dependence on `terrainHeight` having no domain guard. §7 records the
field's range as unmeasured; measured now on a 0.5 u grid it is **−1.547 to 16.939** over the 100×100
field (−1.547 to 5.598 inside `EDGE_RADIUS`) — and outside the field the function simply keeps going:
`terrainHeight(60,0) = 17.2`, `(200,0) = 17.5`, `(500,500) = 14.4`. Placing the tower anywhere outside
`EDGE_RADIUS` — the obvious "out of the way" choice — pins the camera at **y ≈ 15–18** regardless of
the player, so the whole of section 1 would be played from seventeen units overhead. §7's injected
"what is the ground here" query is load-bearing: without it, the tower's *coordinates* silently decide
whether its camera works.

**The player falls out of the frame.** On the spec's own case — a 20 u section fall, 1.290 s — the
knight's root crosses the bottom edge of the frame at **t = 0.844 s, 43 % of the fall and 8.6 of its
20 u**, and screenshots at t = 1.10 s and at the touchdown frame show no knight at all. The camera is
`FOVMODE_VERTICAL_FIXED` at `fov` 0.8, so the vertical half-angle is 22.92° on any window aspect —
this is not an artefact of the pane's shape. The cause is two smoothers in series, both tuned against
a hub whose fastest vertical motion is a 1.69 u jump at ~9 u/s. At 30.98 u/s (the end of a 20 u fall)
`VISUAL_Y_SMOOTHING` 14 leaves the rendered knight `v/14 = 2.21 u` above the capsule (measured 1.80),
and `verticalSmoothing` 9 leaves the camera's aim a further `v/9 = 3.44 u` above the knight (measured
3.35).

The same 1.80 u also means the knight is seen **landing about a body height above the floor** and then
sinking into place over ~0.3 s. Invisible in the hub; on every tower fall it will not be.

**The camera has no obstruction handling at all.** `followCamera` consults exactly one piece of world
geometry — the analytic `terrainHeight`. No ray cast, no occlusion test, no pull-in. Demonstrated
against the hub's existing `plazaPillar_0` (radius 0.45): parking the camera on its axis, it was not
deflected by a millimetre, and because the material is `backFaceCulling: true`, from inside the pillar
renders **nothing** — the column silently disappears and the world is seen through it. **Inferred, not
observed — no tower column exists to test against yet:** a column of comparable radius standing where
the player climbs would put the camera inside it whenever the player is close to it, which would make
this the everyday case rather than the corner case, with the same failure mode of the level popping out
of existence instead of a black screen.

**Pitch limits — reasoned, not watched.** Pointer lock cannot be acquired from automation and
`yaw`/`pitch` are closure-private, so this was derived from `followCamera.ts`'s own formula with the
live config: at `minPitch` −1.2 the camera sits 5.56 u above the aim point at 1.81 u horizontal, a
look-down of **71.95°**, and the frustum's lower edge reaches 94.87° — just past vertical. So the
ground directly below the player is in frame at full down-pitch, near its bottom edge, but can never
be centred. Sighting the next platform down is possible; a straight-down look is not. **Untested.**

### 13.3 What this changes

Nothing in §1–§9 is invalidated. Three tasks gain work:

- **Respawn is a `teleport()`, not a `setPosition()`** — four resets, per §13.1, or the character
  arrives at the checkpoint still falling and glides in from wherever it was.
- **§7's injected ground query is a blocker, not a tidiness refactor** — it is what decides whether
  the tower can be placed anywhere but the hub's origin.
- **The camera needs budgeted work the plan does not currently carry**: a vertical follow fast enough
  to keep the player framed through a 1.3 s drop, and an answer for a camera that passes through the
  column and erases it. Both are work items, neither is a design change.
