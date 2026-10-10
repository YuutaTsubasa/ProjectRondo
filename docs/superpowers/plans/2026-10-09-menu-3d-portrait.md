# 3D Menu Portrait Implementation Plan

**Goal:** Share a live 3D Yuuta portrait between title/menu and reference-inspired Loading.
**Architecture:** A dynamically imported transparent Babylon portrait scene owns only character presentation. A Svelte canvas lifecycle wrapper controls pause/visibility and disposal. FrontDoorArtwork controls composition; FrontDoor retains routing and status text.
**Tech Stack:** Svelte 5, Babylon.js, TypeScript, Vitest.

- [x] Add lifecycle/scene tests covering late load teardown, framing, pause and reduced motion; verify failure before implementation.
- [x] Create menuPortraitScene.ts using PLAYER_MODEL, applyPlayerMaterials, attachPlayerBlink, Idle and transparent key/fill lighting. Use a bounded-resolution canvas and camera interpolation; no gameplay rig.
- [x] Create MenuPortrait.svelte with lazy import, cancellation, resize and visibility handling; integrate into persistent FrontDoorArtwork with illustration fallback.
- [x] Add Loading-specific diagonal composition, close-up portrait and indeterminate status rail in FrontDoor; preserve error and keyboard routes.
- [x] Run focused tests, typecheck, build, full suite and desktop/mobile visual QA. Record final results without committing unrelated work.

Verification: 854 tests / 134 files passed; typecheck clean; build passed with existing chunk warning. Actual EXTRA trial entry, loading and return were verified in browser.
