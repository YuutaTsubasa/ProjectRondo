# Stage Results Implementation Plan

**Goal:** Replace both trial result cards with the user supplied Light result composition.
**Architecture:** Shared StageResults modal, real per-trial stats, existing animated 3D menu portrait over frozen gameplay; white diagonal surfaces and self-hosted serif headings. Preserve return/retry semantics and suspended gameplay through outro.

- [x] Build shared screen with keyboard focus trap, preferred action focus and guarded exit motion.
- [x] Adapt both HUD result branches, preserving real statistics and callbacks.
- [x] User identified original 2D scoring: verified ProjectAlmost revision 76b9ca1c680e98e27ac9f51871bf4feffb3f0bbc, src/domain/gameplay/stageResult.ts and gameplayStageSources.ts. Restore S/A/B/C/D rules and 1-1 times 30/42/58/78 seconds; initial Rondo 3D times 45/65/90/120 seconds. Zero-target categories retain original full-credit rule and are labeled as base credit in 3D. Track Palace damage, falls and actually reached beacons, retaining deaths separately. No inventory rewards or best-record claim.
- [x] Check result/action tests, session regressions, typecheck and build; inspect desktop and narrow screenshots.
