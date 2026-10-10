# White Palace Gateway Integration Plan

**Goal:** Import the user-supplied gate and make the south entrance visibly and physically traversable.
**Architecture:** Extend the existing selective Blender import and asset registry. Keep gate collision as separate piers/lintel using inspected geometry, shared by player physics and camera. Extend the entrance apron and recovery bounds consistently. Preserve all previous town and combat changes.
**Tech Stack:** Blender 5, Babylon/Havok, TypeScript, Vitest.

- [x] Inspect ZIP, convert only the gate to embedded 2K GLB, preserve original exports and previous receipts; inspect opening, dimensions and materials.
- [x] Add layout/asset/passage regression checks, run red. Place gate on south street, extend spawn apron/ground/bounds, use open portal collision and short flanking walls.
- [x] Run focused tests/typecheck/build; browser check facade, walking both ways through portal, pier obstruction and camera behavior. Record source limitations and verification in handoff.

Runtime verification: forward/backward portal traversal succeeded. A two-second lateral movement from the portal centre stopped at x=1.57 against the right pier (z=-42.99), confirming the pier remains solid. Full suite: 765 tests in 119 files; typecheck and build passed.
