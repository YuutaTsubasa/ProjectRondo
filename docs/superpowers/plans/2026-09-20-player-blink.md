# Player blink implementation plan

> Execute with superpowers:subagent-driven-development. User-approved design is in ../specs/2026-09-20-player-blink-design.md.

**Goal:** Natural automatic blinking alongside existing player movement.
**Architecture:** Selective offline blink morph retention plus pure timing and a scene-owned adapter.
**Tech stack:** glTF Transform, Babylon, TypeScript, Vitest.

## Import task
- [x] Write failing tests for weighted blink retention and rejection of invalid bindings.
- [x] Modify tools/player-model preparation/conversion/verification to ship `playerBlink` targets only.
- [x] Regenerate GLB/receipt; validate original neutral data, retained closed-eye deltas and future update documentation.

## Runtime task
- [x] Write failing pure timing and Babylon morph/teardown tests.
- [x] Add blink envelope and scene adapter; integrate into loadKnight release without losing existing foot observer cleanup.
- [x] Run focused tests, typecheck/build and source verification.

## Verification
- [x] Inspect open/closed eye shape and automatic timing in the browser, including running and tower transition.
- [x] Independent review, fix findings, update docs and deliver preview.

## Completed verification (2026-09-20)

- Imported asset: 13,173,424 bytes; SHA256 `fe901dd9faadf65020e69df0291764d8fa2676141ede49254d7fc8ad35b48c78`.
- Independent source verification passed: all 14 weighted blink primitive deltas match the original VRM preset; neutral geometry, topology, skin weights, bind matrices, joint order, rest transforms and receipt checksum remain valid.
- Full test suite: 581 passed, 2 failed (583 total). Both failures are the existing FFmpeg portrait asset checks; no new failure. Runtime blink tests cover envelope, random waits, synchronized morphs, hidden-page pause, capped delta and cleanup.
- Typecheck passed with zero Svelte errors/warnings. Production build passed (existing chunk-size warning). `git diff --check` passed.
- Browser: both eyes fully close without exposed iris/sclera; reopen to the original neutral face. Blink continues alongside the Run pose. Four sampled automatic blinks lasted approximately 0.25 seconds with open waits inside the 3-6 second range.
- Browser: grassland -> tower -> grassland transition completed. Automatic blinks were observed in the tower and after returning to the grassland; all 14 morph targets remained present and no console errors were reported.
- Independent specification and code-quality reviews approved with no actionable findings.
- Temporary QA instrumentation stays under ignored `.superpowers/`; normal preview is served at http://127.0.0.1:5183/.