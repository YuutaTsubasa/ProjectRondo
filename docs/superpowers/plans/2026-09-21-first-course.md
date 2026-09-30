# Windward Ruins Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent scene implementation and review; execute integration in this session.

**Goal:** A playable grassland run/jump/Homing course with checkpoints, finish, replay and a direct main-menu entry.
**Architecture:** Data-only courseLayout.ts defines platforms, crystal positions and ordered gates. courseProgress.ts is pure progression. courseScene.ts owns Babylon objects through shared rig/teardown; CourseSession.svelte owns engine, HUD and pause/result interactions. App selects the session through the existing lazy front-door loading path.
**Tech Stack:** TypeScript, Svelte 5, Babylon 9, Havok, Vitest.

## 1. Course world (delegated)
- [x] Create src/domain/course/courseLayout.ts: CourseGate {label,center:{x,y,z},halfWidth,halfDepth,spawn:{x,y,z}}, COURSE_GATES readonly nonempty array, COURSE_SPAWN, COURSE_KILL_Y. Gate center.y is standing capsule height, spawn is capsule-center position. Start checkpoint is index 0, last gate is finish.
- [x] Create src/presentation/babylon/courseScene.ts exporting createCourseScene(engine,canvas): Promise<CourseScene>. CourseScene provides scene, player, follow, suspendInput(on), dispose(). Follow existing scene/LevelParts/rig teardown; build collision platforms before play, only scene-owned effects. Rig returns suspended. Expose no input listeners beyond rig. Crystals laid out forward along +Z with generous acquisition and safe landing clearance.
- [x] Add meaningful layout reachability tests: safe jump gap margin under the 6-unit ideal running range; adjacent crystals within 12-unit homing range; standing gates supported by platforms.
- [x] Render and inspect from spawn, each checkpoint and finale; tune layout visually.

## 2. Pure progress (local)
- [x] Add failing tests in tests/domain/courseProgress.test.ts for ordered/grounded gates, missed gates, falls, finish latch and pause dt.
- [x] Implement createCourseRun() and stepCourseRun(run,{position,grounded,dt},gates,killY) returning {run,respawn}; run fields checkpoint,elapsed,falls,finished. Clamp dt to [0,.1] to exclude suspension/stall leaps. Finish returns the same run on subsequent steps.
- [x] Run pnpm test tests/domain/courseProgress.test.ts and verify green.

## 3. Session + Light UI (local)
- [x] Add CourseSession.svelte; own engine/scene async lifetime, use levelSwap for late-load disposal. Step only while ready and playing. Fall teleports and camera snaps; completion suspends rig; restart creates fresh run and teleports to spawn. Escape/hidden tab pause. Show checkpoint label, timer, fall count, controls; pause and finish dialogs with focused action and return menu callback.
- [x] Extend frontDoor action with course and leave; only menu permits course->loading and game permits leave->menu. App remembers selected session across load failure/retry and clears it on leave.
- [x] loadGameSession(entry='hub') lazily loads appropriate component. Add onExit optional/shared props. Add Trial menu button after Start. Keep Start initial focus.
- [x] Extend tests/app/frontDoorUI.test.ts to verify course routing, retries and return menu; meaningful HUD pause/replay callbacks test if needed.

## 4. Verification + review
- [x] Run focused tests, pnpm typecheck; resolve failures.
- [x] Independent spec review followed by quality review of course files/integration. Resolve actionable findings.
- [x] Browser: Title->Trial, run/jump/Homing route, fall respawn, pause/resume, finish/replay/menu, existing Start path still available. Use ignored QA controls only for diagnostic camera/teleport; distinguish simulated traversal from actual input.
- [x] pnpm test and pnpm build. Update HANDOFF and checklist with results and remaining visual/playtest limitations. No automatic commit/push: previous snapshot request is complete.
