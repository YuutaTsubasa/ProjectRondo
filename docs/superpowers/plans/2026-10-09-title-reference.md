# Reference-led title/menu implementation plan

**Goal:** Reproduce the supplied reference UI composition for Project Rondo, as explicitly requested after the design discussion. Background choice is discretionary; UI fidelity is the priority.
**Architecture:** Keep FrontDoor phase/actions, lazy scene loading and audio settings. Replace its presentation; isolate the persistent wordmark and decorative artwork into small components. Use existing sky/portrait assets as provisional background, with no new model or generated artwork.
**Tech stack:** Svelte 5, CSS, existing Vitest integration coverage.

- [x] Create RondoWordmark.svelte: large high-contrast serif lettering, tracked PROJECT, blue diagonal stroke and restrained subtitle.
- [x] Create FrontDoorArtwork.svelte: full-bleed sky and unframed protagonist, asymmetric white diagonal masks, fine blue cuts and small corner lettering. Respect reduced motion.
- [x] Recompose FrontDoor.svelte: logo left above thin vertical menu, one blue edge-to-menu selection ribbon, no MAIN MENU headline, boxed hero or row dividers. Preserve five existing routes, focus/keyboard navigation and settings/error states. Title/menu share composition. Keep low-height/narrow layouts usable.
- [x] Run existing frontDoorUI tests and typecheck/build. Inspect title/menu/settings and keyboard ribbon movement in browser; save screenshot. Do not commit/push other accumulated work.

Validation: 9 existing menu/state tests passed; TypeScript/Svelte 0 errors / 0 warnings; production build passed with the existing chunk-size advisory. Background is provisional existing sky + portrait; no new illustration was generated. UI follows the supplied reference, with functional project routes retained.

Browser: verified menu arrow navigation/wrap, settings open and Escape focus restoration, 390x844 narrow layout, and default 1280x720 composition. Console contained no warnings/errors. Temporary viewport override restored.
