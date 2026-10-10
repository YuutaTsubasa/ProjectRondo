# Region Light UI refinement

## Design
Apply the already agreed VN Light reference to the first-region UI. Replace the prototype's large rectangular information cards and map/list dialog with game HUD composition: compact stepped chapter stamp, narrow mission rail, brief location title, custom line icons, and contextual interaction prompt. White is the selected/focused surface; blue is structural accent and ink is body text. Keep gameplay, progression, saves and menu/AVG controls unchanged.

The map becomes a full-screen cartographic surface with seven selectable landmark markers, current player position, roads and geography. Selecting a marker previews its location description and unlock state in one anchored detail plate; a separate explicit action tracks the destination and returns to play. Chapter/discovery summaries remain available without a permanent seven-item sidebar. Keep focus containment, keyboard selection, Escape/M close behavior, reduced motion and compact viewport support.

## Implementation plan
- [x] Add a behavioral map test: keyboard marker selection previews without tracking; explicit track action sends the selected destination; close remains available.
- [x] Restyle RegionHud.svelte using the reference geometry and compact information hierarchy; maintain Space isolation.
- [x] Recompose RegionMap.svelte around selectable SVG landmarks and one detail plate. Preserve regionModal focus behavior.
- [x] Match the small AVG chapter label to the same stepped stamp.
- [x] Run focused integration/accessibility tests and typecheck/build, then inspect actual HUD, map and AVG at the running local server. Save screenshots. Preserve existing work; no commit/push requested.

Validation: 840 tests / 132 files passed; TypeScript/Svelte 0 errors / 0 warnings; production build passed with the existing large-chunk advisory. Browser inspection covered AVG chapter stamp, exploration HUD, Space opening the map, Enter selecting the cove without closing, and explicit tracking returning to the HUD with cove distance. Screenshots captured for HUD/map.
