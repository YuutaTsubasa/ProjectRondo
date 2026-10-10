# White Palace Arcade Integration Plan

**Goal:** Integrate the user-generated arcade into a walkable plaza-to-seafront connection.
**Architecture:** Reuse selective Blender conversion and shared town asset instances. Measure the actual openings before authoring separate pier and roof collision; never use a whole-building collider for an open arcade. Preserve prior town work.
**Tech Stack:** Blender 5, Babylon/Havok, TypeScript, Vitest.

- [x] Add the arcade ZIP to tools/town/import.py; import only arcade, preserve other asset hashes, inspect all sides and measure openings.
- [x] Extend townAssets.test.ts receipt expectation and townLayout.test.ts kind expectation. Add townArcade.test.ts passage/camera checks and a townScenery.test.ts integration check; run focused tests and observe missing-feature failures.
- [x] Extend townLayout.ts and townAssets.ts; implement measured townArcade.ts collision and wire it into townScenery.ts. Place arcade copies along a clear route beside the plaza/seafront, relocating only intersecting small props.
- [x] Run focused/full Vitest, typecheck and build. Browser-check model, shadows, crossing both axes, solid piers and camera. Record actual dimensions, source limitations and verification in public/town/README.md and docs/HANDOFF.md.

No commit or push requested. Execute in this existing worktree.
