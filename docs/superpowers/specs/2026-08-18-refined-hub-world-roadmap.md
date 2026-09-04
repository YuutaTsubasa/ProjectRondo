# Refined Hub World — Roadmap (M4)

**Date:** 2026-08-18
**Status:** Approved (structure + sequence); phases pending their own specs
**Predecessors:** M1 hub parity (SP0), M2 AVG dialogue (SP1/PR #14), M3 hub environment
(grassland PR #15, capsule dedup PR #16, ground scatter PR #17)

## 1. Framing — where we are, where we're finishing

The Godot prototype was an **M1–M2 confidence slice**: it only ever contained two real systems —
character movement + third-person camera/animation, and the branching dialogue-graph engine + AVG
box. **Both are already on the web.** Everything else on the README vision (Sonic-style 3D/2D levels,
2048, Sudoku, NPC triggers, scene transitions, save/load, menus, HUD, audio, combat) exists **only as
roadmap text — there is no Godot implementation left to port.**

So "migration" is effectively complete. The remaining work is **fresh game development** on the proven
web architecture (pure `src/domain` + babylon/Svelte presentation).

**The finish-line the user chose:** build **a good-looking 3D world first**, then start on the other
modes. This document plans that first goal — turning the hub from a functional grassland into a
**refined, attractive 3D world** — and defers the modes to a later milestone.

## 2. Art direction

**Stylized → refined.** Keep the current low-poly / stylized look (it matches the knight and all
existing scene work) and push it toward *精緻*: clean colour, bright cohesive lighting, terrain relief,
atmosphere. **Not** photoreal PBR (would clash with the low-poly knight and blow the perf/asset
budget). Reference feel: the clean, airy stylization of *Sonic Frontiers* / *Zelda: BotW*.

## 3. Approach — foundation-first, phased (Approach A)

M4 is delivered as **four phased sub-features**, each with its **own** brainstorm → spec → plan → PR
cycle (the same rhythm as grassland and scatter — small, reviewable, independently shippable). Phases
are ordered by dependency so later phases build on earlier results without rework.

**Stop-anytime:** after any phase, if the world already feels "good enough," we can cut straight to the
game modes. The phases are ordered so that stopping early still leaves a coherent world.

## 4. The four phases

### P1 · 地形與碰撞基礎 (Terrain & collision foundation)

The foundational reshape — everything else sits on the terrain, so it goes first. **Collision is
front-loaded here** (see §5): once the ground has relief, the player must ride it, and solid props must
stop the player, so terrain and collision are one concern.

- **Terrain relief:** replace the flat 50×50 plane with a gently rolling heightmap (procedural or a
  baked heightfield) — hills, dips, a walkable path/clearing. Keep it gentle enough to walk/jump.
- **Re-seat existing content:** grass/flower/rock/bush scatter and trees must sample the terrain height
  (raycast-down placement) so they sit *on* the ground instead of floating/sinking.
- **Distant scenery:** low-cost far mountains / backdrop ring (skybox-painted or cheap silhouette
  geometry beyond the play boundary) so the world reads as bigger than the walled box.
- **Collision foundation** (§5): terrain collider (player rides the heightfield via the existing Havok
  `PhysicsCharacterController`), solid-object colliders (trees first — the user's specific complaint —
  then large rocks / boundary), and the **solid-vs-pass-through policy** for every scatter category.

*May split into 2 PRs: (a) terrain shape + re-seat + distant scenery, (b) collision.*

**The P1 spec must explicitly resolve:**
- **Domain movement on slopes.** The pure `characterMovement.step` owns gravity and `MoveToward` on
  planar velocity, and today assumes flat ground; the P1 spec must define how it interacts with
  slope / heightfield **collide-and-slide**, and how `grounded && !ascending` (the ground/jump probe)
  behaves on non-flat terrain — so ramps don't launch, cancel jumps, or trap the capsule.
- **Determinism.** If the terrain is procedurally generated, seed it (mulberry32, as scatter does) so
  the layout is reproducible, and make the raycast-down re-seating of scatter/trees reproducible too.

**Bounded DoD:** the player walks over visibly rolling ground and up/down a path; grass/trees/rocks sit
correctly on the slopes; distant mountains are visible past the field; the knight **cannot walk through
trees** (and other designated-solid props) and **rides the terrain** without falling through or
floating; 60fps holds.

### P2 · 光影與氛圍後製 (Lighting & atmosphere post-processing)

With terrain relief and distant scenery in place, depth-based atmosphere finally has something to act
on. One rendering pipeline lifts the whole scene at once.

- babylon `DefaultRenderingPipeline`: **tone mapping** (ACES) + **exposure/contrast**, subtle
  **bloom**, optional **image-processing colour grading** (warm, bright stylized grade).
- **Fog / aerial perspective:** distance fog tuned to the terrain depth so far mountains desaturate into
  the sky (the single biggest "world has depth" cue).
- **Sun/atmosphere polish:** optional **godrays** (volumetric light scattering) from the sun; tune
  ambient/hemispheric fill so shaded sides read well (builds on the emissive-floor lesson from scatter).

**Bounded DoD:** side-by-side before/after screenshots show a clearly richer, more cohesive image
(tone-mapped colour, soft bloom, distance fog blending mountains into sky) with no washed-out or
crushed regions; 60fps holds.

### P3 · 水與地標 (Water & landmarks)

Sits in the P1 terrain — water pools in the low areas, landmarks stand on the high/clear ground.

- **Stylized water:** a pond / small river using a stylized water material (animated normals or a light
  custom shader — reflection/refraction kept cheap; no heavy planar reflection unless it's free enough).
  Collision policy for the water edge (block, or shallow-wade) decided in the phase spec.
- **Landmarks / points of interest:** a few hero structures (e.g. a small village cluster, an arch, a
  signpost plaza). **These double as the sites where NPCs and future mode-entrances will live** — this
  is where we plant the "destination" so the world has purpose, not just scenery. Landmarks get solid
  colliders (§5).

**Bounded DoD:** at least one water feature reads clearly as water and sits naturally in a terrain low;
at least one landmark structure stands as a recognizable destination with working collision; both fit
the stylized grade from P2; 60fps holds.

### P4 · 生命感與動態 (Life & motion)

The final "juice" layer, on top of everything else.

- **Wind:** grass/tree sway — a vertex-shader wind over the thin-instanced scatter (deferred from the
  original scatter spec) and a gentle canopy sway on trees.
- **Sky motion:** drifting clouds (skydome animation or billboard/particle clouds).
- **Ambient life:** butterflies / birds / drifting pollen particles — small looping motion that makes
  the field feel alive.

**Bounded DoD:** grass and trees sway subtly with wind; clouds drift; at least one kind of ambient
creature/particle moves through the scene; motion feels calm (not distracting) and 60fps holds.

## 5. Collision — cross-cutting policy (foundation in P1)

The hub currently has colliders **only on the boundary walls and the flat ground**; trees, rocks,
bushes, grass, and flowers are pure visuals the player clips through. The player is a Havok
`PhysicsCharacterController` capsule already doing collide-and-slide, so adding static colliders is the
missing half.

**Solid vs pass-through policy** (final technique decided per-phase spec):

| Element | Behaviour | Notes |
| --- | --- | --- |
| Terrain | **Ride on top** | Static heightfield/mesh collider; player follows the ground (P1) |
| Trees | **Solid** | ~10 discrete instances → cheap per-instance cylinder/box colliders (P1) |
| Landmarks / buildings | **Solid** | Per-structure colliders (P3) |
| Boundary walls | **Solid** (already) | Keep |
| Large rocks | **Solid (selective)** | Big/hero rocks only; small ones stay pass-through |
| Bushes | **Pass-through** (default) | Soft foliage; revisit if any hero bush should block |
| Grass / flowers | **Pass-through** (always) | Cosmetic |
| Water | **TBD in P3** | Block edge, or shallow-wade |

**Technique note / open question for the P1 spec:** the scatter rocks are **thin-instances** (one draw
call, no physics bodies). Giving hundreds of instances individual Havok bodies is a perf risk, so the
policy above makes only *selected* large rocks solid — likely by promoting a small set to real meshes
with colliders, or generating colliders only for instances above a size threshold. Grass/flowers/most
bushes never get colliders. The exact mechanism is a P1-spec decision, not settled here.

## 6. Overall "world done" DoD (anti-endless-polish gate)

M4 is **done** — and we pivot to game modes — when a walkthrough from spawn shows **all** of:

- rolling terrain with a walkable path, the knight riding it correctly;
- distant mountains fading into the sky through atmospheric fog;
- tone-mapped, bloomed, colour-graded lighting (no washed-out/crushed areas);
- at least one water feature and one landmark destination, both with correct collision;
- wind-swept grass/trees, drifting clouds, and some ambient life;
- the knight **cannot clip through** trees / landmarks / designated-solid props;
- a steady **60fps** on the dev target.

Reaching this checklist is the signal to stop polishing the world and start the first mode.

## 7. Performance budget

The stylized direction is partly a perf choice. Hold the scatter discipline: few draw calls
(thin-instances), alpha-test (not alpha-blend), colliders only on genuinely-solid objects, cheap water
(no heavy planar reflection unless free), distant scenery as painted/silhouette rather than dense
geometry.

**Measure "60fps holds" on the cumulative scene, not the feature in isolation.** Scatter alone already
sits at ~59fps (largely the vsync cap), and the real GPU costs land later — P2's post-processing
(bloom / godrays / ACES) and P3's stylized water. So each phase's fps DoD is checked with **all prior
phases stacked**, and P2/P3 in particular must budget against the already-loaded scene (dropping
godrays or reflection quality if needed) rather than assuming headroom.

**Measured, 2026-09-04 (post-P3, post-shadow-quality).** The cumulative scene costs **~5.1 ms of the
16.7 ms budget** at 1280x720 on the ARM64 dev machine, leaving **~11.6 ms (~3.3x) for P4**. The split is
lopsided in a way this section did not anticipate: **shadows are ~91% of the frame (4.65 ms)** and
everything else — terrain, 16 000 grass instances, trees, the knight, water, the landmark and the whole
post-processing chain — is **0.57 ms** together. The stylized-direction perf discipline above worked;
the shadow pass is what eats the budget, and inside it the single biggest item is the knight's 47
caster meshes at 1.73 ms. Full record and the method (paired deltas only — this machine's absolutes
drift 1.40x within seconds): `2026-08-25-shadow-quality-design.md` §7, "Task 6 (re-measured
2026-09-04)".

## 7b. Scheduled additions (added 2026-08-18, after P1 shipped)

Two items the user asked to fold in after P1 merged. Neither was in the original four phases; both are
slotted into the sequence below.

### A · Bigger / less boxed-in hub map — do BEFORE P2 (a foundation revision)

The hub is a 50×50 field with hard invisible walls at ±25 and reads as too confined ("邊界很死").
Expand the playable area, and/or replace the invisible box with natural barriers. This is a
**foundation** change — `terrainHeight.ts` (`FIELD` / `EDGE_RADIUS`), `terrain.ts`'s boundary walls +
distant-ridge radius, and `scatter.ts`'s `EXTENT` are all sized to 50 / ±24 and must scale together —
so it lands **right after P1, before P2**: P2's atmosphere (fog reads terrain depth), P3's water/landmark
placement, and P4's scatter density all tune to the final size, so doing it first avoids re-tuning. The
*natural-barrier* aesthetic (cliffs, or the mountain ring as the visible edge) can be finished alongside
P3's landmarks; the size change itself is the near-term task.

### B · Run + jump movement — parallel track, gated on downloaded anims

The character needs a **run** ability and a **jump** ability; the user will download + retarget **run and
jump animations** separately (the Idle/Walk → `knight_web.glb` pipeline). This is an independent
**movement pass** — it neither blocks nor depends on the world-polish phases — so it can slot in whenever
the animations are ready; recommended after the map grows (running then has room to feel good). Note the
domain already has a jump path (`jumpSpeed`) and sprint was tuned *out* earlier (maxSpeed 12→4), so the
work is: add a run state + speed, wire the run/jump clips, and blend them.

### Updated sequence

P1 (done) → **map scale-up (A)** → **P2** → *(run/jump (B) slots in when anims arrive)* → **P3**
(incl. natural edges) → **P4** → game modes.

## 8. Out of scope (deferred beyond M4)

- **The game modes themselves** — Sonic-style 3D/2D levels, 2048, Sudoku — are the *next* milestone
  (SP2+), after the world is refined. M4 only plants the landmark *sites* and the NPC/mode-entry
  *hook points*, not the modes.
- **Save/load, menus, HUD, audio** — still deferred (AVG spec already deferred save/load + menus).
- **Combat, enemies, items, stats** — not part of the README vision's near term; out.

## 9. Next step

P1 (地形與碰撞基礎) is **done** — spec `2026-08-18-hub-terrain-collision-design.md`, plan
`2026-08-18-hub-terrain-collision.md`, merged in PR #19. Next is the **map scale-up** (§7b·A) as a
foundation revision, then **P2 (光影與氛圍後製)**; each runs through its own brainstorm → spec → plan →
implementation cycle. The run/jump movement pass (§7b·B) runs in parallel once its animations are
downloaded.
