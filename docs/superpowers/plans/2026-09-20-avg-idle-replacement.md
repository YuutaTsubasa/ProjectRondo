# AVG Idle Portrait Implementation Plan

> Execute inline with superpowers:executing-plans. The user approved replacing all three AVG portrait forms.

**Goal:** Show the new character idle video in dialogue, including animation and still fallbacks.
**Architecture:** Retain existing renderer and regenerate its three assets using the README pipeline.
**Tech Stack:** FFmpeg, sharp, Svelte, Vitest.

- [x] Inspect source frames and record source hash; preserve the source file.
- [x] Reproduce current portrait test failures, fix frame counting and WebP alpha decoding.
- [x] Regenerate public/portraits/knight_idle.webm, knight_idle.webp and knight_idle_still.webp using the README commands with the new source and `-y`.
- [x] Run portrait tests, typecheck and build; verify dimensions, alpha, duration and audio removal.
- [x] Inspect actual dialogue rendering and looping in the browser; inspect animated/still fallbacks.
- [x] Update README source and reproduction notes, HANDOFF and this verification record.

## Verification results

- Original source SHA256: c93f7d77a6e4c298185db62a10b3d2ea6ec4bbc0e6462a194c9ad9b26b07d9ff. Source unchanged.
- Output geometry 514x900. WebM: 62 video frames, 5.166 seconds, no audio, 481112 bytes. Animated WebP: 2389974 bytes. Still WebP: 66774 bytes.
- Reproduced the two previous portrait test failures before fixing decoder selection. All 11 asset checks now pass with decoded alpha checks retained.
- Full suite: 76 files and 583 tests passed. Typecheck: zero errors/warnings. Production build passed with existing chunk-size/plugin timing warnings. Diff whitespace check passed.
- Normal dialogue page shows the new portrait with the grassland visible around its silhouette. Actual video DOM confirms 514x900, muted, looping, playing and duration 5.166 seconds; no browser errors.
- Temporary checkerboard comparison page verified all three formats visually. Animated WebP changes pose while the still stays fixed; video completed six loops without error. Source first/middle/last frames inspected for pose continuity.
- Existing dialogue renderer, 3D motion and capability/reduced-motion behavior are retained. Updated README recipes and handoff notes. Temporary QA is ignored under .superpowers/.