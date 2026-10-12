# White Palace Adventures Implementation Plan

> Execute with superpowers:subagent-driven-development for bounded tasks; independent palace/course/city domains use superpowers:dispatching-parallel-agents with explicit exclusive ownership. Root integrates catalog and application flow.

**Goal:** Deliver a walkable city slice, optional Yuuta exploration story, four source 2D and four authored 3D levels with coins, as one independently reviewable PR.
**Architecture:** Preserve defaults while passing explicit stage definitions. Keep original story expedition ids separate from stage ids and optional city story persistence.
**Tech Stack:** Svelte 5, TypeScript, Babylon/Havok, Vitest, existing Tauri builds.

- [x] Palace worker: import pinned 1-2..1-5 via tools/palace/import.mjs; add palaceStages.ts; parameterize PalaceRun/Scene/Session/Hud; model airborne core targeting/regeneration; validate source counts and traversal.
- [x] Course worker: add courseStages.ts with five definitions; parameterize combat/scenery/scene/session/Hud; implement 3D coin collection, resets/audio/scoring; validate all jump and Homing links.
- [x] City worker: preserve TOWN_TERRACES shared support, add connected exploration route, batched street props with explicit collision bounds/budgets; write docs/art/white-palace-model-wishlist.md.
- [x] Root: create content/stageCatalog.ts and validate records isolation/backward compatibility in tests/app/stageRecords.test.ts; wire selected stage through FrontDoor/MenuSubpages/App and RegionSession portals/ExpeditionIntro.
- [x] Root: add domain/region/cityJourney.ts and content/cityStory.ts plus four .dlg scenes; test parse/termination, ordered completion and corrupt storage recovery; integrate in RegionSession with existing DialogueOverlay and HUD/map navigation.
- [x] Root: retain all original tests, adjust only obsolete exact-count assertions when new data extends their intended scope. Run npm test, npm run typecheck and npm run build.
- [x] Root: muted browser preview actual city route and each stage family, save screenshots, inspect console errors. Document concrete performance budgets and limitations.
- [ ] Independent review: spec then correctness; repair regressions. Commit scoped changes, push new branch, create/attach PR; do not merge.

Acceptance: all ten stages selectable; each uses distinct geometry, correct title/count/records and return/retry route. Main quest saves load unchanged. City exploration route is clear and all four AVG scenes finish with meaningful protagonist dialogue. Final report distinguishes automated evidence, visual checks and on-device checks.
