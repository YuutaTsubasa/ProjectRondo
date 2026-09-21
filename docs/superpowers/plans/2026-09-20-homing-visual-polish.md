# Homing Visual Polish Implementation Plan

> Use superpowers:subagent-driven-development for separate crystal and trail work; parent owns reticle and integration/browser verification.

**Goal:** More refined Homing Attack trail, crystals, and target reticle matching the revised JRPG meadow.
**Architecture:** Keep gameplay/domain unchanged. Separate time-based trail presentation from knight animation, keep createCrystals positions/flash API, and retain reticle showAt/hide API.
**Tech Stack:** Babylon.js, TypeScript, procedural mesh/material/Canvas texture, Vitest.

- [x] Trail: create dashTrail.ts and pure trail history helper/test; replace frame-count TrailMesh with bounded time-based sampled geometry, pale core/blue sheath and fading tapered tail; update knight type/integration and fixtures. Test equivalent distance/lifetime at30/60/120FPS, stop fade, reset and observer cleanup. Check generator sits at torso after Idle seating.
- [x] Crystals: retain CRYSTAL_EXTENT and createCrystals API; construct bevelled faceted geometry within old bounds, shaded blue material and small luminous core. Add bounded short hit-ring/sparks driven by existing flash(index); preserve static target positions. Test flash isolation, rest restoration, valid normals, bounds and scene disposal with NullEngine.
- [x] Reticle: replace heavy single ring with four warm-red segmented arcs, pale ticks and dark contrast outline, open centre; time-based short contraction on new target only. Add pure acquisition timing tests for repeated target, hide/reacquire, and time partition equivalence. Keep current ground/dash eligibility.
- [x] Integration: independent spec/quality review; inspect hub close/far crystal and reticle, actual jump/dash and tower, trail shutdown and replay. Run full pnpm test, pnpm typecheck, pnpm build, git diff --check. Update handoff and return preview to normal playable URL.
## Verification

- Reticle timing and lock tests passed. Independent review confirmed no retrigger on repeated preview, immediate hiding, and scene-owned resource cleanup.
- Crystal focused tests cover geometry bounds, flash isolation/recovery, invalid indices, empty sets and teardown. Independent review confirmed winding/outward normals, shared geometry and independent simultaneous hit visibility.
- Trail tests cover equal-time30/60/120FPS sampling, fade lifetime, bounded history, reset/warp protection and scene disposal. Independent review approved start/stop integration and alpha/material behavior.
- Browser attack first pass: one hit,16 dash frames and26 visible trail frames, then no enabled trail meshes. Two-attack run:2 hits,30 dash frames46 trail frames, no lingering trail or errors. Frame counts are run observations, not timing requirements.
- Browser identified the static torso anchor could detach during kick pose. Switched to the imported Chest joint from receipt boneMap; missing joint retains a seated fallback. Two regressions cover animation lift/rotation and fallback. Independent review approved hierarchy and cleanup.
- Final automated validation:84 files606 tests pass. Full typecheck0errors/warnings. Production build succeeds; existing large-chunk warning remains.
- Final browser verification after Chest anchor fix: side-view kick stays attached to torso; one hit observed, then no enabled trails. Normal camera chain hit twice (29 dash frames/42 trail frames), fully faded, no errors. Tower crystal/reticle close-up and hub-to-tower-to-hub roundtrip verified; returned hub has157 meshes and no enabled trail or reported errors. QA-only tower interface mismatch corrected in ignored harness; no production change required.


## 2026-09-21 crystal surface correction

User reported a checkerboard appearance. Cause: alternating per-face vertex colours shifted by ring, compounded by four horizontal geometry rings. Removed the painted facet palette and reduced the geometry to long tip-to-waist planes with one narrow bevel. All shells use a uniform blue material; scene lighting supplies facet variation. Existing target extent, positions, hit flash and reticle are unchanged. Browser close/medium views confirm the coloured grid is gone. Existing five crystal tests pass; full typecheck has zero errors/warnings and production build succeeds (existing chunk-size warning).
