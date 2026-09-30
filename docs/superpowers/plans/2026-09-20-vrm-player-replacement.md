# V20 player model implementation plan

> Execute with superpowers:subagent-driven-development; approved design is in ../specs/2026-09-20-vrm-player-replacement-design.md.

**Goal:** Replace both playable 3D characters with V20 and provide a repeatable local import command.
**Architecture:** Offline VRM1 conversion produces a conventional animated GLB plus a provenance receipt. Runtime retains the Knight interface and shared rig, using model metadata for materials and feet instead of previous mesh names.
**Tech stack:** TypeScript, Babylon 9, Node, glTF Transform, sharp, Vitest, Svelte.

## Task 1 — Import and animation transfer
- [x] Add tools/player-model/import.mjs and focused helpers; expose a CLI accepting source VRM1 and an immutable animation-source GLB.
- [x] Preserve existing animation donor as tools/player-model/animations.glb (strip render geometry/textures if retarget can operate on the skeleton alone).
- [x] Test retargeting from different parent/rest axes, missing required bones, and hip displacement scaling before implementing helpers.
- [x] Convert VRM1 to glTF: retain neutral geometry and skin, remove unused expression data, compress color textures to WebP at a maximum 2048 pixels. Keep source material factors and outline parameters in extras.playerMaterial; mark role body or head through an explicit mesh/material classification policy.
- [x] Bake Idle, Walk, Run, Jump and FlyingKick rotations with rest-transform transfer and scale hip translations for the destination rig. Keep source times and clip semantics.
- [x] Write proposed output first, validate references/transforms/clip coverage, then publish public/models/player-v20.glb plus player-v20.json receipt. Record source/donor/output hashes, settings, bone map and actual size.
- [x] Verify repeat import produces identical output and update instructions for future revisions.

## Task 2 — Game integration
- [x] Add central src/presentation/babylon/playerModel.ts describing URL/version, import facing, and material/foot metadata.
- [x] Add new model material adaptation without reusing the previous knight_mr map. Preserve supplied colors and provide restrained toon-like lighting/outline from imported metadata; verify visually rather than promise pixel-identical MToon.
- [x] Adapt loadKnight to use new asset and clip contract while preserving the Knight interface, animation blending, sole seating, plantFeet and teardown.
- [x] Reconcile asset-specific shadow and foot tests: archive donor checks explicitly; test the active model contract separately. Do not weaken existing generic math/rig behavior tests.
- [x] Run targeted Vitest, typecheck and build.

## Task 3 — Browser verification and review
- [x] Start Vite and open a visible browser. Inspect appearance from multiple angles, all five clips and feet on ground/pedestals.
- [x] Enter/exit tower; check camera orientation, collision/controls and disposal errors.
- [x] Record screenshots and frame times at stated resolution, compare loaded old and new scenes within the same session where feasible.
- [x] Run full suite; report the known two unchanged FFmpeg portrait failures separately.
- [x] Request separate spec and code-quality review, fix actionable findings, then report changes and limits.

## Verification result (2026-09-20)

- TypeScript, Svelte diagnostics (0 warnings), and production build pass.
- Final focused verification: 35/35 tests pass. Full suite: 556/558 pass; the two FFmpeg/ffprobe
  portrait failures are unchanged from the main-branch baseline (unsupported ffprobe codec option
  and local FFmpeg animated-WebP decoding). AVG assets were not changed.
- Import verification against the original V20 VRM passes; repeat output is byte-identical.
- Independent spec and code-quality reviews found no blocking defects.
- Browser screenshots in the task show front/side/back appearance and sampled Idle, Walk, Run,
  Jump and FlyingKick poses. Live running and jumping work. Grassland -> tower -> summit return
  completes with 25 skinned mesh primitives, 14 player materials and no browser errors after return.
  Temporary local QA controls relocated the character to portals to verify scene transitions;
  this was not a full manual tower playthrough.
- At a visible 1463x1216 viewport, stable grassland/tower requestAnimationFrame median was 16.7 ms
  and p95 about 16.8 ms over 180 samples. These are vsync-limited frame intervals, not GPU timings;
  no controlled old-vs-new performance comparison or low-end-device benchmark was performed.
- MToon lighting remains an approximation. The neutral face is retained; facial morph targets and
  VRM spring-bone simulation are outside the approved 3D-player scope.

## Follow-up: idle stance and hands

User feedback: feet too close together and open hands look unnatural. Measured uncorrected idle ankle
spacing at 0.12385 model units; the donor has no finger channels. The import now applies 4.5-degree
outward hip rotation with ankle roll compensation only to Idle, plus constant relaxed finger poses
to all five clips. The receipt records these settings. Neutral geometry/rest transforms and existing
non-idle animation curves remain intact. Regression checks failed before correction and pass after;
31 focused tests, source-geometry verification, TypeScript/Svelte checks and build pass. Independent
code review found no blocking issue. Browser front and side views confirm widened stance and curled
fingers, including the Run pose. No gameplay or AVG changes.

## Follow-up: walking and running toe-in

User reported toe-in during both gaits. Sampling the original transferred curves showed crossing
foot paths (Walk ankle gap -0.00117 model units; Run 0.01795 at their first keys), in addition to
inward toe headings. Extended the pose adjustment to Walk and Run: 6.6-degree hip spread, ankle
counter-roll and 12-degree outward foot heading. Original key times, neutral geometry, upper-body
motion and jump/kick curves are retained. The regression interpolates channels at shared key timestamps plus 601 evenly spaced times, requiring separate
ankle paths and a bounded forward-facing toe direction, excluding folded airborne feet where yaw
projection becomes unstable. Minimum corrected gaps are Walk 0.16066 and Run 0.08320 model units.
Independent review caught and corrected an earlier test that combined unrelated channel key indices.
Before/after tests reproduced the issue and now pass; all 33 focused tests, source verification,
typecheck and build pass. Browser front-view Walk/Run poses confirm separated feet.
