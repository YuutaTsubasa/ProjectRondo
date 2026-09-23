# Sword Shield Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Equip the player with sword/shield, contextual J attacks and independent Space double jump.

**Architecture:** Keep ground contact and Homing lock pure. Wrap ground contact with a single air-jump budget and expose a jump impulse to the existing movement step. Use a pure sword attack timeline/hit rule, read by playerController, and render equipment/upper-body poses through a separate visual module attached by knight. Share the behavior across all three levels.

**Tech Stack:** TypeScript, Babylon 9, Havok, Svelte 5, Vitest.

### Task 1: Independent actions and air jump (root)
Files: input.ts, new playerJump.ts wrapping groundContact.ts, homingLock.ts, playerController.ts, new swordAttack.ts; their tests.
- [x] Add failing tests: J consumes attack once, Space consumes jump only, disabled/blur clears both. Ground jump -> Space in air gives one impulse -> another Space does not; Homing bounce cannot refill; landing and respawn reset.
```ts
press('j'); expect(input.consumeAttack()).toBe(true); expect(input.consumeJump()).toBe(false);
```
- [x] Run focused tests to observe red, implement input.consumeAttack and air jump state. Keep jump buffering and coyote time. Explicit air-jump impulse must participate in solver ownsClimb and takeoff protection.
- [x] Add sword timeline tests for frontal in-range hit once, behind/out-of-range miss, cooldown and Homing cancellation. Use a shared exported duration for visuals.
- [x] Route J through Homing lock only when physically off ground, falling back to slash otherwise. Space never requests Homing. Reset contact, slash and transient cues on teleport. Run focused tests and typecheck.

### Task 2: Equipment and pose visuals (visual implementer)
Files: new knightEquipment.ts (+ helper if needed), knight.ts, playerModel.ts, visual tests.
- [x] Inspect real import receipt/bones; write attachment/teardown and pose tests, observe red.
- [x] Build a one-handed metal sword and medium shield; parent to correct hands after model scaling/seating. Register shadows and release owned resources.
- [x] Expose KnightMotionSample optional swordSeconds:number|null and airJumped:boolean. swordSeconds is elapsed seconds since start, null at rest. Drive upper-body slash and shield-first dash, retaining locomotion legs. Use frame time and restore baseline bones before next animation evaluation; prevent drift. Suppress flying kick for equipped player.
- [x] Restart jump animation and play takeoff audio for airJumped; add a short sword arc. Keep animation-only fixtures compatible. Run focused real Babylon tests.

### Task 3: Integration, hints and verification (root)
Files: characterRig.ts, CourseHud.svelte, any existing control hints, docs/HANDOFF.md.
- [x] Pass player swordSeconds/airJumped through readMotion. Update hints to Space jump/double jump and J sword/shield attack.
- [x] Add an integration regression exercising real input into playerController through mocked physics, covering routing, hit event and respawn cleanup.
- [x] Run pnpm test, pnpm typecheck, pnpm build; fix failures at source.
- [x] Browser: check equipment/pose visually, slash ground/air, double jump (third press refused), J shield chain and full trial finish. Verify pause/resume, replay and no console errors.
- [x] Spec review then code quality review, resolve concrete issues, record validation and keep a playable preview.
