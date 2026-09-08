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
| `followCamera.ts:92,105` | Keeps the camera above `terrainHeight` | Probably benign *by luck* — the clamp only pushes the camera up, and a camera 60 u above a field whose flattest recorded site sits at 1.17 (`landmark.ts`) is already far above it. Not benign by design, and not sampled: the field's actual range, and its `EDGE_RADIUS`/`BARRIER_TOP` behaviour, are unmeasured here |
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
