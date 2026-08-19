# M4 · Bigger, Naturally-Bounded Hub Map (Design)

**Date:** 2026-08-19
**Status:** Approved (design), pending implementation plan
**Milestone:** M4 Refined Hub World — map scale-up (roadmap
`2026-08-18-refined-hub-world-roadmap.md` §7b·A; scheduled after P1, before P2)
**Predecessors:** P1 hub terrain & collision (PR #19)

## 1. Goal & context

The hub is a **50×50 field walled by hard invisible boxes at ±25**; the user finds it too confined and
the boundary "很死" (abrupt). Two changes, together:

1. **~2× bigger** — grow the field to **100×100** so the roamable interior roughly doubles.
2. **Natural barriers instead of invisible walls** — the edge terrain **rises into a steep slope the
   player can't climb**, so the world is enclosed by landscape, not by bumping an invisible wall.

All **presentation** (babylon meshes/materials/physics), **deterministic**, no `src/domain` changes.
The work is mostly **rescaling coupled constants together** + adding a **barrier zone** to the terrain
profile. Everything stays thin-instanced / single-mesh as today.

## 2. Terrain size & radial profile

`FIELD 50 → 100` (HALF 25 → 50). The single pure `terrainHeight(x, z)` keeps its layered shape but adds
an outer **barrier** term. By distance `r` from centre, the profile is:

| Zone | radius (approx) | shape | walkable? |
| --- | --- | --- | --- |
| Centre | 0 – `FLAT_RADIUS` (~14) | gentle base roll only | yes |
| Rolling hills | `FLAT_RADIUS` – `WALK_EDGE` (~40) | base roll + falloff-gated hills, **≤ ~32°** | **yes** (the main roam area) |
| Barrier rim | `BARRIER_INNER` (~40) – field edge (~48) | steep ramp up to a high lip, **> 60°** | **no** (encloses the world) |

- **Base roll** everywhere (unchanged concept), amplitude ~`BASE_AMPLITUDE`.
- **Walkable hills** — the existing falloff × noise, but the falloff now eases from `FLAT_RADIUS` to
  `WALK_EDGE` (~40) so the walkable belt is much wider. Slopes stay **≤ the ~32° comfortable-climb
  limit** verified in P1.
- **Barrier** — a `smoothstep(BARRIER_INNER → edge)` ramp × `BARRIER_HEIGHT` (~18), tuned so its slope
  **exceeds the controller's `maxSlopeCosine` 0.5 (60°)** → the character controller treats it as a wall
  and the player cannot climb out. It must also **read as clearly steep** (a visible wall of land), so
  there's no repeat of P1's "looks walkable but isn't" confusion — the barrier is *meant* to look
  impassable. Exact radii/height are tuned in-browser during implementation.

Spawn stays at the centre (`terrainHeight(0,0) + …`, as P1).

## 3. Natural boundary

- **The steep barrier rim is the boundary.** Walking toward any edge, the ground ramps up too steeply to
  climb — enclosure by terrain, no invisible-wall bump.
- **Invisible walls kept as a safety net**, pushed out to the new rim (±50) and effectively behind/atop
  the barrier — never touched in normal play, but they stop a runaway capsule from leaving the world.
- **Distant mountain ring moves out**: `RING_RADIUS 60 → ~110` so the range still sits *beyond* the
  enlarged field and barrier, on the horizon.

## 4. Scatter density

Keeping today's 4000-grass count on a 4×-area field would look sparse. Scale counts up (not full 4× —
perf), verify 60fps, dial:

- Targets: **grass ~11k, flowers ~1.1k, rocks ~130, bushes ~110** (≈ 2.7× the current counts), and
  scatter **`EXTENT 24 → ~40`** so detail fills the walkable interior (not the barrier rim).
- **Trees**: extend `SPOTS` from 10 to ~20, spread across the bigger interior (keep the spawn clearing).
- All still **thin-instanced (one draw call per element)** + seeded mulberry32 → reproducible.

## 5. Terrain collider

The displaced ground's static collider grows with the field:

- Scale `SUBDIVISIONS 120 → ~200` (keeps roughly the current segment size at 2× span; MESH ≈ 80k tris).
- **If the MESH shape proves heavy** at that size, switch the terrain collider to a **`HEIGHTFIELD`**
  shape (purpose-built for terrain, far cheaper than an arbitrary mesh). Decide by **measuring fps**,
  not up front — MESH first, heightfield as the documented fallback.

## 6. Coupled constants — scale together

The map size lives in several places that must move as one (a source of bugs if they drift):

- `terrainHeight.ts` — `FIELD`, `FLAT_RADIUS`, `WALK_EDGE`/`EDGE_RADIUS`, new `BARRIER_*`, and possibly
  noise frequencies (so hills stay broad at the larger scale).
- `terrain.ts` — `SUBDIVISIONS`, boundary-wall positions (`HALF`), distant-mountain `RING_RADIUS`.
- `scatter.ts` — `EXTENT`, the per-element counts.
- `trees.ts` — `SPOTS`.

`FIELD` and `HALF` already flow from `terrainHeight.ts` into `terrain.ts`/`scatter.ts`; keep that single
source and add the new radii there too.

## 7. Performance

Bigger field → more scatter overdraw + a bigger collider. Hold the P1 discipline (thin-instances,
alpha-test, colliders only on solids). Verify **60fps on the cumulative scene** and tune the two levers
that scale worst — **scatter counts** and **collider subdivisions/shape** — by measurement. Grass is the
main overdraw risk; if fps dips, trim grass count or add a simple distance cull before shipping (and
`log` any density cap so "looks full" isn't silently false).

## 8. Testing

**`terrainHeight` unit tests (Vitest)** updated for the new profile:
- Centre still gently rolls (scaled `FLAT_RADIUS`).
- **Walkable belt slope ≤ limit**: sample the height gradient across the rolling-hills annulus; assert
  max slope ≤ ~35° (comfortably climbable).
- **Barrier is steep**: sample the gradient in the barrier rim; assert slope > ~55° (a real wall).
- Bounds hold; pinned golden values for the new constants (determinism).

**In-browser:** roam the enlarged interior; walk toward several edges and confirm the **ground ramps up
and blocks** you (no invisible-wall bump, and the barrier visibly looks steep); scatter still reads lush
(not sparse); mountains sit beyond the barrier; 60fps holds.

## 9. Out of scope

- **The natural-barrier *aesthetic* finish** (cliff textures, rock faces at the edge) — the P3 landmark
  pass can dress the barrier; this phase just makes the edge terrain impassable and readable.
- Run/jump movement (separate backlog pass), P2 atmosphere, water/landmarks (P3), wind/life (P4).
- Streaming / infinite terrain — out; this is a bounded 100×100 hub.

## 10. Modules touched

- `src/presentation/babylon/terrainHeight.ts` — bigger radii + barrier term.
- `src/presentation/babylon/terrain.ts` — subdivisions, wall positions, mountain radius (+ possible
  HEIGHTFIELD collider).
- `src/presentation/babylon/scatter.ts` — EXTENT + counts.
- `src/presentation/babylon/trees.ts` — more SPOTS.
- `tests/presentation/terrainHeight.test.ts` — new profile assertions + golden values.
