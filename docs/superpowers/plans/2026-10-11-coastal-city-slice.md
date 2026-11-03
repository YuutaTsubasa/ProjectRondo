# Coastal City Slice Implementation Plan

**Goal:** Add a playable elevated district and a palace skyline matching the coastal composition of the menu illustration.
**Architecture:** Pure townTerraces data supplies surface bounds/heights, a Babylon townTerraces renderer builds matching support and railings, and townSkyline builds merged distant scenery. Existing townScenery integrates both; town/region bounds and ground sampling include the new district.
**Tech Stack:** TypeScript, Babylon.js, Havok, Vitest.

- [x] Add tests for route continuity, slopes, safe bounds, and unchanged story anchors in tests/domain/townTerraces.test.ts. Run npm test -- tests/domain/townTerraces.test.ts and confirm failure before implementation.
- [x] Implement src/domain/town/townTerraces.ts: surface rectangles, endpoint heights and ascent interpolation. Extend town bounds westward; sample raised surfaces in town and region ground callbacks.
- [x] Implement matching visible surface meshes and Havok colliders in src/presentation/town/townTerraces.ts, with a gap through the existing western parapet. Verify collider heights and traversable centreline with NullEngine tests.
- [x] Add src/presentation/town/townSkyline.ts for a stepped palace base, arcades, roofs, towers, coastal bridge and residential tiers. Merge static parts by district/material; keep distant scenery out of dynamic shadow and physics lists.
- [x] Add explicitly raised arcade placements and fix imported asset collider centres to use their actual base heights. Preserve existing entrances.
- [x] Run relevant town/region tests, typecheck, production build and full test suite. Inspect street, terrace and skyline views and walk both ascent segments in a local browser preview. Record limitations and the review URL.

## Verification — 2026-10-12

- Full suite: 179 files, 1,123 tests passed. Typecheck: 0 errors and 0 warnings. Production build passed (existing large-chunk warning remains).
- Browser: walked the full route from the original street through both ascents to the 12 m belvedere/arcade; no runtime errors reported. Inspected the overview and elevated viewpoints.
- Review found camera clipping through the underside of the elevated arcade. Added a regression test (confirmed failure first) and support-body camera blockers; regression and full suite now pass.
- Updated the region atlas from the actual 3D scene.
- Visible muted review page: http://127.0.0.1:5173/.superpowers/city-slice.html . QA audio is muted in memory without changing saved preferences.
- Palace, residential tiers and viaduct remain composition blockouts, with repeated geometry and simple materials. Android performance has not been measured. Changes remain local and uncommitted for visual review.
