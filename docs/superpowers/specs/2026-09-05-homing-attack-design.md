# Homing Attack — design

Date: 2026-09-05. The first piece of the game-modes milestone, built and tuned **inside the existing
hub** rather than inside a level, for the reason §1 gives.

## 1. Why this comes before the tower

The milestone after M4 is the game modes. The owner's first mode is an **Only Up-style vertical
climbing tower**, with a 3D-Sonic-style **Homing Attack** as its signature traversal move.

The move ships first, alone, in the hub. That ordering is not "smallest first" — it is a dependency:
**the move's numbers are the tower's grammar.** Jump height, dash range, cone angle and bounce height
between them decide how far apart the tower's crystals can sit and whether a chain is possible at all.
A tower built before those numbers settle has to be rebuilt the moment they move; a move tuned in the
hub against scattered test crystals costs nothing to re-tune.

The hub is also the only place this can be built right now without a collision: mode routing lives in
`App.svelte`, which PR #33 is concurrently rewriting (§8).

## 2. What the move is

Settled with the owner, option by option:

- **Targets are static anchors, not enemies.** Hitting one bounces the player and lets them home
  again, so chains carry you upward. No damage, no health, no enemy AI — README's near-term vision
  puts combat out of scope, and a traversal move does not need it.
- **The anchors are crystals**, procedurally generated the way `scatter.ts`'s rocks are (`CreateIcoSphere`),
  so the phase adds no model, no texture and nothing to Git LFS.
- **Trigger: press jump again while airborne.** On the ground, jump still jumps.
- **Selection: nearest crystal inside a cone about the camera's forward direction.** The player aims
  with the camera, which is how a third-person player aims at anything. The alternative — "any crystal
  in radius, no direction" — is more forgiving and was rejected on purpose: it removes route choice,
  and route choice is what makes a climb a climb rather than a queue.
- **The bounce is straight up, a fixed speed.** Not "continue through in the dash direction", which
  is more expressive but makes aim a second skill axis while the feel is still unset. Upgrading later
  is a one-line change at the same site (replace the fixed up-vector with a reflection), so nothing is
  foreclosed.
- **Crystals persist.** They are not consumed. A fall must never make the route unwinnable; the
  consumable variant is a deliberate later option, not v1.
- **No air dash when nothing is in the cone.** Pressing with no target does nothing at all. An
  Only Up climb should be punishing about precision, not about an input that launches you off a ledge
  because the camera was pointing at empty sky.

## 3. Domain: selecting a target

New pure module `src/domain/hub/character/homingTarget.ts`. It is separate from the movement module
because it is geometry, not kinematics, and it has its own failure modes worth testing alone.

```ts
selectHomingTarget(
  from: Vec3,
  cameraForward: Vec3,
  candidates: readonly Vec3[],
  config: HomingConfig,
): number | null
```

A candidate qualifies when **both** hold: its distance from `from` is at most `homingRange`, and the
angle between `cameraForward` and the direction from `from` to the candidate is at most
`homingConeHalfAngle`. Among the qualifying candidates the **nearest** wins; an exact tie resolves to
the lower index, so the function is deterministic.

It returns an **index**, not a position. The caller needs to know *which* crystal was hit — for the
trail, for a later consumable variant, and for anything the tower wants to attach to a specific anchor.

The presentation layer is what bridges the two halves: it holds the crystal list, calls this with the
camera's forward vector, and passes `candidates[index]` into §4's `homingTarget`. The domain never sees
the list, and the movement half never sees an index — each half takes the shape it actually needs.

Vitest, red before green:

- a candidate inside both the cone and the range is selected;
- one outside the cone is not, and one outside the range is not;
- with several qualifying, the nearest wins;
- an exact distance tie picks the lower index;
- an empty candidate list returns `null`;
- **a candidate exactly at `from`** returns something sane rather than `NaN` — the direction vector is
  zero-length there and normalizing it is a divide by zero. This is the degenerate case the geometry
  has, and it is reachable: a crystal can sit where the player is standing.
- `cameraForward` is normalized by the function, not assumed — the caller hands over a camera vector
  and a non-unit one must not silently rescale the cone test.

## 4. Domain: the dash

`CharacterMotion` gains `homing: { readonly target: Vec3 } | null`, and `characterMovement.step`
branches on it. The alternative — a separate module composed alongside `step` in the presentation
layer — was rejected because it would give **velocity two owners in the same frame**. That is the
mistake the run/jump work already paid for and fixed by giving ground contact a single pure owner
(`groundContact.ts`); repeating it here would be repeating a known defect.

`MovementInput` gains exactly **one** new field:

```ts
readonly homingTarget: Vec3 | null;
```

Not a `homingRequested: boolean` plus a target. "The player pressed it but there is no target" is not a
state the domain should be able to represent — the presentation layer resolves the press and the
selection together and hands over either a target or nothing (principle 16, make invalid states
unrepresentable).

`step`'s branches:

- **Entering** — not already homing, `homingTarget` is non-null, and the player is **airborne**. On the
  ground the same button is an ordinary jump.
- **Dashing** — velocity is `homingSpeed` along the direction to the target, RECOMPUTED every frame
  from presentation's live offset to the locked crystal rather than fixed at entry (§5 explains why
  that is not optional, but it also has a feel consequence: the dash genuinely homes, correcting
  course toward the target each frame rather than committing to a straight line decided at the press).
  **Gravity is suspended and steering input is ignored**; facing turns to the (live) dash direction.
  This is the whole reason the state has to live inside `step`: three things it normally does
  unconditionally are conditional now.
- **Arriving** — when the frame's travel would reach or pass the target, the dash ends: velocity
  becomes `(0, homingBounceSpeed, 0)` and `homing` clears. The player is now airborne and rising, which
  is exactly the state a new dash can start from, so chaining needs no extra machinery.
- **Timing out** — see §5.

### 5. The timeout, and why it is not optional

The domain produces a velocity; the actual displacement is applied by Havok's character controller,
which **collides**. A dash whose straight line passes through terrain does not reach its target — the
controller stops the capsule against the wall while the domain happily keeps asking for
`homingSpeed` toward a point it can never arrive at. Without a bound the player is pinned to that wall,
gravity suspended, forever.

So `homing` carries an elapsed time and aborts at `homingMaxDuration`, restoring ordinary airborne
motion and gravity. The abort is a normal outcome, not an error: a mistimed press near a wall should
drop you, not trap you.

**This bound only works if "remaining distance" reflects reality.** The first shipped version computed
it by dead reckoning — decrementing `homingSpeed * delta` every frame regardless of whether the capsule
had actually moved — and a selectable target is always within `homingRange` (12), so that dead-reckoned
distance always hit zero within `homingRange / homingSpeed` = 0.5s, strictly before `homingMaxDuration`'s
0.6s. The timeout branch could never fire for any target, obstructed or not; a blocked dash instead
"arrived" on schedule and bounced off the obstacle. The fix is for `step`'s `homingTarget` input to
carry the LIVE offset from the player to the locked crystal, supplied by presentation every frame the
dash is in flight rather than only on the press frame, and for the domain to derive both direction and
remaining distance from it each frame instead of carrying either forward. A dash a wall has actually
stopped then has an offset that stops shrinking too, and only the elapsed-time bound ends it — which is
what makes this section's "not optional" true of the shipped code, not just of the intent behind it. A
frame on which presentation cannot report a live offset for an in-flight dash is treated the same as a
timeout: the dash ends safely rather than continuing on stale data.

## 6. Chaining needs no charge counter

The entry condition is "airborne, and a target is in the cone". After a bounce the player is airborne
and rising, so the next press works if — and only if — they can aim at another crystal. That is the
whole rule. A charge counter would add state that says nothing the position and the camera do not
already say, and in the tower it is crystal spacing that sets the rhythm, not an allowance.

An unbounded chain is therefore possible where crystals are dense. In the hub that is a playground and
harmless. In the tower it is a level-design lever, and the tower's spec owns it.

## 7. Constants — measured against the running scene, and left as they were

`homingRange`, `homingConeHalfAngle`, `homingSpeed`, `homingBounceSpeed`, `homingMaxDuration`, beside
the existing movement constants.

Each shipped with a **derived** starting value and an explicit **Untuned** marking, in the house style
this repo's review has repeatedly enforced: a constant may not claim a tuning that did not happen.
The browser pass (2026-09-05, full report at `.superpowers/sdd/2026-09-05-homing-attack/task-7-report.md`)
ran all four objective checks from the task brief against `window.hub`/`window.moveConfig` in the dev
build, using console-driven teleports and a manually-stepped render loop (`scene.render()`) rather than
real-time play, because the Browser pane's compositor throttles `requestAnimationFrame` to near zero
when not the foreground surface — `scene.render()` steps the same domain/physics code deterministically
regardless.

**Every check passed at the derived value, so every constant keeps its Untuned marking. None was
changed.** Task 7's own rule is to tune only when a check fails and a constant change fixes it; here
no check that a constant can fix failed, so touching any of the five would have been an unjustified
edit this repo's review already treats as a defect.

- `homingRange` (12) and `homingConeHalfAngle` (0.6109 rad): checked against the `(3,4,-10)` /
  `(-3,4,-10)` pair. Positioned so one crystal was centred in the fixed camera cone and the other was
  not, the dash reliably reached the aimed-at crystal and never the other (arrival within ~0.05 units
  of each), across both sides of the pair. Left untuned.
- `homingSpeed` (24, 3x `runSpeed`): every dash in every check completed in well under half a second and
  read only in domain telemetry, not by eye (see the "art direction" note in the report). No check
  measures dash speed. Left untuned.
- `homingBounceSpeed` (9, equal to `jumpSpeed`): checked by chaining `(0,3,-8) -> (0,5.5,-13) ->
  (0,8,-18)`. Both bounces cleared enough height and forward distance for the next crystal to be
  in range and cone from the landing spot; the chain completed end to end. Left untuned.
- `homingMaxDuration` (0.6s): checked with a physical obstruction placed on the direct line to a
  crystal. **Finding, not a tuning call:** `homingMaxDuration`'s abort branch
  (`characterMovement.ts`'s `stepHoming`) never fires for any in-range target, obstructed or not,
  because `remaining` is dead-reckoned from `homingSpeed * delta` alone — it has no way to know the
  capsule is physically stuck. Since a selectable target is always within `homingRange` (12), the
  dead-reckoned "arrival" always resolves within `homingRange / homingSpeed` = 0.5s, strictly before
  `homingMaxDuration`'s 0.6s. Measured: dashing into an obstruction 4 units out on the way to `(0,3,-8)`
  stopped the capsule dead at the obstruction (position frozen while `homing.remaining` kept counting
  down regardless), then at `remaining <= 0` (elapsed ~0.34s, not 0.6s) the knight bounced straight up
  from the obstruction rather than falling. No value of `homingMaxDuration` changes this outcome: any
  value large enough not to clip legitimate max-range dashes (i.e. above 0.5s) is by definition never
  reached first. This is a structural property of `stepHoming`'s arrival check being time-based rather
  than position-based, not a badly-chosen constant, so it is left untuned and out of Task 7's scope
  (constants and this doc only) — see the report for the follow-up this should become.

None of this is the art-direction pass — "does the dash read as decisive", the trail, the spin — which
stays the project owner's call and is untouched here.

## 8. Presentation

| File | Status | Responsibility |
| --- | --- | --- |
| `src/presentation/babylon/crystals.ts` | new | Procedural crystal meshes and their world positions |
| `src/presentation/babylon/playerController.ts` | edit | Read the press, run the selection, feed `homingTarget` |
| `src/presentation/babylon/knight.ts` | edit | Dash animation, the bounce's clip seam, the trail |
| `src/presentation/babylon/hubScene.ts` | edit | Build the test crystals |

`crystals.ts` **takes a `Scene`** and does not reach for the hub. The tower will be a second Babylon
`Scene` (§9), and crystals are the one thing both need; writing it scene-agnostic on day one costs
nothing and is the difference between reusing it and rewriting it.

**The trail** is `TrailMesh` from `@babylonjs/core/Meshes/trailMesh` — already in the installed 9.21.0,
no new dependency. On during the dash, off at the bounce or the timeout.

**The bounce's animation seam is a number this repo already measured.** `knight.ts` documents the jump
clip against its hip-height curve: standing 0.99, crouch bottom 0.723 at 0.54 s, back through standing
at **0.76 s**, apex 1.240 at 1.05 s, touchdown ~1.30 s. The airborne segment already starts at 0.72 s
deliberately, past the anticipation crouch, because the game's jump is instantaneous and a wind-up
played after the capsule has left the ground reads as the knight hanging in mid-air still winding up.
A bounce is the same situation, so it starts from the same seam rather than from the clip's head.

## 9. The flying-kick clip

The owner supplied `Flying Kick.fbx` (Kaydara FBX binary, 435 872 bytes). It becomes the dash's
animation, through the Godot retarget pipeline the README documents and that Run and Jump already came
through (PR #23).

**It is sequenced last and it does not block anything.** The move ships first with a placeholder — a
procedural spin during the dash, which needs no asset and still signals "this is not a jump" — and the
clip replaces it when the pipeline run succeeds. The reason for that ordering is risk, not politeness:

- Regenerating the GLB re-runs a `gltf-transform` pass with a **known defect**: it writes
  spec-default-valued scalars as `0`. Three shipped that way (`normalTexture.scale`,
  `emissiveStrength`, `metallicFactor`) and `knight.ts` still carries load-time corrections for them.
  The README's instruction is explicit — **no scalar in a regenerated GLB may be trusted without
  checking it against the glTF spec default** — and if the new export is clean, those corrections
  should be dropped rather than left as dead guards.
- The Godot import can serve a **stale cache**: `.godot/imported/<Name>.fbx-*` must be deleted first or
  the bone renaming silently does not apply, and "silently" is the operative word.
- The FBX needs its `_subresources` bone_map block copied from `Walking.fbx.import`, an entry in
  `SRC` in `tools/extract_anims.gd`, and — because it is a one-shot — an entry in `NON_LOOPING`,
  which currently holds only `Jump`.
- The file is renamed `FlyingKick.fbx` to match the existing `Idle` / `Jump` / `Running` / `Walking`
  convention; the space in the supplied name has no business in a resource path.
- `knight.ts`'s clip guard currently throws unless Idle, Walk, Run **and** Jump are present. It gains a
  fifth lookup, and the error message has to gain the fifth name with it, or a future missing clip
  reports the wrong list.

If the pipeline run fails or the regenerated GLB's scalars cannot be made trustworthy, the placeholder
ships and the clip becomes its own piece of work. That is a real possible outcome, not a formality.

## 10. Testing

Per the repo's split. **Domain gets Vitest, red before green:** §3's selection cases, and `step`'s
homing branch — enters only when airborne, travels toward the target, arrives and bounces, ignores
gravity and steering while dashing, aborts at the timeout and restores gravity, and cannot enter while
already homing.

**Presentation is verified in the browser**, and this phase's browser gate is real rather than
nominal: the whole point is feel. Watch a dash land, watch a chain of three, watch what happens when
the press comes with the camera pointed at nothing, and watch a dash aimed through a tree.

## 11. Out of scope

- **Consumable crystals** — the owner's option B, an explicit later variant.
- **The tower mode** — its own spec. It will be a second Babylon `Scene` rather than a far-away corner
  of the hub's: the hub costs ~5.1 ms/frame at 720p with **shadows at 91 % of it**, and its four CSM
  cascades are configured for a 100 × 100 plain (`shadowMaxZ = 120`), which is the wrong shape for a
  vertical climb. A separate scene both frees that budget and lets the tower configure its own shadows.
- **Mode routing.** `gameMode.svelte.ts` is a one-way `'intro' | 'playing'` dialogue gate today, not a
  router, and it lives in `App.svelte` — which PR #33 is rewriting. This waits for #33 to land.
- **Line-of-sight on selection.** A crystal behind terrain is selectable in v1. The fix, when wanted,
  is one raycast inside the selection and nothing else changes.
- **Enemies, damage, health.**
