# Expedition Introduction UI Plan

**Goal:** Apply the supplied mission-information reference to the existing 2D/3D entrance confirmation screen.
**Architecture:** Extract ExpeditionIntro from RegionSession; data uses real course/palace layout counts and completion state. Preserve entry gating/save flow. Live paused world remains behind a dim translucent navy rail and diagonally cut white sheet. Actual local level captures provide preview images. Existing modal focus, input hints, settings and exit-motion helpers maintain all input routes.
**Scope:** Mission, map and settings navigation only; no invented inventory or rewards; recommended time uses the existing S-rank threshold, with a separately persisted fastest completed time. Start/cancel retain existing accessible labels. Settings returns to introduction; map selects the same entrance and returns to introduction. Error recovery uses the reusable 1–3 action InformationDialog.
**Tech:** Svelte, CSS, Babylon screenshots, Vitest.

- [x] Add introduction component and real level information; use existing typography and blue/white visual language.
- [x] Integrate 2D/3D entry; prevent keyboard bypass of exit animation and duplicate start.
- [x] Test real session entry, cancel/input lock, counts, map/settings and reduced motion.
- [x] Capture actual levels, inspect desktop/narrow layouts, run typecheck/build; document.

## Follow-up refinements

- Vertically center both introductions using auto flex margins; compact line heights fit the larger 2D information block at 1280×720. Narrow displays scroll the single-column panel.
- Persist fastest clears (independent 2D/3D) under rondo.stage-records.v1. Existing saves without a time display —. Targets currently follow S-rank thresholds (2D 30 s, 3D 45 s).
- Share REGION_INTERACTION_PLACES between physical beacons, proximity checks, compass/HUD distance, and the new 3D objective marker. Keep beacons beside paths rather than on their center lines.
- Current target has a fading blue light column and billboard yellow/black exclamation; one RGBA texture avoids coplanar depth artifacts. Enable its material before scene readiness so the paused backdrop never captures an unloaded icon.
- Fix supported platform-edge visual sinking by caching world support height within capsule radius rather than a stale model-local offset. Null-probe airborne correction fades and clears on takeoff.
