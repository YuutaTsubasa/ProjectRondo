# Coastal Town Preview Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent session task; the coordinator owns assets, scene integration and verification.

**Goal:** A playable White Palace street/plaza preview accessible from the main menu.
**Architecture:** Pure layout data under domain/town, Babylon scenery/assets/scene modules under presentation/town, a Svelte session owning lifecycle and Light HUD. Reuse CharacterRig and levelSwap; external source models remain immutable.
**Tech Stack:** Svelte 5, TypeScript, Babylon/Havok, Blender FBX-to-GLB, Vitest.

### Task 1: Assets and layout
- [x] Add regression checks in tests/domain/townLayout.test.ts for entrance and corridor clearance, three building kinds and recovery bounds; run targeted tests and observe missing module failure.
- [x] Define TownBuilding {id, kind:'house'|'shop'|'tower', x,z,yaw,height} and TOWN_SPAWN/TOWN_BUILDINGS. Export townLocation(x,z) and outsideTown(x,y,z). Collision uses the same measured dimensions as visual placement.
- [x] Add tools/town/import.py for the three Downloads ZIP sources and public/town/source-receipt.json. Convert to house.glb, shop.glb, tower.glb with 2K embedded PBR maps, measured bounds and source SHA256s. Add tests/presentation/townAssets.test.ts to verify files, PBR maps, bounds, UVs, no animations/skins and derived asset receipt hashes.

### Task 2: Session and entry
- [x] Add tests/app/townSession.test.ts and town entry regression to frontDoor UI tests. Fail first, then implement src/app/TownSession.svelte, src/presentation/town/TownHud.svelte and menu routing changes.
- [x] Scene contract in src/presentation/town/townScene.ts: createTownScene(engine:Engine,canvas:HTMLCanvasElement):Promise<TownScene>. TownScene exposes scene:Scene, suspendInput(on:boolean):void, reset():void, getLocationLabel():string, dispose():void. Scene also retains player and follow handles for integration and dev diagnostics.
- [x] Session must skip hidden frames; discard first resume/reset frame and rebase animation. Focus canvas on play and trap pause dialog focus. Use createLevelSwap so teardown during asynchronous loading releases scene before engine. Show bilingual Light-style location, pause/reset/menu actions and WASD/Shift/Space/mouse hints.

### Task 3: Scene and scenery
- [x] Create townAssets.ts to load each GLB once using LoadAssetContainerAsync, normalize measured hierarchy bounds, clone shared geometry/materials into placements, and return cast/receive meshes plus solid box collision bounds.
- [x] Create townScenery.ts to build paved street, plaza, boundary walls, seafront parapet, planters/benches/lamps, sea and distant hill silhouettes. Keep ground and building colliders explicit and stable; tag camera-blocking meshes separately.
- [x] Create townScene.ts with createEnvironment, Havok, empty crystals, CharacterRig, createAtmosphere, shadows, audio and lifecycle disposal. Reset returns to entrance and clears stale motion/camera. Recover on sea falls/out-of-sample positions. Camera must not see through buildings during normal walking.
- [x] Add meaningful scenery geometry/collision tests and scene lifecycle checks using existing test patterns.

### Task 4: Verify and handoff
- [x] Run focused tests and resolve regressions; run npm test, npm run typecheck, npm run build.
- [x] Start local server, inspect normal menu flow and render. Walk from street to plaza/promenade, test building collision and return controls, inspect console and representative views. Refine scale/material/lighting from actual browser evidence.
- [x] Independent spec and quality review; fix actionable findings. Record checks and asset limitations in docs/HANDOFF.md. Keep server available for user playtest; no push/merge unless requested.
