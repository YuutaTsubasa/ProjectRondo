# White Palace 3D Course Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute independent scene, entrance and combat tasks, then integrate and verify.

**Goal:** Rebuild the existing 3D course as a white-palace tower route, move its entrance into the royal city, and add fighting knight guards.
**Architecture:** Keep platform collision envelopes, crystal chains and course identity for save compatibility. Reuse palace PBR surfaces/architecture and the existing guard GLB. Keep combat state independent of rendering; expose live guard targets through the existing crystal target interface so sword and Homing share damage handling. Region place ID stays `course` while coordinates, visuals, objective and story text change together.
**Tech Stack:** TypeScript, Svelte, Babylon.js, Havok, Vitest.

## Tasks
- [x] White-palace scenery: stone decks, cornices, pillars, blue banners, arcades, distant towers and lower mist; clear jump lanes and same collision surfaces. Reuse current palace textures, no generated art required.
- [x] City entrance: choose a free location near white tower square; move physical portal and beacon, map tracking and return destination. Rename course to 白宮天廊, adjust story directions, keep IDs/progression compatible.
- [x] Knights: about ten on broad platforms, bounded patrol, readable attack windup, 3-hit player life with invulnerability, sword/Homing defeats and effects, restart/respawn/pause cleanup; count defeats/damage on results.
- [x] Regression checks: traversal/collision extents, domain combat, stage life/score/reset, entry and story consistency; typecheck and build.
- [x] Browser verify: actual 3D scene and city entrance, enemy attack/Homing/sword, pause/retry; screenshot for review. Update handoff.

User has authorized the white-palace conversion, city entrance relocation and additional knight enemies. Use existing project art direction (bright coastal royal city). No commit or PR requested.

## Verification outcome
- 100 tests across 13 relevant suites pass; typecheck has no errors/warnings; production build passes (existing large-chunk advisory).
- Browser: real knight GLB patrol, sword defeat, airborne Homing defeat, three-hit recovery, results/retry all exercised. Full course completed using input automation: 7 jumps, 8 crystal bounces, no falls/damage, no page errors.
- Actual city scene verifies new west-square entrance at (-20,43) and safe return (-20,40), clear of tower footprints. Live map marker/objective follows the moved location; the existing baked region atlas background has not been regenerated.
- Read-only review caught an attack warning smaller than the damage radius; shared radius now keeps full warning boundary visible. Arm attack uses measured rig world rotation, preserving patrol gait.
- BGM remains the existing course track until the requested Hardcore remix is supplied. No commit/push.
