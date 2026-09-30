# Palace Homing and Mist Implementation Plan

**Goal:** Let palace Homing cross walls safely and hide exposed lower architecture in mist.
**Architecture:** Palace domain owns dash-only collision bypass and safe cancellation. Palace PBR materials fade by world height into a scene-owned cloud sea with game-clock drift.
**Tech Stack:** TypeScript, Vitest, Babylon.js.

- [x] Add failing tests for occluded target selection, wall/floor passage, safe cancellation and restored normal collision.
- [x] Update palaceRun Homing movement and hit/cancel handling; run palace domain tests.
- [x] Add palaceLowMist shader mesh and connect its clock to scenery updates.
- [x] Verify visuals and traversal in the browser, run tests/typecheck/build, document results.
