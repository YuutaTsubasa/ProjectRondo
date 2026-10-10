# First Region Implementation Plan

**Goal:** Deliver a playable connected first region and a complete 悠太翼 chapter using available town and level assets.
**Architecture:** Pure regionLayout/regionProgress/objective/save validation own progression and coordinates. RegionScene renders continuous town/outdoors; RegionWorld owns its engine lifecycle. RegionSession orchestrates AVG, map and existing expedition session components. Preserve all existing preview modes.
**Tech stack:** Svelte 5, Babylon/Havok, existing dialogue DSL, TypeScript/Vitest.

- [x] Story/progression: five authored DSL scenes; guarded chapter events; parse/validate saves; test complete route, premature/duplicate events, malformed data and every narrative branch.
- [x] Scene: continuous terrain and town south opening; coastal/western/southern landmarks, shared shading/foliage; safe collision/ground/recovery. Test seam, route heights and key placements.
- [x] Expedition adapters: optional completion callback and exit label on Course/Palace session/HUD; retain results; test only actual finishes, repeat-run behavior and abandon.
- [x] Orchestration: objectives, E interactions, map/journal, local saves, optional discoveries; RegionWorld safe render lifecycle; RegionSession dialogue/expedition return/loading errors. Tests before implementation, then focused checks.
- [x] Entry and polish: main Start opens region; existing previews remain. Hide portrait for remote AVG speaker, visible restored harbor signal, Light UI focus/motion/accessibility.
- [x] Full tests/typecheck/build; independent spec then quality review; browser traversal/progression/save/error checks; handoff and screenshots. No commit/push requested.
