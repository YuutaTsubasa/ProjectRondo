# Map reference implementation plan

**Goal:** Replace the old paper map with the supplied navy map composition while preserving real navigation and progress.
**Architecture:** RegionMap owns selection and the modal lifecycle. A RegionAtlas component owns the captured atlas, markers, bounded pan/zoom and image fallback. Existing REGION_PLACES and atlas bounds remain authoritative.
**Tech stack:** Svelte 5, TypeScript, SVG, Vitest.

- [x] Add tests for selection from the list, marker selection without tracking, closed-stage status, real exploration counts, and map controls.
- [x] Implement RegionAtlas with the existing capture coordinates, geometric fallback, drag/wheel zoom, labels, current-position and overview controls.
- [x] Restyle RegionMap: left location list, right information and exploration records, chapter, shared waves, keyboard hints and close/track outro. Keep all seven actual destinations. No invented facilities, teleportation or collectibles.
- [x] Verify keyboard navigation, pointer selection, reduced motion, fallback and responsive layout; run region map/session tests, typecheck and build; inspect a save-free preview in the browser.

Validation: 11 region map/session tests passed; typecheck reported zero errors/warnings; production build passed (existing large-chunk advisory). Browser checks covered desktop/narrow layout, drag, wheel zoom, list selection, tracking outro and success callback. Save-free preview: `/.superpowers/map-ui-qa.html`.
