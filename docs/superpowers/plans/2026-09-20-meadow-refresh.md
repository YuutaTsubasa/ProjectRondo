# Meadow Visual Refresh Implementation Plan

> Use superpowers:subagent-driven-development for independent terrain, foliage and tree tasks; parent handles atmosphere and browser QA.

**Goal:** A calmer, readable anime-style grassland matching the new knight.
**Architecture:** Shared decorative paths/patches, vertex-coloured terrain, layered scenery, bounded vegetation and softer light.
**Tech Stack:** Babylon.js, procedural geometry/textures, TypeScript, Vitest.

- [x] Add pure meadowLayout path/clearing/patch queries and tests for destination continuity and finite bounded fields.
- [x] Terrain: replace the repeated grass photo with gently varying vertex colours and tan paths; keep terrain physics; replace jagged grey ring with three smooth blue-green ranges.
- [x] Scatter: solid curved grass ribbons, mipmapped two-sided flower cutouts, seeded meadow clusters, path/plaza/water exclusion and flower patches; retain wind and rock collision.
- [x] Trees: preserve locations and collisions; improve canopy fullness/palette without a new external asset.
- [x] Atmosphere: cyan-blue gradient, softly defined cloud groups, balanced ambient/sun; keep MSAA and modest post-processing.
- [x] Inspect and refine spawn, pond, plaza and elevated vistas in browser; check movement, collision and portal transition.
- [x] Independent spec and quality review. Full test suite, typecheck/build, documentation and deliverable preview.

## Completed verification (2026-09-20)

- Final visuals: fresh green vertex-coloured fields, feathered cream paths, 10,000 solid grass tufts, 1,300 flowers, 160 rocks, 90 smooth bushes, 20 rounded procedural trees, three blue hill layers, soft cloud groups and turquoise pond strokes.
- Browser inspected normal player view, spawn panorama, pond, plaza, overlook and upward sky. Refined colours after first review, replaced dark grass alpha fringes with solid ribbons, and removed moving canopy self-shadow stripes while retaining tree ground shadows.
- One-second forward input moved the player from spawn to z=-7.55 along the terrain. Grassland -> tower -> grassland transition succeeded; returned hub had 146 meshes with no browser errors. This is a scene-transition smoke check, not a full tower playthrough.
- Stable browser frame samples at normal view and tower return were approximately 16.7ms median / 16.8ms p95 on this machine; these are vsync-limited observations, not a GPU benchmark.
- Full automated suite: 77 files, 586 tests passed. Final typecheck: zero errors/warnings. Final production build passed; existing chunk-size warning remains. Diff whitespace check passed.
- Independent specification review approved. Quality review verified finite outward canopy normals, enabled shared-geometry clones, deterministic bounded placement and lifecycle. Its water-colour scroll seam finding was fixed: the non-periodic colour texture stays stationary while normal ripples animate. Final review approved with no remaining findings.
- Original playable terrain heights, physics boundaries, tree collision footprints, crystal/portal locations, tower environment and player/AVG behavior are retained. Decorative rocks are resampled with matching colliders to keep trails open.
- Temporary QA lives under ignored .superpowers/. Normal deliverable is http://127.0.0.1:5183/. Work remains uncommitted in codex/vrm-player-v20.
## Natural JRPG revision

- [x] Replace toy-like solid tree crowns with irregular leafy canopies and visible branch structure, retaining placement/colliders/wind.
- [x] Add low-contrast tiled ground detail while retaining shared path masks; desaturate and vary grass/bushes.
- [x] Break up smooth scenic bands and oversized puffy clouds into quieter natural forms.
- [x] Inspect player/pond/plaza/sky views and movement; run appropriate tests/typecheck/build; independent review and update preview.
### Natural revision verification

- Replaced round crowns with branching trees and opaque folded leaf sprays with varied pitch; bushes share the helper. Kept 20 placements and trunk collisions. 11,916 canopy triangles plus 1,468 bark triangles per tree; clone geometry/materials shared.
- Muted terrain/path/grass/water palette, fine grass ribbons, packed luminance detail (12 repeats across field), sloping distant meshes and horizontally periodic noise clouds. Terrain geometry and physics unchanged.
- Independently reviewed mesh normals, enabled clones, shared resources/disposal, packed detail channels, cloud wrapping and stationary water colour. No remaining findings.
- Visual QA covered normal play view, sky, pond and plaza; normal-view frame samples remained about 16.7ms median / 16.8ms p95 (vsync-limited, this machine only).
- Discovered existing initial player seating could consume stale linked-bone matrices: measured sole 0.774m above terrain. Calibrate once at explicit Idle frame after forcing skeleton/world transform updates. Browser after fix measured -0.0026m sole-to-ground difference, within Idle movement; two real NullEngine regressions failed before and passed after. Independent focused review approved.
- Final suite: 79 files, 589 tests passed. Full typecheck: zero errors/warnings. Production build passed; existing large-chunk warning remains.
- Final browser smoke: hub -> tower -> hub succeeded, tower and returned player visibly grounded. After return, one-second movement changed position from (-5.41, 2.00, 28.84) to (-5.17, 1.50, 24.62) along terrain; hub retained 146 meshes and no browser errors. QA did not perform a full tower playthrough.
