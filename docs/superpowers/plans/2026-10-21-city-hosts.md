# White City hosts implementation plan

**Goal:** Freely explore and speak to ten stage hosts.
**Architecture:** RegionSession owns optional dialogue and stage transitions; regionProgress retains independent completion flags; content catalog names the hosts; region scenery draws shared economical humanoids.
**Tech stack:** Svelte, TypeScript, Babylon.js, Vitest.

- [x] Update regionProgress and regionSession tests to assert unrestricted entry, independent persistence, and optional stories; run to establish failures.
- [x] Implement policies and session UI, retaining return positions and old chapters.
- [x] Add host catalog/NullEngine anchor tests; establish failures and implement shared humanoid scenery.
- [x] Run focused Vitest suites and typecheck. No commits or pushes requested.

Validation: tests were observed failing for mandatory arrival, locked first stages, independent completion records, absent host meshes, ordered city records, map labels, and host HUD tracking. Focused regression tests cover optional original chapter, controller pause, loading failure, outro input suspension, save migration, all stage returns, anchor geometry and distance culling.
