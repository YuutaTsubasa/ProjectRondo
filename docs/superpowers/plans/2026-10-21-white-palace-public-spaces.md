# White Palace public spaces implementation plan

> **For agentic workers:** Execute this approved scope inline; parent owns review and integration. No commits or pushes.

**Goal:** Connect the existing royal forecourt to an enterable luminous great hall, sea cloister, and view terrace.

**Architecture:** Add authored palace floor rectangles to the existing shared terrace definitions, so rendering, Havok support, foot probes and safety checks agree. Build architectural shells from beveled stone, columns and true arches, batched by zone/material. Doorways remain physically open and camera solids track only actual masonry.

**Tech Stack:** TypeScript, Babylon.js, Havok, Vitest, Svelte.

### Task 1: Continuous support
- [x] Add tests in tests/domain/townPalace.test.ts sampling courtyard/hall/cloister/view route at 0.5 m intervals; require y=12, regional safety and distinct location labels.
- [x] Run `npm test -- tests/domain/townPalace.test.ts` and observe missing floor failures.
- [x] Create src/domain/town/townPalace.ts (shared surfaces + route), append its surfaces to townTerraces.ts, extend townLayout bounds to z291 and location labels.
- [x] Rerun domain tests.

### Task 2: Visible playable palace
- [x] Add tests/presentation/townPalace.test.ts checking integrated route clearance, downward ray support, physical arch openings and camera boom clearance. Require palace draw batching and skyline outside new floor.
- [x] Run the test to observe absent palace geometry.
- [x] Create src/presentation/town/townPalace.ts using createArch, createColumn and createBeveledBox. Add actual masonry collision and camera bounds; integrate in townScenery.ts. Move only distant palace/viaduct skyline north.
- [x] Rerun palace and existing town tests.

### Task 3: Navigation and review
- [x] Overlay floor footprints/route on RegionMinimap even when the old captured atlas loads; extend bounds through TOWN_BOUNDS. Parent owns main atlas refresh.
- [x] Run focused town/domain/region safety tests plus TypeScript verification.
- [x] Report spawn/view coordinates and remaining browser QA to parent.

Approved geometry: courtyard x[-44,40],z[209,229]; hall x[-38,18],z[229,277]; sea cloister x[18,40],z[229,277]; north view terrace x[-44,40],z[277,291], all y12. Gate axis x=-10, entrance at z229. Walk loop enters on center axis, crosses east at z267, returns via x29. North hall portal opens onto view terrace. Side bays and roof sit high enough for a normal third-person camera.
