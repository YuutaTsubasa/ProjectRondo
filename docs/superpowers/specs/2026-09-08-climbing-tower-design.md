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
  - **Measured, broken, and now fixed — see §13.2.** The probe found the knight's root crossing the
    bottom of the frame at 43 % of the fall with no knight on screen by touchdown, so "watch yourself
    fall" was not true of the camera as it stood. Task 11 added a descent-aware term to
    `followCamera`'s vertical follow and re-measured the same fall: the root now stays between 0.73
    and 0.99 of the frame the whole way down at 60 fps. The claim above holds again, with the
    residuals §13.2 records — **and with one more that only the built tower could show: §14.4 found
    the camera inside the column for the whole of any fall taken facing outward, so the knight is
    perfectly framed and drawn behind a wall. "Watch yourself fall" holds for a fall taken
    tangentially and does not hold for one taken outward.**
- **The top is a place.** A pedestal at the summit returns you to the hub, and reaching it is what
  finishing the tower means.

## 3. The sections are meant to be matched on time, not on height

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

**Untuned.** These three heights are derived from the rates above, not measured against play. They
are the first thing to move after the first real playthrough, and the plan should treat them as data,
not as structure.

**The playthrough has now run, and this section's premise is falsified — see §14.2.** The three
sections were timed at **15.1 : 2.4 : 7.1 seconds**, not at anything like parity, and the cause is in
the paragraph above: a homing link and a jump step cost about the same *per link* (1.18 s against a
mean 1.16 s), so converting between them by height — which is what the "~14 platform steps or ~3
crystals" arithmetic does — gets the ratio exactly backwards. Matching on time means moving the
**counts**, not the heights. Nothing was retuned; the table stands as the record of what was
believed before anyone climbed it.

## 4. Falling

A fall from the top of a section to its floor is `√(2h/gravity)` — for a 20 u section, **1.29 s**.
That is long enough to register as a loss without being a punishment queue.

**Measured, and the framing it depends on has been fixed — see §13.2.** The duration is confirmed
(§13's own faithfulness check measured 1.290 s against this section's analytic 1.291 s). The legibility
was not: §13.2 found the knight's root leaving the bottom of the frame 43 % of the way down and no
knight on screen by touchdown, so a fall could not "register as a loss" because it could not be seen.
Task 11's descent-aware vertical follow keeps the knight in frame for the whole fall, so the paragraph
above is again saying something the camera can deliver.

**Now played — see §14.3 and §14.4.** Seven real falls were taken on the built tower — six
of them run 0.45 s to 1.25 s from the frame the fall is detected to the frame the respawn fires;
the seventh, a section-1 ledge fall, is caught by the floor before any respawn and has no such
duration. The knight's root never leaves the frame on any of the seven. Two things that only
a playthrough could say: the camera can deliver it *unless the camera is inside the column*,
which it is for the whole of any fall taken facing outward (§14.4); and whether 1.25 s *feels*
like a loss rather than a punishment queue is still nobody's measurement to make — it is the
owner's, and it is listed as such in §14.8.

The respawn rule: when the player's height falls below the active checkpoint's height by a margin,
return them to the active checkpoint. Checkpoints activate on the way **up** only — passing a
checkpoint's height going down does not deactivate it, or a fall would strand you one section lower
than the rule promises.

That margin is a named constant, and it is **Untuned**: it has to be deep enough that stepping off a
ledge just below a checkpoint does not snap you, and shallow enough that a real fall does not read as
a hang before it resolves. **One edge is now measured and one is still untouched — §14.3**: stepping
off a checkpoint pad leaves 0.450 s between the frame the fall is detected and the frame the respawn
fires, and the shallow edge could not be exercised at all, because the layout has no ledge within the
margin below a checkpoint.

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

**"Standing on it" is a test the code has to make true, not a shape the geometry gives for free.** A
0.55 u plinth is nothing to a 1.6875 u jump apex: a player running across the plaza and jumping over
the plinth is inside its radius at a plausible standing height for several frames, and the first
implementation of the trigger swapped the scene for them — the deliberate act never happened, and
the argument above for having no confirm key was false as shipped. What makes it true is that the
trigger requires the capsule to be SUPPORTED (`Player.airborne` false, so no part of a jump counts),
inside the pedestal's radius, and within `PORTAL_STANDING_BAND` of the height its feet have on the
top face. The band alone cannot do it and no value of it could: a jump passes over the pedestal only
while it is above the top face, so the heights it is seen at start at the standing height itself.
The same three-part test is what the tower's summit pedestal exits on — otherwise a jump across the
summit balcony would end the climb.

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
that does not exist yet (§12). **How long a climb takes is now measured — §14.2: 24.5 s from the
floor to the summit**, on a scripted route that never misses a jump and never hesitates over a
crystal, which makes it a floor rather than an estimate. At that length, wanting out mid-climb is
unlikely to be a real feeling; if a retune per §14.2 lengthens the climb a great deal, this is the
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

**Amended: what shipped builds first and disposes second, so two scenes are resident for the length
of every load.** `App.svelte`'s `swapLevel` builds the incoming level, and only once that level is
standing does it swap the render loop onto it, dispose the outgoing one and commit the mode. For
that window — the knight's GLB alone is most of a second — there are two scene graphs and two Havok
worlds alive, which is precisely the cost this section priced the *Rejected* alternative at. The
steady state is still one scene; the peak is two, once per swap.

**Why the deviation was taken.** The order this section assumed disposes the only level on screen
before there is anything to replace it with. That shows the player a black canvas for the whole load,
and if the load then fails — Havok, the knight's GLB, a tree asset — it leaves them with no level at
all and no way back to the one they were in. Building first is what makes a failed entry a no-op the
player can retry from where they are standing, and both of those were requirements nobody wrote down
here.

**What it costs.** Two of the three costs are the rejected alternative's own, paid for a load rather
than for a session:

- **Two scene graphs and two Havok worlds**, resident together from the first line of the build to
  the dispose that follows it.
- **Two character rigs bound to the same window and canvas.** This is the rejected bullet's "every
  hub observer having to be genuinely stopped rather than merely not drawn", and it is not avoided by
  not rendering: the *scene* is inert because nothing renders it, but the rig's DOM listeners are
  not. Both rigs are suspended for the window — the incoming one arrives suspended from
  `createCharacterRig`, the outgoing one is suspended by `swapLevel` — and that is a deliberate act
  at both ends rather than a consequence of which scene is being drawn.
- **A failed build has to tear itself down**, because the caller never receives a handle to it. That
  is `levelTeardown.ts` and the `try`/`catch` in each builder.

The one cost this does *not* carry is the one the rejected bullet called hardest to find — a second
world resident for the session with nobody watching it — because the overlap ends at a fixed point
in one function instead of lasting as long as the game does.

**How long that window is has never been measured**, and this environment cannot measure it; see the
note on frame delivery at the head of §14.

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
| `knight.ts:854,858` | Foot-plant raycast falls back to `terrainHeight` when it misses | **Now shipped and measured — this cell understated it.** Not "only the fallback": the ray misses *horizontally*, at every platform edge, where the sole has passed the slab and the capsule has not, so the fallback fires on an ordinary stride and drew the knight 52 u below its own capsule on `towerPlatform_16`. Resolved by widening `GroundHeight` to `number \| null` (`groundHeight.ts`); the tower answers `unknownGround` and the plant holds its last correction |

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

The switch only withholds the director; the sound bank it sits on top of loads the whole manifest,
music included, before the switch is ever read. That is harmless only because the tower has no
entrance but the hub's colonnade, and the hub has already loaded both tracks by the time it does. A
level reachable without passing through the hub would need a real fix, not this switch.

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

**And the fourth reset has to reach `root`, not only `visualY` — Task 11's review found the respawn
still gliding.** `root` is written from `visualY` once a frame in `playerController`'s observer, and a
respawn is decided in a *later* observer, so on the frame it fires `root` still holds the height of the
fall; `FollowCamera.snap()` re-seeds from `root`, so it seeded there. Measured on the real 24 u tower
fall: the camera passed the checkpoint frame **3.6 u below** where it belonged and took **24 frames
(0.40 s at 60 fps)** to climb back within 0.1 u. `teleport` now writes `root` as well, and `snap()`
forces the node's world matrix — Babylon caches it per *render id*, so a mid-frame write is otherwise
invisible to `getAbsolutePosition` until the next frame — and re-places the camera inside the same
frame. The camera is then **exactly** at the checkpoint on the frame the respawn is decided, and does
not move afterwards: 0 glide frames.

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

**Task 11 fixed the framing, on a real tower fall, and this is what it now measures.** The finding
above was reproduced first against the built tower (Task 10) rather than the probe's rig: a 24 u fall
down section 3, driven frame by frame at a pinned 60 fps, put the root over the bottom edge **8.16 u
in, at t = 0.80 s and 19.6 u/s**, and by the respawn the root was at 1.40 of a frame-height and the
knight's head at 1.19 — nothing on screen, as the probe's screenshots showed. With `followCamera`'s
descent-aware term the same fall keeps the root between **0.73 and 0.99** of the frame throughout, and
its head between 0.36 and 0.78.

Three residuals, all measured:

- **The transition costs the worst frame.** The term cannot engage until 17 u/s (see below), and by
  then the camera is already 2.07 u behind, so the root peaks at **0.99** just after engaging before
  recovering. At 30 fps that peak is **1.02** — the root is off-frame for two frames, the head still at
  0.81 — because the unaided lag at the threshold grows with frame time. Closing it means engaging
  earlier than the hub allows.
- **The feet stay clipped.** Measured against the root, the knight's soles sit at 0.97–1.22 of the
  frame for most of the fall. The body reads; the feet do not.
- **`VISUAL_Y_SMOOTHING` 14 was not touched**, so the knight is still rendered ~2 u above the capsule
  at speed and still lands a body height high. That is a `playerController` change and a separate
  concern from framing.

**The threshold is boxed in on both sides, and the box is narrow.** Above: unaided, the root reaches
the bottom edge at 19.6 u/s, so anything at or above that engages too late. Below: the hub has to stay
under it, and the hub was measured rather than assumed — scripted walk/run/jump runs across the height
field peak at **15.8 u/s** (rendered root 14.28), and an exhaustive ballistic sweep of every walkable
launch point bounds a running jump at **16.6 u/s**. 17 was chosen.

**What the hub can reach is `homingSpeed` 24, which is why the term is now per-level.** The review of
Task 11 found the disclosure above understated: a player can lock a crystal *below* them, and a
downward dash pulls the capsule at a flat 24 u/s, so the rendered root passes 17 u/s after 0.088 s and
`DESCENT_FULL_SPEED` after 0.099 s — the ramp **saturates** and the hub would get the full rate 44, not
a value near the tuned 9. Falling off the top of the homing chain reaches 19.8 u/s on its own. So
`descentFollow` is a `CharacterRigOptions` flag each level states: the tower yes, the hub no, and the
hub's crystals stay what `hubScene.ts` calls them, a playground rather than level design. Below the
threshold nothing changed either way — a 1200-frame hub trace was identical to ten decimal places with
and without the term, and an 800-frame scripted route clear of the crystals is **bit-identical** with
`descentFollow` forced on against the shipping off (rendered root peaking at 14.278, capsule 15.8).

**The camera has no obstruction handling at all.** `followCamera` consults exactly one piece of world
geometry — the analytic `terrainHeight`. No ray cast, no occlusion test, no pull-in. Demonstrated
against the hub's existing `plazaPillar_0` (radius 0.45): parking the camera on its axis, it was not
deflected by a millimetre, and because the material is `backFaceCulling: true`, from inside the pillar
renders **nothing** — the column silently disappears and the world is seen through it. **Inferred, not
observed at the time — no tower column existed to test against; §14.4 has since observed it on the
built tower and the inference was right:** a column of comparable radius standing where
the player climbs would put the camera inside it whenever the player is close to it, which would make
this the everyday case rather than the corner case, with the same failure mode of the level popping out
of existence instead of a black screen.

**Task 11 mitigated the symptom and left the cause standing.** The tower column now has its own
material with `backFaceCulling = false`, so a camera inside it sees the column's inside surface rather
than the world through it. The camera still enters the column, still is not deflected, and still has no
ray cast — that remains §13.3's budgeted work, and "the camera no longer clips the column" would be
false.

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
  column and erases it. Both are work items, neither is a design change. *Task 11 did the first and
  half of the second — the follow now keeps the player in frame, and the column no longer vanishes
  from inside, but the camera still enters it. Real obstruction handling is still unbudgeted, and
  §14.4 measured what leaving it unbudgeted costs: on a fall taken facing outward the camera is
  inside the column on every frame, so the fall §2 promises the player will watch is a blank wall.*

## 14. First playthrough

The tower was climbed on 2026-09-09: floor to summit in two unbroken runs — one walking the
approaches through section 1 and one running them, which is the pair §14.2 times — three times in and
out through the colonnade, and a fall taken deliberately from each section. Two is also what §14.1
counts: two of its nineteen runs of the final link were taken as part of a full climb. This section
records what that run established and — more carefully — what it did not. §13's split between what was
**measured** and what was only **reasoned** is kept, and a third word is used where it belongs:
**watched**, meaning seen on screen and not reduced to a number. Anything watched but not measured
keeps its **Untuned** marking, and the judgements that are the project owner's are collected in
§14.8 rather than answered here.

> ### ⚠ This section was measured against a layout that has since been superseded
>
> The tower climbed below is not the tower that ships. The project owner played it and reported that
> the angle between one platform and the next was blocked by the column, and the arithmetic bore it
> out: at `PLATFORM_ORBIT` 4.2 the straight line between two neighbouring platforms passes
> `4.2 · cos(30°)` = 3.637 u from the axis, so a `CAPSULE_RADIUS` 0.5 capsule's edge reached
> **3.137 u — 0.063 u inside** a `TOWER_COLUMN_RADIUS` of 3.2, on every one of the tower's sixteen
> platform-to-platform jumps. `auditLayout` never checked the path BETWEEN two ledges; it does now,
> and **that rule fires on the whole of the layout this section climbed**. `PLATFORM_ORBIT`,
> `PLATFORM_DEPTH` and `BOUNCE_REACH` were re-solved together to satisfy it — **4.6 / 3.2 / 2.3**
> where this playthrough ran on 4.2 / 2.4 / 2.1.
>
> Nothing below is deleted, because a measurement is the record of a run and not a claim about the
> current build. What it is worth now splits cleanly, and the split is by whether a figure is about
> the geometry or about the code:
>
> **Void — every distance measured to or between platforms, crystals and pads.** §14.1's landing
> offsets (0.13–0.97 u from the balcony's centre, and the 0.20 u and 0.34 u on the other two pads),
> its launch shortfalls read against `BOUNCE_REACH` 2.1, and its finding that the landings fall
> outside the band `auditLayout` models — that band is `PLATFORM_DEPTH/2 − CAPSULE_RADIUS`, which
> was 0.70 u then and is 1.10 u now, so the finding has to be re-measured before it can be repeated.
> §14.4's camera-to-axis distances (7.93 / 6.42 / 9.09 u on the route's aims, 1.20–1.77 u on a fall)
> were computed from `PLATFORM_ORBIT` 4.2 and every one of them moves. §14.7's "no layout audit
> warning fired" was true of the audit as it stood and is false of the audit as it stands, which is
> the single most important line in this box.
>
> **Not void, but not re-measured either — §14.2's times.** The step and link counts, the section
> heights and `JUMP_RISE` are all unchanged, and so is the 0.798 u gap between two slabs' footprints,
> which depends on the inner face's radius and the slab WIDTH and saw neither move. So **the airborne
> part of a step is identical** — same arc over the same gap. What is longer is the ground run: two
> platforms one turn apart are `2 · PLATFORM_ORBIT · sin(30°)` = `PLATFORM_ORBIT` apart centre to
> centre, so the chord grew **4.2 → 4.6 u** while the gap it crosses did not, and the whole of that
> extra **0.4 u** is walked or run across slab. (The extra depth is what *permitted* the orbit to move
> — see `PLATFORM_ORBIT` — but it is not itself the cost: the approach is tangential, not radial.)
> At the 4 u/s the timed run walked its approaches, 0.4 u is on the order of a tenth of a second a
> step. Read 15.1 : 2.4 : 7.1 as a floor that is now slightly low, and read the mechanism it
> established — a link and a step cost the same, only *chaining* is cheap, so the times follow the
> count — as untouched, because none of it turns on a distance.
>
> **Still holds — the findings that are about the code rather than the geometry.** §14.3's respawn is
> a cut with zero glide frames, and its whole fall table with it: the drops are vertical, the section
> heights did not move, and `TOWER_FALL_MARGIN`'s 0.450 s costs what it cost. §14.5's round trip,
> including `TOWER_SPAWN` (3.5, 1.3, 6.062) — `SPAWN_ORBIT` 7 and the spawn bearing are both
> unchanged, so that coordinate is still the one the level computes — and `portalReturnSpawn`'s
> constructed 3.200 u. §14.6's resize, entirely. The instrumentation caveats at the head of this
> section: dead `requestAnimationFrame`, refused pointer lock, a scripted route that is a floor on
> what a person costs. And §14.8's questions, which the re-solve answers none of (it has since gained an eighth, from the audit rather than from a playthrough).
>
> **Re-verified on the new layout, by driving frames the same way:** a section-1 platform-to-platform
> jump now crosses with the capsule clear of the column, and the final link still lands on the summit
> balcony. Neither was re-measured at §14.1's nineteen-run depth, and there is no separate report to
> read: the first is now held continuously instead — `auditLayout`'s jump-path rule warns on any step
> whose chord does not clear the column by `JUMP_PATH_MARGIN`, on every load — while the second was a
> single driven observation taken at the re-solve and nothing re-checks it.

**Frames were driven by hand.** The Browser pane's `requestAnimationFrame` is dead in this
environment — **0 ticks measured over 500 ms** — so every frame below came from
`engine.beginFrame(); scene.render(); engine.endFrame()` called in a loop from the console with
`getDeltaTime` pinned, at 60 fps unless a figure says otherwise. That is §13's technique and it
drives the whole per-frame path: `playerController`, `followCamera`, `towerScene`'s progress and
portal observers and Havok's `integrate` all hang off `onBeforeRenderObservable`, and every one of
them ran on every frame counted here. What it establishes nothing at all about is **frame
delivery** — how the tower performs, whether it holds 60 fps on any machine, or how long a level
swap takes. A swap is a promise, and a promise cannot settle while frames are being driven
synchronously inside one console evaluation, so the load pause §6 accepts is still unmeasured.
Nothing in this section is a performance number.

Two more things about the instrumentation, because they bound what the rest is worth:

- **Pointer lock is refused here.** The real `canvas.requestPointerLock()` in `followCamera`'s click
  handler rejects with `WrongDocumentError` on a genuine user click. Mouse look was therefore
  delivered by dispatching `mousemove` events carrying the `movementX`/`movementY` a locked pointer
  would have carried, with `document.pointerLockElement` stubbed to the canvas. `followCamera`'s
  handler, its `sensitivity` and its pitch clamps all ran unmodified; what was faked is the
  browser's delivery, not the game's response. Without it nothing above the first platform is
  reachable at all, because the homing cone is measured off the camera and every crystal in the
  tower sits outside that cone at the default yaw.
- **The route was scripted, not played.** Keys are real `keydown`/`keyup` events on `window`; the
  aim is set to point at whatever the route is going for next. A scripted climber never misjudges a
  gap and never hesitates over which crystal to take. **Every duration below is a floor on what the
  same route costs a person**, and the parts a person would slow down most are exactly the ones that
  measure fastest.

### 14.1 The summit is reachable — the last bounce lands

*Measured on the superseded layout — `PLATFORM_ORBIT` 4.2, a pad 2.4 u deep, `BOUNCE_REACH` 2.1. The
link still lands on the re-solved one, re-driven rather than re-measured at this depth; every offset
below is a distance to a pad that has since moved. See the box at the head of §14.*

This was the single thing most worth running, because the geometry alone could not decide it:
`stepHoming` bounces from wherever the capsule is when `travelled >= remaining`, up to
`homingSpeed * MAX_DT` = 0.8 u short of the crystal, and `towerLevel.ts` says outright that
`auditLayout` does not model that.

**It lands.** Nineteen runs of the real final link — jump off `towerPlatform_18`, lock `crystal_5`,
dash, bounce, steer in under air control — put the capsule on the summit balcony **nineteen times**:
two taken as part of a full climb, five at 60 fps pressing 4 to 20 frames after the jump, four more
at 60 fps pressing late (24 to 36 frames, past the apex and on the way down), and eight at 30 fps,
which is `dt` exactly at `MAX_DT` and therefore the worst frame the clamp allows. A twentieth run
pressed on the take-off frame itself, inside the coyote window, where the press is correctly spent as
an ordinary jump rather than a dash.

Measured across those runs:

- **The launch is short of the crystal by 0.063–0.467 u**, not by the 0.8 u worst case — because
  `stepHoming` corrects course every frame, the last frame's `remaining` is usually well under
  `homingSpeed * delta`. The 30 fps runs are the deep end of that range, as expected.
- **Every landing sits 0.13–0.97 u from the balcony's centre**, which resolved into the pad's own
  axes is 0.10–0.50 u along the face and up to 0.97 u outward. All of them fall on the side of the
  centre line **away** from the pedestal — the sign `SUMMIT_PEDESTAL_OFFSET` chose, and the reason
  it chose it.
- **Those landings are outside the band `auditLayout` models, and neither document said so.** The
  audit's landing rule allows an outward offset up to `pad.depth / 2 − CAPSULE_RADIUS` = **0.70 u**
  (a capsule entirely on the slab) and treats the along-face offset as zero throughout, because the
  bounce rises on the pad's own bearing. The measured landings run to **0.97 u outward** and 0.50 u
  along. Read as a drift, 0.97 u outward is `BOUNCE_REACH` 2.1 less 0.97 = **1.13 u**, short of the
  1.40–1.84 u band `BOUNCE_REACH`'s doc calls the safe drifts. Nothing failed: the capsule's axis is
  still over a pad half 1.2 u deep, and all nineteen landings held. But the model the audit enforces
  is narrower than what the level actually does, so passing the audit is not evidence about landings
  like these, and a future pad sized against the audit alone would be sized against the wrong band.
  Recorded, not fixed — widening the model is a change to what `auditLayout` warns about, and the
  measurement that would justify it is the one nobody has taken.
- **Nothing landed on the pedestal**, which is what `TOWER_SUMMIT_PEDESTAL_HEIGHT` argues cannot
  happen. Confirmed rather than merely re-derived.

The section-3 link onto `towerPlatform_16` and the section-2 chain's last bounce onto
`towerPlatform_13` land the same way — 0.20 u and 0.34 u from their pads' centres.

### 14.2 The sections are NOT matched on play time — §3's premise is falsified

One continuous climb, 60 fps, no falls, walking approaches:

| Section | Height | Content | Frames | Seconds |
|---|---|---|---|---|
| 1 | 18 u | 13 jump steps | 905 | **15.08** |
| 2 | 24 u | a 4-crystal homing chain | 142 | **2.37** |
| 3 | 20 u | 4 jump steps + 2 links | 423 | **7.05** |
| — | 62 u | floor to summit | 1470 | **24.50** |

A second run with running approaches through section 1 took **813 frames, 13.55 s** — about **10 %**
faster, not a different order of magnitude, because what a step costs is the jump arc and not the
ground speed.

§3 predicted "roughly equal play time" and set the heights 18 / 24 / 20 to buy it. Measured, the
sections run **15.1 : 2.4 : 7.1**. Section 1 is **6.4×** section 2.

**The reason is precise, and it is not that the chain is fast.** Per unit of content, at 60 fps:

- **a jump step costs 62–79 frames, 1.03–1.32 s.** That range is the spread across individual steps,
  not between the two runs: the *mean* step is 905 ÷ 13 = **69.6 frames, 1.160 s** walking and
  813 ÷ 13 = **62.5 frames, 1.042 s** running, so what walking costs over running is 0.12 s a step —
  the tenth of a second, and a different quantity from the 62–79 above it;
- **a chained homing link costs 22–23 frames, 0.37 s** — you bounce out of one crystal straight into
  the press for the next, and the chain pays for the descent only once, at its end;
- **an isolated homing link — dash, bounce, then ride the bounce down onto a pad — costs 71 frames,
  1.18 s**, which is a jump step.

**Those three rebuild the table, and the residuals are worth stating rather than closing.** Section 1
is 13 × 69.6 = 905 frames, which is exact by construction — the mean is the total over the count, so
it checks nothing; what it does check is that a mean of 69.6 sits inside the 62–79 measured per step.
The other two sections are genuine reconstructions:

- **Section 3** is 4 steps and 2 isolated links: 4 × 69.6 + 2 × 71 = **420.5** against **423**
  measured. Residual **2.5 frames**, 0.04 s.
- **Section 2** is *not* four chained links, and reading it as four is what made these figures look
  irreconcilable. Only three of its four links bounce into the next press; the fourth ends on a
  platform, so it pays an isolated link's descent. 3 × 22.5 + 71 = **138.5** against **142**
  measured. Residual **3.5 frames**, 0.06 s — the approach and the first press, before the chain
  begins.

Both residuals are positive and small, which is what an unattributed approach frame or two looks
like; neither was distributed into the per-unit figures to make the arithmetic close.

So a link and a step cost the same, and only *chaining* is cheap. §3's arithmetic ("a 20-unit
stretch is ~14 platform steps or ~3 crystals") converted **height** correctly and then assumed the
two vocabularies cost the same per unit of height. They cost the same **per link**, which is the
opposite conclusion: 13 steps against 4 links is a 3.2× difference in count, and the times follow
the count.

**What this means for the numbers.** If the sections are to be matched on time, the height table is
the wrong lever: section 1 has to lose most of its steps and section 2 has to gain links, so
`SECTION_1_STEPS` and `SECTION_2_LINKS` are what move. That is a design decision and is left to the
owner (§14.8); nothing in the level was changed for it. The **Untuned** marking on §3's table and on
`towerLevel.ts`'s counts stands, and now has a measurement under it instead of a derivation.

The scripting caveat, stated plainly: a person pays for aiming and for missed jumps, and both fall
more heavily on the chain than on the steps. But nobody beats the arc — thirteen arcs is thirteen
arcs — so the *floor* on section 1 is ~13.5 s and the *floor* on section 2 is ~2.4 s, and no amount
of human slowness on the chain closes an eleven-second gap without making the chain something other
than a chain.

### 14.3 Falls, and the respawn

Seven falls — five taken by walking off a real ledge, two entered off the homing chain in section 2
— each with the camera at the level's own opening pitch. **Duration is measured: the interval from
the frame the fall is detected to the frame the respawn fires.** The last column is not measured and
is marked so.

| From | Drop | Duration (detected → respawn) | Peak speed | Free fall from rest — *computed* | Ends at |
|---|---|---|---|---|---|
| the summit balcony, y 62.4 | 23.9 u | **1.250 s** (75 f) | 34.0 u/s | 1.411 s | respawn to the section-3 pad |
| just under y 42 — the deepest the spacing allows | 25.0 u | **1.083 s** (65 f) | **36.0 u/s** | 1.443 s | respawn to the section-2 pad |
| the homing chain at y 33.7 | 19.3 u | **0.917 s** (55 f) | 32.0 u/s | 1.268 s | respawn to the section-2 pad |
| off a section-3 checkpoint pad | 4.5 u | **0.450 s** (27 f) | 15.4 u/s | 0.612 s | respawn to that same pad |
| off a section-2 checkpoint pad | 4.5 u | **0.450 s** (27 f) | 15.4 u/s | 0.612 s | respawn to that same pad |
| a section-1 ledge, y 8.8 | 7.7 u | — | 19.8 u/s | 0.801 s | **the floor catches it** — no respawn |
| off the edge of the floor itself | 4.5 u | **0.467 s** (28 f) | 15.1 u/s | 0.612 s | respawn to the tower spawn |

**Duration is not the time of a free fall from rest, and it should not be read as one.** Every clock
in that column starts with the capsule *already descending*, for two different reasons:

- On a walk-off, `groundContact.ts`'s `FALL_GRACE_SECONDS` 0.2 means an uncommanded loss of support
  does not read as airborne until 0.2 s have gone by — at `gravity` 24 the capsule is falling at
  **~4.8 u/s** by the time the clock starts.
- The two section-2 rows were entered off the homing chain rather than off a ledge, riding a
  `homingBounceSpeed` 9 bounce back down, so they start faster still.

Every measured duration is a whole frame count at 60 fps — **75 / 65 / 55 / 27 / 27 / 28 frames** —
which is what a frame-clocked measurement looks like and what an analytic figure would not be. The
last column is arithmetic on `Drop`, not a stopwatch: `√(2·Drop/gravity)` is what each drop *would*
take from a standing start, and it is longer than Duration on every row for exactly the reason
above. It is here for comparison against §4's law and is never the recorded time.

Three things this settles:

- **§4's arithmetic holds, and the check that says so is not circular.** Back the entry speed
  out of each row's own two independently recorded figures: `v0 = Peak − gravity·Duration` gives
  **4.0 / 10.0 / 10.0 / 4.6 / 4.6 / 3.9 u/s** — the four walk-offs cluster a little below the
  ~4.8 u/s that 0.2 s of `FALL_GRACE_SECONDS` free fall would give, the right order of magnitude
  and the right sign for a clock that starts at detection rather than at rest, but the shortfall
  (0.2 to 0.9 u/s across the four, worst on the smallest drop) is not accounted for by anything
  measured here and is left unexplained; the two chain rows land on `homingBounceSpeed` 9. Feed
  those back through `h = (v0 + Peak)/2 · t`, an identity that holds only under *constant*
  acceleration, and it reproduces each row's `Drop` to within **1.5 %**, and exactly on both
  checkpoint rows. `Drop` is corroborated independently against `towerLevel.ts`'s checkpoint
  heights, so no column here is another column restated: three separately sourced numbers agree
  only if `gravity` is a constant 24 the whole way down. **That** is what says there is no drag
  and no terminal speed anywhere — not the durations, which measure a different interval. The
  36.0 u/s deepest case is the ~36.7 u/s `DESCENT_SMOOTHING`'s own doc predicted for it.
- **The floor is what catches a section-1 fall**, exactly as §4 says: the respawn rule needs the
  capsule `TOWER_FALL_MARGIN` below y 0 and the floor is at y 0, so a fall inside section 1 is a
  landing, not a respawn. Walking off the *edge* of the floor is what reaches checkpoint 0, and it
  does, in 0.467 s.
- **The respawn is a cut, with zero glide frames.** Measured on every fall that fired one. On the
  summit fall: the frame before, capsule 38.467 and camera 41.985; the respawn frame, capsule
  43.300, root 43.300, camera 43.728; and the four frames after it, camera 43.728, 43.728, 43.727,
  43.726. The camera arrives at the checkpoint on the frame the respawn is decided and does not move
  afterwards. §13.1's claim for `teleport` plus `snap()` is reproduced on the built tower.

**`TOWER_FALL_MARGIN` 4 now has one edge watched and one still unfelt.** Stepping off a checkpoint
pad costs **0.450 s** between fall detection and the respawn firing — the "hang before it
resolves" end of the constant's own argument, now a number. Whether 0.45 s of hanging reads
as a hang is §14.8's. The other edge — "deep enough that stepping off a ledge just below a
checkpoint does not snap you" — is reachable and was not exercised. Section 1's thirteen steps land
at `18·i/13`, and because `stepTowerProgress` compares the capsule CENTRE against `activateY`, a
player stepping back down off the section-2 checkpoint at 18 sits 0.385, 1.769 and 3.154 u under it
on the first three steps — no respawn — and 4.538 u under on the fourth, which does respawn. The
boundary therefore falls between the third and fourth step down, and nobody has walked it; `TOWER_FALL_MARGIN`'s own doc carries the
arithmetic.

### 14.4 Framing on the fall — and the thing the framing numbers do not say

The root's position in frame, as a fraction from the top, with 1.0 the bottom edge. All figures at
60 fps, and aspect-independent: the camera is `FOVMODE_VERTICAL_FIXED`, verified by measuring the
same standing root at **0.5723** at 16:9 and at 0.76:1.

- **The summit fall: root 0.619 → 0.990, off the frame for 0 frames.** The 0.990 peak lands where
  `DESCENT_ENGAGE_SPEED`'s doc says it will, on the transition just after the term engages. The
  deepest fall and the chain fall both peak at exactly 0.990 as well.
- **The head never leaves the frame**: 0.81 at worst, across every fall.
- **The feet do leave it**, for 53 of the summit fall's 75 frames, reaching **1.25** — a little
  further than §13.2's 1.22. The body reads; the soles are cut off. Those 75 frames are §14.3's
  1.250 s at 60 fps, counted from the same frame.

Every one of those is a **frustum** measurement, and a frustum measurement is not a visibility
measurement. Which brings the one thing this playthrough found that no earlier pass could.

**On a fall taken facing outward, the camera is inside the column for the whole descent and the
player sees nothing.** *(Measured at `PLATFORM_ORBIT` 4.2 as well, and the head box voids these
distances just as it voids the climb's: the outer edge stepped off has moved from
`4.2 + 2.4/2` = 5.4 u to `4.6 + 3.2/2` = **6.2 u**, so every figure in this paragraph shifts about
0.8 u outward — 1.20–1.77 becomes roughly 2.0–2.6. Re-derived, not re-measured. The finding is
unaffected and that is why the number is worth stating: 2.6 is still 0.6 u inside a
`TOWER_COLUMN_RADIUS` of 3.2, so an outward-facing fall is still watched from inside the column. The
re-solve narrowed the problem; it did not remove it.)* Measured:
step off the outer edge of a platform at `PLATFORM_ORBIT` 4.2 with
the camera behind you, and the camera sits **1.20–1.77 u from the axis** against
`TOWER_COLUMN_RADIUS` 3.2 — inside, on **50 of 50 falling frames**. The root's screen fraction over
that same fall reads 0.611–0.994, a textbook well-framed fall; the rendered frame is a single flat
colour, 34/34/35, edge to edge. That is Task 11's mitigation working exactly as written — with
`backFaceCulling` off you see the column's inside surface rather than the world through it — and it
means the wall is what you watch instead of yourself. §13.2 carried this as "**Inferred, not
observed — no tower column exists to test against yet**". It is now observed, on the built tower,
and it is worse than it was inferred to be: this is not a camera clipping through scenery, it is the
fall §2 promises the player will watch, played out behind a blank wall.

**The climb itself never does this.** *(Computed at `PLATFORM_ORBIT` 4.2 — the platforms now stand at
4.6 and every figure in this paragraph moves with them, though none of them moves inside 3.2. See the
box at the head of §14.)* The camera's distance from the axis was computed for every aim
the route requires, from `followCamera`'s own placement formula: **7.93 u** for each of the sixteen
platform-to-platform steps, **6.42 u** for each of the three aims up at a launch crystal, **9.09 u**
for each chain aim. Not one of the twenty-two is inside 3.2.

*(Recounted from the generated layout, which has 20 platforms: section 1's 13 jump steps are the
floor onto `towerPlatform_0` plus 12 platform-to-platform, and section 3 adds 4 more — 16
platform-to-platform, 17 jump steps in all, which is §14.2's own 13 + 4. An earlier count of
"nineteen" and "twenty-five" was wrong on both. The seventeenth step, off the floor, is not one of
the aims above: it is taken from `TOWER_SPAWN` at `SPAWN_ORBIT` 7 rather than from a platform at
`PLATFORM_ORBIT` 4.2, so 7.93 is not its figure and nothing computed one. §14.7 watched that opening
frame instead — the column, the floor and the first platform are all on screen from it, which a
camera inside the column could not show. The conclusion is unaffected either way.)*

And a fall taken *tangentially* — the missed-jump case, where the camera is still pointing along the
spiral — keeps the camera at **5.98 u** and the knight visible and framed; that was watched on screen
as well as measured.

So the honest statement is narrower than either "the camera clips the column" or "the camera is
fine": **the route never puts the camera inside the column; turning to face the column does, and so
does every fall taken while facing outward.** §13.3's budgeted obstruction work is still the answer,
and it is now worth more than it looked.

### 14.5 The round trip

Run three times, in both directions, in one session.

- **Hub → tower.** Walking onto the colonnade pedestal fires `onEnterTower`, and the tower arrives
  with the capsule at `TOWER_SPAWN` (3.5, 1.3, 6.062) — the coordinate the level computes, to ten
  decimal places.
- **Summit → hub.** Walking onto the summit pedestal fires `onExit`, and the hub arrives with the
  capsule at **(−5.408, 1.978, 28.849)**, measured at **3.207 u** from the pedestal's centre against
  `PEDESTAL_RADIUS` 1.6. Outside the trigger by a whole pedestal radius, as §5 asks.

  **That triple is a settled sample, not `portalReturnSpawn()`'s point**, and calling it the
  function's point was wrong. The function returns **(−5.410277, 2.165865, 28.854809)**; the sample
  sits 0.188 u lower and a few millimetres off in x and z, which is the capsule falling the
  `SPAWN_CLEARANCE` 0.3 u it is deliberately spawned above the ground and coming to rest on the
  terrain collider — a mesh approximation of `terrainHeight`, not the analytic field itself. The same
  bullet above says 200 frames were driven standing on that spawn, so a sample read there has had
  every chance to settle.

  **The margin itself is not a measurement and should not be read as one.** `portalReturnSpawn` is
  `RETURN_DISTANCE` = `PEDESTAL_RADIUS` × 2 along the line to the origin, so the constructed distance
  is **3.200 u exactly** — that is the number §5's "clear of the edge" rests on, and it is exact by
  construction rather than by luck. The 3.207 above is what the settled capsule measured, and it is
  worth having only because it says the settle moved the player *outward* of the constructed point
  rather than in toward the trigger.
- **The return does not re-enter.** 200 frames driven standing still on the return spawn, twice:
  the hub stays the hub.
- **Stepping off and back on fires again.** Walking back onto that pedestal re-entered the tower,
  with progress reset to checkpoint 0 and the capsule at `TOWER_SPAWN` — and then a third time,
  after a second full exit.
- **Not established: the disarmed-start half of the rule.** `portalReturnSpawn` puts the player
  outside the radius, so the trigger arms on the very first frame and there is no way, from outside,
  to observe the frame where a player would have been standing on their own trigger. That path stays
  covered by `portalTrigger.test.ts` and by nothing else.
- **Not established: how long a swap takes.** See the note at the head of this section.

### 14.6 The window resize

Task 7 moved `engine.resize()` and its listener into `App.svelte` and never watched one. Watched
now, across two aspect ratios:

- **On load**, the drawing buffer comes up at the canvas's CSS size (1280 × 720 for a 1280 × 720
  viewport) — the constructor-time `engine.resize()` doing its job.
- **On a resize event**, the buffer follows exactly: at a 980 × 1289 CSS box the buffer is
  980 × 1289, the GL viewport is `0, 0, 980, 1289`, and the engine's aspect ratio is 0.7603 against
  the box's own 0.7601. **No stretch and no clip**, confirmed on screen at portrait as well as in
  the numbers.
- One honest caveat about the delivery: this pane does not reliably fire a native `resize` when the
  emulated viewport changes, and while it has not, the buffer stays stale and the canvas *is*
  stretched. Dispatching the event by hand fixes it at once. So what is verified is the listener,
  `engine.resize()` and everything downstream; the browser's delivery of the event is the one
  link in the chain this environment could not be trusted on.
- **`hardwareScalingLevel` is 1** — the `Engine` is constructed without `adaptToDeviceRatio`, so the
  drawing buffer is CSS pixels and on a HiDPI display the image is upscaled. That is a sharpness
  choice rather than a resize defect, and nobody has decided it deliberately.

### 14.7 What else was watched

*Where these sit in the head box's split: the audit bullet is **void** and says so at length in its
own text. Of the rest, one is geometry and is argued in place below; the other four are about the
code or about what was on screen for reasons no distance enters into — the render, the backlit
pedestal (a bounce landing on the balcony's centre line against a pedestal 2 u along the face, both
unchanged by the re-solve), the pointer-lock rejection, and the ring of light nobody has looked at —
and all four **still hold**.*

- **The tower renders.** White column, white floor, white slabs, near-black-blue sky, the knight's
  own shadow on the slab under it and the column's shadow on the floor. Screenshots taken at the
  spawn, at y 53 mid-climb, mid-fall and on the summit.
- **The opening frame is right.** From `TOWER_SPAWN` at `SPAWN_ORBIT` 7 the column, the floor
  and the first platform are all on screen at the camera's default yaw — which is what that
  constant's doc argues for and could not previously claim. **This one is geometry and it survives,
  by argument rather than by re-watching:** the spawn did not move (`SPAWN_ORBIT` 7 and the bearing
  are both unchanged, §14.5), and the first platform moved *toward* it — centre 4.2 → 4.6, outer face
  5.4 → 6.2 — so the thing that had to be in frame is now nearer and larger in it, on the same
  bearing. The column is unmoved. Nothing here can have left the frame; what it looks like at 0.300 u
  of floor between the capsule and that slab (see `SPAWN_ORBIT`) has not been seen.
- **No layout audit warning fired**, across three builds of the tower. `auditLayout` had nothing to
  say about the level that was actually generated. **This line no longer holds.** The audit has since
  gained a fourth rule — the straight line between two platforms has to clear the column by the
  capsule's radius and a margin — and it fires on all sixteen jumps of the layout climbed here. That
  it was silent while the level played wrong is exactly why the rule was added; see the box at the
  head of §14.
- **The summit pedestal is backlit from its own landing.** The bounce lands on the balcony's centre
  line and the pedestal stands 2 u along the face toward the sun, so from where the player lands it
  reads as a dark disc on a white slab rather than as white on white. Watched, not measured, and not
  called a defect here — `SUN_DIRECTION` had simply never been looked at before.
- **One console error, and it is the sandbox's**: `followCamera`'s `canvas.requestPointerLock()`
  returns a promise and nothing catches it, so a browser that refuses the lock leaves an uncaught
  rejection in the console. The refusal is this pane's doing; the unhandled rejection is the code's.
  Recorded, not fixed — it is not something this playthrough falsified.
- **Not looked at at all: the hub's ring of light** (`portalRing.ts`). Its constants say nobody
  has seen it, and that is still true.

### 14.8 The owner's calls, not this document's

Each of these was set up so that it *can* be judged, and none of them is answered here.

1. **Do the three sections feel equal?** They do not *measure* equal (§14.2), by a factor of six.
   What the level should do about it — fewer steps in section 1, more links in section 2, or a
   different premise than equal time — is a design decision.
2. **Does a 1.25 s fall read as a loss rather than a wait?** The duration is confirmed, and the
   knight is in frame for all of it; whether it lands as a loss is a feel.
3. **Does the white column read against the near-black sky?** Rendered and screenshotted at four
   heights. Whether it reads is the eye's.
4. **Is 0.45 s of hang the right price for stepping off a ledge?** That is `TOWER_FALL_MARGIN` 4's
   cost at its shallow end.
5. **Do the clipped feet matter?** The soles are outside the frame for most of every fall.
6. **Is watching a fall from inside the column acceptable for now?** (§14.4.) It is the one finding
   here that may be worth a code change before anything else moves.
7. **Does the backlit summit pedestal read as the way out?**
8. **Should the tower be walkable, or is speed part of the climb?** `auditLayout` bounds every step
   by what a walking player can cross footprint to footprint — a slab holds a capsule when its
   centre is over it — and the shipped tower clears that by a wide margin: 0.922 u of air against
   2.136 u of reach on section 1's twelve steps (rise `18/13` = 1.3846 u) and 2.119 u on section 3's
   four (rise 1.4 u). Read more strictly, as launching and landing a clear capsule radius from either
   drop, the same step needs **2.288 u**, and walking is short on all sixteen — **0.152 u** on
   section 1's, **0.168 u** on section 3's — while running has 4.271 u and 4.238 u respectively and
   never notices either. That is the geometry behind the playtest note that the jumps needed speed. Whether "you can walk the whole
   tower" is a promise the level owes is a design call: honouring it means a narrower `TURN_DEGREES`
   or a wider `PLATFORM_WIDTH`. Declining it needs no edit — `TURN_DEGREES` and `footprintDistance`
   already state both readings and which one the audit holds — but it does mean the tower has a
   movement mode it is not built for, which is worth deciding on purpose.
