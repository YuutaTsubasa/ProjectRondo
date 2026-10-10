# Settings reference implementation plan

Goal: reproduce the supplied navy three-column settings layout with working display/audio controls.
Architecture: reusable SettingsScreen for FrontDoor and PauseScreen; validated display store; shared atmosphere binding updates on the next rendered frame to preserve paused backdrops. Existing audio preferences remain immediate.
Stack: Svelte 5, Babylon.js, Vitest.

- [x] Add validated, persistent display preferences and tests for malformed storage / bounded inputs.
- [x] Bind render scale, exposure, contrast, bloom, shadows and MSAA in shared atmosphere; release subscription on scene disposal.
- [x] Build reference layout: category rail, thin setting rows, contextual help, logo, blue waves, keyboard focus and 320 ms exit. Fullscreen tracks browser state and reports failures. Unsupported categories clearly marked.
- [x] Integrate main menu and shared pause without resuming gameplay or double Escape. Retain existing audio behavior.
- [x] Verify preferences/render binding, UI controls, menu/pause lifecycle, typecheck, production build and desktop/narrow browser layout.

Scope: no fictitious refresh-rate, HDR or VRAM controls. Fullscreen is session/browser controlled, not stored. Display changes are saved immediately and applied on the next gameplay render; audio remains live. Reset only affects the current category.

Validation: 48 tests passed across 8 files; typecheck has zero errors/warnings; desktop 1280×720 and narrow 390px layout inspected. Production build succeeds with the existing chunk-size advisory.
