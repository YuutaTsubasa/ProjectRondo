# White Palace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** A playable 2.5D White Palace 1-1 with current player, 3D knight guards, combat and results.
**Architecture:** Pure stage data and side-plane simulation under src/domain/palace; Babylon scenery/models read state, Svelte session owns input, lifecycle and HUD. Existing 3D levels keep their control implementation.
**Tech Stack:** TypeScript, Babylon 9, Svelte 5, Vitest.

### 1. Source import and deterministic gameplay (domain implementer)
- [x] Import pinned source stage JSON and art into public/palace, record source hashes; copy enemy GLB. Layout module converts with x/50 and (512-y)/50.
- [x] Write tests in tests/domain/palaceRun.test.ts for 16/8/25/3 source counts, landing, solid sides/head collision, extra jump budget, guard patrol/death, contact health, checkpoint respawn and replay. Run pnpm test tests/domain/palaceRun.test.ts and observe missing-module failure.
- [x] Implement src/domain/palace/palaceLayout.ts and palaceRun.ts. Entry API createPalaceRun(), stepPalaceRun(state,{axis,jump,attack,dt},layout?). State owns player, guards, coins, checkpoint, elapsed, deaths and finished, with one-frame animation cues. Use bounded time steps and swept landing/attack reach. Reuse sword timing constants where possible.
- [x] Run focused tests and add a deterministic complete route input test, no teleport. Preserve no-op at dt=0/finished and reset semantics. Send API contract to integrator.

### 2. 3D presentation (root)
- [x] Create src/presentation/palace/palaceScenery.ts: original parallax layers, solid ivory platforms, gold coins, checkpoint/goal structures, update(state,camera) and scene-owned cleanup.
- [x] Create palaceGuards.ts with one asset container and independent animated copies. Test source GLB joints/clips and seating. Update transforms, facing and defeat fades from domain state.
- [x] Create palaceScene.ts: fixed side camera, light/IBL/shadows, loadKnight and driveKnightAnimation from state, precise feet placement and sword/shield cues; expose update/reset/dispose and dev-only handle.

### 3. Session and entry (root)
- [x] Add failing frontDoor palace routing test. Extend frontDoor.ts, loadGameSession.ts, App.svelte and FrontDoor.svelte with separate palace entry.
- [x] Create src/app/PalaceSession.svelte and src/presentation/palace/PalaceHud.svelte. Use createInput edges, only horizontal input; freeze simulation/animations on pause or hidden, guard late loads, show retryable startup error. Display HP/coins/guards/time/checkpoint and complete results with replay/menu.
- [x] Test session lifecycle and loaded scene cleanup. Verify old front door tests remain valid after fourth menu entry.

### 4. Review and verification
- [x] Independent spec review then quality review; fix findings with regression tests.
- [x] pnpm test; pnpm typecheck; pnpm build; git diff --check.
- [x] Browser full input route, combat/hurt, checkpoint recovery, pause/resume, replay/menu; visual checks for camera, guard animation, feet and backgrounds. Keep normal preview playable. Update docs/HANDOFF.md with measured results and limitations.
