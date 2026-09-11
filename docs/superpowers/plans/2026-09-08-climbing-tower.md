# Climbing Tower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the climbing tower as a second Babylon `Scene`, entered from the hub's colonnade and returned from at its summit.

**Architecture:** One `Engine` owned by `App.svelte`, one scene alive at a time. The character (root, camera, input, player, knight, animation) is extracted from `hubScene.ts` into a rig both scenes call; making that rig scene-agnostic means replacing three hard imports of the hub's height field with an injected ground query and a spawn parameter. Three state machines — tower progress, mode routing, the portal's edge trigger — are pure modules with tests, not lines inside a render observable.

**Tech Stack:** TypeScript (strict), Svelte 5 runes, `@babylonjs/core` 9.21.0 with deep tree-shaken imports, `@babylonjs/havok`, Vitest, Vite, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-08-climbing-tower-design.md` — read it before Task 1. This plan argues from it; where they disagree, the spec wins and the disagreement is a defect in this plan.

## Global Constraints

- **No domain movement code changes.** The tower uses the same `characterMovement.step`, the same homing, the same knight. If a task finds itself editing `src/domain/hub/character/characterMovement.ts`, STOP and report it — spec §8 makes this an acceptance property, not a preference.
- **Every tuning value ships marked `**Untuned**`** with either its derivation or an explicit statement that it is a guess. A constant may not claim a tuning that did not happen, and may not claim a derivation that did not happen.
- **No doc comment may assert something nothing enforces.** Documents *why*, never *what*.
- **State machines are lifted out of render observables** into pure tested modules. Half of PR #39's ten Major findings were state machines living untested inside `playerController`'s observable.
- **Babylon imports are deep and tree-shaken**, and a material needs its side-effect import (`import '@babylonjs/core/Materials/standardMaterial';`) or the mesh renders nothing, silently. Copy the pattern from `crystals.ts`.
- Principles file: `docs/engineering-principles.md`.
- Verify with `npx tsc --noEmit && pnpm vitest run` from the worktree before every commit.
- The tower's grammar, from `movementConstants.ts` — these are inputs, not things to change: `jumpSpeed` 9, `gravity` 24 (apex `9²/48` = 1.6875), `homingRange` 12, `homingConeHalfAngle` 0.6109 rad (35°), `homingBounceSpeed` 9, `homingSpeed` 24.
- Landmark geometry, from `landmark.ts`: `PLAZA_X` −6, `PLAZA_Z` 32, `RING_RADIUS` 8, `PILLAR_COUNT` 8, `PEDESTAL_RADIUS` 1.6, `PEDESTAL_HEIGHT` 0.55.
- Section heights from spec §3, all **Untuned**: section 1 = 18 u, section 2 = 24 u, section 3 = 20 u.

---

## File Structure

**Create — pure logic (no Babylon import):**

| File | Responsibility |
|---|---|
| `src/domain/tower/towerProgress.ts` | Which checkpoint is active, and whether to respawn. Upward-only activation. |
| `src/presentation/babylon/portalTrigger.ts` | The pedestal's edge trigger: fires on entry, will not fire again until it has seen you leave. |

**Create — presentation:**

| File | Responsibility |
|---|---|
| `src/presentation/babylon/characterRig.ts` | The character both scenes need: root, camera, input, player, knight, animation, `readMotion`. Owns the camera→shadows ordering constraint. |
| `src/presentation/babylon/groundHeight.ts` | The `GroundHeight` type and the tower's flat implementation. The hub passes `terrainHeight`. |
| `src/presentation/babylon/towerLevel.ts` | The tower's content as data: platforms, crystals, checkpoints, summit. No Babylon calls. |
| `src/presentation/babylon/towerScene.ts` | Builds the tower scene from `towerLevel`'s data. |
| `src/presentation/babylon/portalRing.ts` | The glowing ring on the colonnade floor. |

**Modify:**

| File | Change |
|---|---|
| `src/app/App.svelte` | Owns the `Engine`; routes between hub and tower. |
| `src/app/gameMode.svelte.ts` | `'intro' \| 'playing'` one-way gate becomes `intro → hub ⇄ tower`. |
| `src/presentation/babylon/hubScene.ts` | Takes an engine; uses the rig; places the ring and the portal. |
| `src/presentation/babylon/playerController.ts:95` | Spawn becomes a parameter. |
| `src/presentation/babylon/followCamera.ts:92,105` | Ground comes from an injected query. |
| `src/presentation/babylon/knight.ts:854,858` | The probe's miss-fallback comes from an injected query. |
| `src/presentation/audio/hubAudio.ts` | A top-level switch for "character sound without music". |

**Tests:** `tests/domain/tower/towerProgress.test.ts`, `tests/presentation/portalTrigger.test.ts`, `tests/app/gameMode.test.ts`.

---

## Task 1: Prove the two risks before anything is built

Spec §10 names two unknowns that can invalidate the design. This task is a **probe, not a feature** — its output is a written finding and a go/no-go. Nothing it builds is kept.

**Files:**
- Create (throwaway): nothing committed to `src/`
- Report: append findings to `docs/superpowers/specs/2026-09-08-climbing-tower-design.md` under a new `## 13. Probe findings`

**Interfaces:**
- Consumes: nothing
- Produces: a recorded answer to "can we teleport the character controller" that Tasks 5 and 10 depend on

### Risk A — moving a `PhysicsCharacterController`

`PhysicsCharacterController.setPosition(position: Vector3): void` exists on the type (`node_modules/@babylonjs/core/Physics/v2/characterController.d.ts:350`). During PR #39's browser verification a `charController.setPosition` call was observed to have **no effect**, and that session worked around it rather than diagnosing it. Checkpoints depend on it.

- [ ] **Step 1: Start the dev server and reach the hub**

Use the Browser pane (`preview_start` with the `dev` launch config), then click SKIP / choose an option until the dialogue overlay is gone. The pane must be VISIBLE: a hidden pane throttles `requestAnimationFrame` to ~0.5 fps, which makes a working game look frozen. If measurements look impossible, check this first.

- [ ] **Step 2: Probe `setPosition` directly**

In the browser console (`javascript_tool`), with `window.charController` exposed by `playerController.ts` in dev:

```js
const c = window.charController;
const before = c.getPosition().clone();
c.setPosition(new (before.constructor)(before.x, before.y + 10, before.z));
await new Promise(r => setTimeout(r, 200));
({ before: before.asArray(), after: c.getPosition().asArray() });
```

Expected if it works: `after.y ≈ before.y + 10` and the knight is visibly ten units higher.

- [ ] **Step 3: If it did nothing, find out why before concluding**

Do not stop at "it does not work". Check, in order, and record which one it was:
1. Is `playerController`'s per-frame observable writing the position back? It copies the solved position into `root` every frame — if it also re-seeds the controller from `root`, a teleport is overwritten in the same frame. Read `playerController.ts`'s observable before blaming Babylon.
2. Does `setPosition` take effect only after the next `integrate`? Step one frame and re-read.
3. Does the capsule land embedded in a collider and get pushed back? Try a teleport into open air.

- [ ] **Step 4: Record the finding in the spec**

Append a `## 13. Probe findings` section stating what was tried, what happened, and the mechanism. If teleporting cannot be made to work, **STOP the plan here and report** — spec §2's checkpoint decision has to be re-opened, and no level content should be authored against a respawn that cannot happen.

### Risk B — the camera on a vertical climb

`followCamera` has only ever run over the hub's terrain. Two specific things to establish:

- [ ] **Step 5: Establish what the ground clamp does at height**

`followCamera.ts:92` anchors the camera to `terrainHeight(t.x, t.z) + CAPSULE_HALF` when the player is within `GROUNDED_BAND` of it, and to the raw `t.y` otherwise; `:105` then pushes the camera up to at least `terrainHeight(...) + CAMERA_GROUND_CLEARANCE`. Read those constants, then reason and confirm: at 60 units up, is the anchor the raw `t.y` branch, and is the clamp a no-op?

The expected answer is yes to both — which means the tower silently loses the anti-judder anchoring that comment exists for. Record whether that matters: the hub needs it because the capsule micro-steps across terrain triangles; a tower of box platforms may not micro-step at all.

- [ ] **Step 6: Fly the camera up and drop it**

Teleport the controller to `y = 60` (using whatever Step 3 established works), let it fall, and watch the camera. Look for: the camera clipping into the column, the vertical smoothing lagging visibly on a 1.3 s fall, and the pitch limits making a straight-down look impossible.

- [ ] **Step 7: Record the finding and commit the spec update**

```bash
git add docs/superpowers/specs/2026-09-08-climbing-tower-design.md
git commit -m "docs(tower): record what the two pre-build probes found"
```

---

## Task 2: `towerProgress` — active checkpoint and respawn

**Files:**
- Create: `src/domain/tower/towerProgress.ts`
- Test: `tests/domain/tower/towerProgress.test.ts`

**Interfaces:**
- Consumes: `Vec3`, `vec3` from `src/domain/math/vec3`
- Produces:
  - `interface TowerCheckpoint { readonly activateY: number; readonly respawn: Vec3 }`
  - `interface TowerProgress { readonly active: number }`
  - `const TOWER_START: TowerProgress`
  - `interface TowerProgressResult { readonly progress: TowerProgress; readonly respawnTo: Vec3 | null }`
  - `function stepTowerProgress(progress: TowerProgress, y: number, checkpoints: readonly TowerCheckpoint[], fallMargin: number): TowerProgressResult`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { stepTowerProgress, TOWER_START, type TowerCheckpoint } from '../../../src/domain/tower/towerProgress';
import { vec3 } from '../../../src/domain/math/vec3';

const CHECKPOINTS: readonly TowerCheckpoint[] = [
  { activateY: 0, respawn: vec3(0, 0, 0) },
  { activateY: 18, respawn: vec3(1, 18, 1) },
  { activateY: 42, respawn: vec3(2, 42, 2) },
];
const MARGIN = 4;

describe('stepTowerProgress', () => {
  it('starts on the floor checkpoint and asks for no respawn', () => {
    const r = stepTowerProgress(TOWER_START, 0, CHECKPOINTS, MARGIN);
    expect(r.progress.active).toBe(0);
    expect(r.respawnTo).toBeNull();
  });

  it('activates the next checkpoint on the way up', () => {
    const r = stepTowerProgress(TOWER_START, 18, CHECKPOINTS, MARGIN);
    expect(r.progress.active).toBe(1);
  });

  // The rule the whole design rests on: falling must not undo progress, or a fall would
  // strand the player a section lower than the checkpoint they earned.
  it('does not deactivate a checkpoint when the player drops back below its height', () => {
    const up = stepTowerProgress(TOWER_START, 18, CHECKPOINTS, MARGIN);
    const down = stepTowerProgress(up.progress, 17, CHECKPOINTS, MARGIN);
    expect(down.progress.active).toBe(1);
  });

  it('respawns to the active checkpoint once the fall passes the margin', () => {
    const up = stepTowerProgress(TOWER_START, 18, CHECKPOINTS, MARGIN);
    const fallen = stepTowerProgress(up.progress, 18 - MARGIN - 0.01, CHECKPOINTS, MARGIN);
    expect(fallen.respawnTo).toEqual(vec3(1, 18, 1));
  });

  it('does not respawn for a drop inside the margin', () => {
    const up = stepTowerProgress(TOWER_START, 18, CHECKPOINTS, MARGIN);
    const dipped = stepTowerProgress(up.progress, 18 - MARGIN + 0.01, CHECKPOINTS, MARGIN);
    expect(dipped.respawnTo).toBeNull();
  });

  // A homing chain can cross a whole section in one dash, so one step may pass two thresholds.
  it('activates the highest checkpoint a single step passes', () => {
    const r = stepTowerProgress(TOWER_START, 50, CHECKPOINTS, MARGIN);
    expect(r.progress.active).toBe(2);
  });

  it('never respawns from the floor checkpoint, which has nothing below it', () => {
    const r = stepTowerProgress(TOWER_START, -50, CHECKPOINTS, MARGIN);
    expect(r.respawnTo).toEqual(vec3(0, 0, 0));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/domain/tower/towerProgress.test.ts`
Expected: FAIL — cannot resolve `src/domain/tower/towerProgress`.

- [ ] **Step 3: Implement**

```ts
import { type Vec3 } from '../../math/vec3';

/**
 * One rung of the climb. `activateY` is the height at or above which this checkpoint takes over;
 * `respawn` is where a fall returns the player to.
 */
export interface TowerCheckpoint {
  readonly activateY: number;
  readonly respawn: Vec3;
}

/** Index into the checkpoint list the tower was built with. */
export interface TowerProgress {
  readonly active: number;
}

/** Index 0 is the tower floor, which is active before the player has climbed anything. */
export const TOWER_START: TowerProgress = { active: 0 };

export interface TowerProgressResult {
  readonly progress: TowerProgress;
  /** Where to put the player this frame, or null to leave them alone. */
  readonly respawnTo: Vec3 | null;
}

/**
 * Advances the climb by one frame.
 *
 * Activation is **upward-only**: a checkpoint the player has reached stays theirs even after they
 * drop back below its height. The alternative — recomputing the active checkpoint from the current
 * height every frame — would deactivate a checkpoint during the very fall it exists to catch, and
 * put the player a section lower than the one they earned.
 *
 * `fallMargin` is how far below the active checkpoint counts as a fall rather than a step down.
 */
export function stepTowerProgress(
  progress: TowerProgress,
  y: number,
  checkpoints: readonly TowerCheckpoint[],
  fallMargin: number,
): TowerProgressResult {
  let active = progress.active;
  while (active + 1 < checkpoints.length && y >= checkpoints[active + 1].activateY) active++;

  const reached = checkpoints[active];
  const respawnTo = y < reached.activateY - fallMargin ? reached.respawn : null;
  return { progress: active === progress.active ? progress : { active }, respawnTo };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsc --noEmit && npx vitest run tests/domain/tower/towerProgress.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/tower/towerProgress.ts tests/domain/tower/towerProgress.test.ts
git commit -m "feat(tower): the climb's checkpoint and respawn rule"
```

---

## Task 3: `gameMode` — a router, not a one-way gate

**Files:**
- Modify: `src/app/gameMode.svelte.ts` (whole file)
- Test: `tests/app/gameMode.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Mode = 'intro' | 'hub' | 'tower'`
  - `createGameMode()` returning `{ get mode(): Mode; get isPlaying(): boolean; toHub(): void; toTower(): void; exitTower(): void }`
  - `type GameMode = ReturnType<typeof createGameMode>`

`isPlaying` keeps its current meaning — "the intro is over" — because `App.svelte` renders the dialogue overlay on `!gameMode.isPlaying` and must keep doing so in both hub and tower.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { createGameMode } from '../../src/app/gameMode.svelte';

describe('createGameMode', () => {
  it('starts in the intro, which is not playing', () => {
    const m = createGameMode();
    expect(m.mode).toBe('intro');
    expect(m.isPlaying).toBe(false);
  });

  it('leaves the intro for the hub, and counts as playing from then on', () => {
    const m = createGameMode();
    m.toHub();
    expect(m.mode).toBe('hub');
    expect(m.isPlaying).toBe(true);
  });

  it('enters the tower from the hub and comes back', () => {
    const m = createGameMode();
    m.toHub();
    m.toTower();
    expect(m.mode).toBe('tower');
    expect(m.isPlaying).toBe(true);
    m.exitTower();
    expect(m.mode).toBe('hub');
  });

  // The intro owns input; a portal firing underneath it would hand the player a scene swap
  // they never asked for and cannot see.
  it('refuses to enter the tower from the intro', () => {
    const m = createGameMode();
    m.toTower();
    expect(m.mode).toBe('intro');
  });

  it('refuses to exit a tower it is not in', () => {
    const m = createGameMode();
    m.toHub();
    m.exitTower();
    expect(m.mode).toBe('hub');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/app/gameMode.test.ts`
Expected: FAIL — `m.toHub is not a function`.

- [ ] **Step 3: Implement**

```ts
/**
 * Where the game is. `intro` is the opening dialogue, which owns input; `hub` and `tower` are the
 * two scenes, and the player moves between them through the colonnade's portal.
 */
export type Mode = 'intro' | 'hub' | 'tower';

/**
 * Reactive top-level mode. The transitions are guarded rather than free-form: entering the tower
 * from `intro` would swap the scene out from under a dialogue that owns input and cannot be seen
 * past, and exiting a tower the player is not in would dispose the scene they are standing in.
 * Both are refused here rather than by every caller remembering to check.
 */
export function createGameMode() {
  let mode = $state<Mode>('intro');
  return {
    get mode() { return mode; },
    /** True once the intro is over — what `App.svelte` keys the dialogue overlay off. */
    get isPlaying() { return mode !== 'intro'; },
    toHub() { if (mode === 'intro') mode = 'hub'; },
    toTower() { if (mode === 'hub') mode = 'tower'; },
    exitTower() { if (mode === 'tower') mode = 'hub'; },
  };
}
export type GameMode = ReturnType<typeof createGameMode>;
```

- [ ] **Step 4: Fix the caller and run everything**

`App.svelte`'s `finishIntro` calls `gameMode.toPlaying()`, which no longer exists — change it to `gameMode.toHub()`. Nothing else in this task touches `App.svelte`.

Run: `npx tsc --noEmit && pnpm vitest run`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add src/app/gameMode.svelte.ts src/app/App.svelte tests/app/gameMode.test.ts
git commit -m "feat(mode): make the mode gate a router the tower can come back through"
```

---

## Task 4: `portalTrigger` — fires once, and only after it has seen you leave

**Files:**
- Create: `src/presentation/babylon/portalTrigger.ts`
- Test: `tests/presentation/portalTrigger.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface PortalTrigger { readonly armed: boolean }`
  - `const PORTAL_START: PortalTrigger`
  - `interface PortalTriggerResult { readonly trigger: PortalTrigger; readonly fired: boolean }`
  - `function stepPortalTrigger(trigger: PortalTrigger, inside: boolean): PortalTriggerResult`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { PORTAL_START, stepPortalTrigger } from '../../src/presentation/babylon/portalTrigger';

describe('stepPortalTrigger', () => {
  // The return from the tower puts the player beside the pedestal, but "beside" is a placement,
  // not a guarantee. Starting disarmed means even a return that lands ON the pedestal cannot
  // bounce the player straight back into the tower.
  it('starts disarmed, so standing inside on the first frame does not fire', () => {
    expect(stepPortalTrigger(PORTAL_START, true).fired).toBe(false);
  });

  it('arms once the player is outside', () => {
    const out = stepPortalTrigger(PORTAL_START, false);
    expect(out.trigger.armed).toBe(true);
  });

  it('fires on entry when armed', () => {
    const out = stepPortalTrigger(PORTAL_START, false);
    expect(stepPortalTrigger(out.trigger, true).fired).toBe(true);
  });

  it('does not fire again while the player stays inside', () => {
    const out = stepPortalTrigger(PORTAL_START, false);
    const entered = stepPortalTrigger(out.trigger, true);
    expect(stepPortalTrigger(entered.trigger, true).fired).toBe(false);
  });

  it('fires again after leaving and coming back', () => {
    const out = stepPortalTrigger(PORTAL_START, false);
    const entered = stepPortalTrigger(out.trigger, true);
    const left = stepPortalTrigger(entered.trigger, false);
    expect(stepPortalTrigger(left.trigger, true).fired).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/presentation/portalTrigger.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

```ts
/**
 * Whether the portal will fire the next time the player is inside it. Disarmed means the player is
 * standing in it now and has not left since it last fired — or has not left since the scene was
 * built, which is what makes arriving on top of your own trigger safe.
 */
export interface PortalTrigger {
  readonly armed: boolean;
}

/** Disarmed: the first frame outside arms it. See `PortalTrigger` for why it is not armed. */
export const PORTAL_START: PortalTrigger = { armed: false };

export interface PortalTriggerResult {
  readonly trigger: PortalTrigger;
  readonly fired: boolean;
}

/**
 * Edge-triggers on entry. `inside` is the caller's question to answer — the pedestal is a cylinder,
 * so it is a planar distance and a height band, and that geometry stays on the Babylon side.
 */
export function stepPortalTrigger(trigger: PortalTrigger, inside: boolean): PortalTriggerResult {
  if (!inside) return { trigger: trigger.armed ? trigger : { armed: true }, fired: false };
  if (!trigger.armed) return { trigger, fired: false };
  return { trigger: { armed: false }, fired: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsc --noEmit && npx vitest run tests/presentation/portalTrigger.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/portalTrigger.ts tests/presentation/portalTrigger.test.ts
git commit -m "feat(portal): edge-trigger that will not fire on the frame you arrive"
```

---

## Task 5: Break the character's dependency on the hub's height field

Spec §7. Three modules import `terrainHeight` directly. This task makes the ground an argument. **The hub's behaviour must not change** — it passes `terrainHeight` and every existing test keeps passing.

**Files:**
- Create: `src/presentation/babylon/groundHeight.ts`
- Modify: `src/presentation/babylon/followCamera.ts` (import at :5, uses at :92 and :105, `createFollowCamera` signature at :60)
- Modify: `src/presentation/babylon/playerController.ts` (import at :16, spawn at :95, `createPlayer` signature at :86)
- Modify: `src/presentation/babylon/knight.ts` (import at :21, `createGroundProbe` at :846, `loadKnight` signature at :904)
- Modify: `src/presentation/babylon/hubScene.ts` (call sites)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type GroundHeight = (x: number, z: number) => number`
  - `function flatGround(y: number): GroundHeight`
  - `createFollowCamera(scene, target, canvas, groundHeight: GroundHeight)`
  - `createPlayer(scene, root, follow, input, crystals, spawn: Vector3)`
  - `loadKnight(scene, parent, shadows, groundHeight: GroundHeight)`
  - `Player.teleport(to: Vector3): void`
  - `FollowCamera.snap(): void`

**Added after Task 1's probe (controller Ruling 3 — see the ledger).** The probe established that
`setPosition` works, and that a respawn is not `setPosition`:

- `controller.setVelocity(0)` survives less than a frame, because `playerController`'s observable
  rewrites the controller's velocity from `player.motion.velocity` before every `integrate`. A
  teleport that does not also zero the DOMAIN's velocity keeps the fall's speed and drops the player
  straight off the checkpoint again.
- `visualY` (in `playerController`) and `smoothY` (in `followCamera`) are closure-private with no
  reset. A raw teleport to y = 60 left the knight rendered at 6.6 and the camera at 5.1, gliding up
  over ~0.33 s and ~0.5 s — a checkpoint respawn would read as a swoop across the whole tower rather
  than a cut.

So this task also produces `Player.teleport(to)`, which sets the controller's position, zeroes the
controller's velocity AND `player.motion.velocity`, and re-seeds `visualY` to the destination; and
`FollowCamera.snap()`, which clears `smoothY` so the next frame re-seeds it instead of easing from
where the camera used to be. Four resets, because the probe found four things holding the old
position. Both are unused until Task 9 — they are here because this is the task that owns these
two modules' internals.

- [ ] **Step 1: Write `groundHeight.ts`**

```ts
/**
 * "How high is the ground at this x/z" — the one question the character asks about a world it is
 * otherwise ignorant of. An argument rather than an import because the hub answers it from a height
 * field and the tower answers it with a floor, and a character that imports one of those answers is
 * a character that only works in one scene.
 */
export type GroundHeight = (x: number, z: number) => number;

/** A world whose ground is a single plane — the tower's floor. */
export const flatGround = (y: number): GroundHeight => () => y;
```

- [ ] **Step 2: Thread it through, one module at a time**

`followCamera.ts`: drop the `terrainHeight` import, add `groundHeight: GroundHeight` as the fourth parameter of `createFollowCamera`, and replace both call sites (`:92`, `:105`) with `groundHeight(...)`. Leave the surrounding comments alone except where they now say something false.

At `:92` the comment explains anchoring to the smooth terrain height to stop the camera juddering as the capsule micro-steps across terrain triangles. That reasoning is about the hub, and the code is about to serve two worlds — add one sentence saying what happens where the ground is a plane far below: the `GROUNDED_BAND` test fails, the anchor is the raw `t.y`, and the anti-judder path simply does not apply. Do not claim it was designed for that; it was not.

`playerController.ts`: drop the `terrainHeight` import, add `spawn: Vector3` as the sixth parameter of `createPlayer`, and use it directly at `:95` in place of the computed `start`. The existing comment there explains the `+ 0.3` lift ("an embedded capsule pops through the one-sided MESH collider and falls") — that reasoning now belongs to the CALLER, so move it to the hub's call site rather than deleting it.

`knight.ts`: drop the `terrainHeight` import, pass `groundHeight` into `createGroundProbe(scene, groundHeight)`, and use it for both fallbacks (`:854`, `:858`). `loadKnight` gains the parameter and forwards it. The doc above `createGroundProbe` says "On a miss it returns the height field" — that is now "the world's ground query", and the sentence about the pedestal at 1.717 is hub-specific measurement that should say so.

- [ ] **Step 3: Update the hub's call sites**

In `hubScene.ts`, import `terrainHeight` and pass it to all three, and construct the spawn where the lift comment now lives:

```ts
// Spawn the capsule's base ON the terrain surface (+ a small lift so it settles down onto it rather
// than starting embedded — an embedded capsule pops through the one-sided MESH collider and falls).
const spawn = new Vector3(0, terrainHeight(0, 0) + CAPSULE_HEIGHT / 2 + 0.3, 0);
```

`CAPSULE_HEIGHT` is currently private to `playerController.ts`. Export it rather than duplicating the number — principle 6, and a second copy of a capsule dimension is a copy that drifts.

- [ ] **Step 4: Run everything and verify the hub is untouched**

Run: `npx tsc --noEmit && pnpm vitest run`
Expected: PASS, all suites, no test edits needed. If a test had to change, the refactor changed behaviour and that is a defect in this task, not in the test.

- [ ] **Step 5: Verify in the browser that the hub still looks and plays the same**

Reach the hub, walk, run, jump, and homing-dash a crystal. The camera must behave exactly as before — this task's whole claim is that nothing changed for the hub.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/babylon/groundHeight.ts src/presentation/babylon/followCamera.ts src/presentation/babylon/playerController.ts src/presentation/babylon/knight.ts src/presentation/babylon/hubScene.ts
git commit -m "refactor(character): make the ground an argument, not an import"
```

---

## Task 6: Extract the character rig

**Files:**
- Create: `src/presentation/babylon/characterRig.ts`
- Modify: `src/presentation/babylon/hubScene.ts` (the block from `const playerRoot` to the `driveKnightAnimation` call)

**Interfaces:**
- Consumes: `GroundHeight` (Task 5), `createFollowCamera`, `createPlayer`, `loadKnight`, `driveKnightAnimation`, `createInput`, `createShadows`
- Produces:
  - `interface CharacterRigOptions { readonly canvas: HTMLCanvasElement; readonly sun: DirectionalLight; readonly makeShadows: (camera: Camera) => Shadows; readonly groundHeight: GroundHeight; readonly spawn: Vector3; readonly crystals: Crystals }`
  - `interface CharacterRig { readonly root: TransformNode; readonly follow: FollowCamera; readonly shadows: Shadows; readonly player: Player; readonly knight: Knight; readonly input: InputState; readonly readMotion: () => KnightMotionSample; suspendInput(on: boolean): void; dispose(): void }`
  - `function createCharacterRig(scene: Scene, options: CharacterRigOptions): Promise<CharacterRig>`

- [ ] **Step 1: Write `characterRig.ts`**

Move — do not rewrite — the existing lines from `hubScene.ts`, preserving their comments. The rig's own doc must carry the ordering constraint, because that is the reason it takes `makeShadows` rather than a `Shadows`:

```ts
/**
 * The character both scenes need, in the order Babylon requires it built.
 *
 * `makeShadows` is a callback rather than a ready-made `Shadows` because of a constraint
 * `hubScene.ts` documented first: Babylon 9 keys shadow generators by camera, so the generator has
 * to be created after this camera exists and before the level registers a single caster. Handing the
 * rig a `Shadows` would mean the caller had already made a camera, and there is only one camera.
 * Handing the level the callback's result keeps the whole ordering rule in one file instead of in
 * two files' memories.
 *
 * `crystals` is the one piece of level content that has to exist first, because `createPlayer` takes
 * it. That is affordable only because `crystals.ts` registers no shadow casters — see its own doc —
 * so the level can place crystals before any shadows exist.
 */
export async function createCharacterRig(scene: Scene, options: CharacterRigOptions): Promise<CharacterRig> {
  const root = new TransformNode('player', scene);
  const follow = createFollowCamera(scene, root, options.canvas, options.groundHeight);
  scene.activeCamera = follow.camera;
  const shadows = options.makeShadows(follow.camera);

  const input = createInput();
  const player = createPlayer(scene, root, follow, input, options.crystals, options.spawn);
  const readMotion = (): KnightMotionSample => {
    const v = player.motion.velocity;
    return {
      planarSpeed: Math.hypot(v.x, v.z),
      airborne: player.airborne,
      homing: player.motion.homing !== null,
      homingEntrySeconds: player.homingEntrySeconds,
      bounced: player.homingBounced,
    };
  };
  const knight = await loadKnight(scene, root, shadows, options.groundHeight);
  driveKnightAnimation(scene, knight, readMotion, () => ({
    walk: player.config.maxSpeed,
    run: player.config.runSpeed,
    // Up and back down under the domain's own gravity — the flat-ground airtime the jump clip fills.
    airtime: (2 * player.config.jumpSpeed) / player.config.gravity,
  }));

  return {
    root, follow, shadows, player, knight, input, readMotion,
    suspendInput: (on: boolean) => { input.setEnabled(!on); follow.setEnabled(!on); },
    dispose: () => { input.dispose(); follow.dispose(); },
  };
}
```

- [ ] **Step 2: Rewire `hubScene.ts` to use it**

The hub's `makeShadows` is `(camera) => createShadows(sun, camera)`, and the dev-only `window.shadows` handle moves to wherever `shadows` is in scope after the rig returns. `hubScene`'s `suspendInput` and the input/camera half of its `dispose` now delegate to the rig.

- [ ] **Step 3: Run everything**

Run: `npx tsc --noEmit && pnpm vitest run`
Expected: PASS, all suites unchanged.

- [ ] **Step 4: Verify the hub in the browser**

Same check as Task 5 Step 5. A move that changes nothing should be invisible.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/characterRig.ts src/presentation/babylon/hubScene.ts
git commit -m "refactor(scene): lift the character rig out of the hub"
```

---

## Task 7: Move the engine up to `App.svelte`

**Files:**
- Modify: `src/presentation/babylon/hubScene.ts` (`:60-63` and `dispose`)
- Modify: `src/app/App.svelte` (`onMount`)

**Interfaces:**
- Consumes: `createCharacterRig` (Task 6)
- Produces: `createHubScene(engine: Engine, canvas: HTMLCanvasElement): Promise<HubScene>` — the engine is now a parameter, and `HubScene.dispose()` disposes the SCENE, not the engine.

- [ ] **Step 1: Change `createHubScene`'s signature and disposal**

```ts
export async function createHubScene(engine: Engine, canvas: HTMLCanvasElement): Promise<HubScene> {
  const scene = new Scene(engine);
```

and

```ts
  const dispose = () => {
    window.removeEventListener('resize', onResize);
    rig.dispose();
    audio.dispose();
    // The scene, not the engine: the engine outlives every level (see App.svelte) and disposing it
    // here would take the WebGL context with it. `scene.dispose()` tears down this level's meshes,
    // physics, materials and observers.
    scene.dispose();
  };
```

The render loop is a problem worth naming: `engine.runRenderLoop(() => scene.render())` currently captures this scene. With one engine and two scenes, the loop must render whichever scene is current. Move `runRenderLoop` and `engine.resize()` out of `createHubScene` and into `App.svelte`, which is the thing that knows which scene is current.

- [ ] **Step 2: Own the engine in `App.svelte`**

```ts
const engine = new Engine(canvas, true, { preserveDrawingBuffer: import.meta.env.DEV, stencil: true });
let current: { scene: Scene; dispose(): void } | undefined;
engine.runRenderLoop(() => current?.scene.render());
engine.resize();
const onResize = () => engine.resize();
window.addEventListener('resize', onResize);
```

and in the unmount cleanup, dispose the current level, remove the listener, then `engine.dispose()`.

Keep the two `canvas.tabIndex = -1` resets and the comment explaining them: the reason given there — that the Scene constructor runs synchronously before the first await — still holds, and now the `Engine` constructor runs even earlier.

- [ ] **Step 3: Run everything**

Run: `npx tsc --noEmit && pnpm vitest run`
Expected: PASS.

- [ ] **Step 4: Verify in the browser**

Reach the hub. Then resize the window — this step moved `engine.resize()` and its listener, so a stretched or clipped canvas is this task's regression, not a pre-existing one.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/hubScene.ts src/app/App.svelte
git commit -m "refactor(app): give the engine to the app, not to the hub"
```

---

## Task 8: Let the audio layer build character sound without music

**Files:**
- Modify: `src/presentation/audio/hubAudio.ts` (`createHubAudio` at `:72`)

**Interfaces:**
- Consumes: nothing
- Produces: `createHubAudio(scene, motion, knight, options?: { readonly music?: boolean })` — `music` defaults to `true`, so every existing caller is unchanged.

This file was hardened over 18 review rounds by another session. **Add a switch; do not restructure it.**

- [ ] **Step 1: Add the option and gate the music director**

Gate only the music director's construction and the `setMusicScene` path. The footstep cadence, the jump cues and the `soundBank` stay exactly as they are — they are what the tower wants.

`HubAudio.setMusicScene` must remain callable with music off (`App.svelte` calls it unconditionally) and do nothing. Document why it is a no-op rather than an error: a level without music is a normal state, not a caller mistake.

- [ ] **Step 2: Run everything**

Run: `npx tsc --noEmit && pnpm vitest run`
Expected: PASS — the existing audio suites cover the default path and must not need editing.

- [ ] **Step 3: Verify the hub still has music**

Reach the hub and confirm the music plays and the AVG→hub crossfade still happens. The default is `true` precisely so this is unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/audio/hubAudio.ts
git commit -m "feat(audio): let a level take the character layer without the music director"
```

---

## Task 9: The tower — data, then geometry

**Files:**
- Create: `src/presentation/babylon/towerLevel.ts`
- Create: `src/presentation/babylon/towerScene.ts`

**Interfaces:**
- Consumes: `createCharacterRig` (Task 6), `TowerCheckpoint` (Task 2), `flatGround` (Task 5), `createCrystals`, `createShadows`
- Produces:
  - `towerLevel.ts`: `TOWER_FLOOR_Y`, `TOWER_CHECKPOINTS: readonly TowerCheckpoint[]`, `TOWER_PLATFORMS: readonly { x, y, z, width, depth }[]`, `TOWER_CRYSTALS: readonly Vec3[]`, `TOWER_SUMMIT: Vec3`, `TOWER_SPAWN: Vector3`, `TOWER_FALL_MARGIN`
  - `towerScene.ts`: `interface TowerScene { readonly scene: Scene; readonly rig: CharacterRig; suspendInput(on: boolean): void; dispose(): void }` and `createTowerScene(engine, canvas, onExit: () => void): Promise<TowerScene>`

- [ ] **Step 1: Write `towerLevel.ts` as data with its derivations**

Every number here is level content and every one of them is a guess until someone climbs it. The file's header must say so once, plainly, and each group must carry the rule it was laid out by — the section rates from spec §3 (a platform step gains at most ~1.4 u against the 1.6875 u apex; a homing link gains 6–8 u against `homingRange` 12 and the 35° cone).

Section boundaries, from spec §3's **Untuned** heights: floor at 0, section 2 starts at 18, section 3 starts at 42, summit at 62.

```ts
/** Where a fall stops counting as a step down. **Untuned**: 4 u is a guess at "deeper than any
 *  deliberate drop between platforms, shallower than a fall that would hang before resolving".
 *  Nobody has felt either edge — see the design spec §4. */
export const TOWER_FALL_MARGIN = 4;
```

- [ ] **Step 2: Write `towerScene.ts`**

Structure it in the order the rig's doc requires:

1. `new Scene(engine)`, `scene.useRightHandedSystem = true` — the same reason the hub gives (glTF is right-handed; a reflected skinned character collapses).
2. A dark sky via `scene.clearColor`, and a light. Spec §2: the white column has to read against something, and no terrain/trees/clouds is where the hub's 91 % shadow cost actually goes away.
3. Physics, reusing the cached Havok module.
4. Crystals from `TOWER_CRYSTALS`.
5. The rig, with `groundHeight: flatGround(TOWER_FLOOR_Y)`, `spawn: TOWER_SPAWN`, and a `makeShadows` that configures cascades for a vertical climb rather than the hub's `shadowMaxZ = 120` over a 100 × 100 plain. If the tower's own shadow numbers are guesses — they are — mark them.
6. The column, the floor, the platforms, the summit pedestal, all white.
7. Character audio via `createHubAudio(scene, rig.readMotion, rig.knight, { music: false })`.
8. The progress observable: `stepTowerProgress` each frame off the capsule's position, and `onExit()` when the summit portal fires.

**Read the capsule's position, not `root.position`.** `root.position.y` is `visualY`, the exponentially-smoothed VISUAL height — PR #39 found that reading it instead of the capsule put the dash's aim 1.5 u behind the truth. A checkpoint decided from a smoothed height would activate late and respawn from the wrong place.

- [ ] **Step 3: Reach the tower with a temporary switch**

Routing is Task 10. To verify this task alone, temporarily build the tower instead of the hub in `App.svelte`, confirm it, then revert that one line before committing.

Check: the knight spawns on the floor and does not fall through it; the column reads white against the sky; platforms are standable; crystals are homing-targetable; falling off returns you to the floor checkpoint.

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && pnpm vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/towerLevel.ts src/presentation/babylon/towerScene.ts
git commit -m "feat(tower): the white tower, its three sections and its checkpoints"
```

---

## Task 10: The portal, and the round trip

**Files:**
- Create: `src/presentation/babylon/portalRing.ts`
- Modify: `src/presentation/babylon/hubScene.ts`
- Modify: `src/app/App.svelte`

**Interfaces:**
- Consumes: `stepPortalTrigger`/`PORTAL_START` (Task 4), `createGameMode` (Task 3), `createTowerScene` (Task 9), `createHubScene` (Task 7)
- Produces: `createPortalRing(scene: Scene): void`; `createHubScene(engine, canvas, onEnterTower: () => void)`

- [ ] **Step 1: Write `portalRing.ts`**

A disc or torus on the colonnade floor at (`PLAZA_X`, `PLAZA_Z`), textured with a runtime `DynamicTexture` — the house pattern from `homingReticle.ts` and `scatter.ts`, so no image file enters the repo. Unlit and emissive so it reads as light. Not pickable, no shadow registration.

Hand the material a **clone** of any module-level `Color3`, not the instance: `crystals.ts` mutates its own material's colour in place for the hit flash, and PR #39 found a module-level colour handed straight to a material is reachable and writable through `scene.materials`.

- [ ] **Step 2: Wire the trigger in `hubScene.ts`**

Per frame: `inside` is the planar distance from the capsule to (`PLAZA_X`, `PLAZA_Z`) being within `PEDESTAL_RADIUS`, and the capsule's feet being within a band of the pedestal's top (`terrainHeight(PLAZA_X, PLAZA_Z) + PEDESTAL_HEIGHT`). Feed it to `stepPortalTrigger`; on `fired`, call `onEnterTower()`.

- [ ] **Step 3: Route in `App.svelte`**

`gameMode` decides; `App.svelte` swaps. Entering: dispose the hub, build the tower, `gameMode.toTower()`. Exiting: dispose the tower, rebuild the hub, `gameMode.exitTower()`.

The hub rebuild must place the player **beside** the pedestal, not on it — spec §5. `createHubScene` needs a spawn for this; give it an optional one defaulting to today's origin spawn, so the first entry is unchanged and only the return uses it. `PORTAL_START` being disarmed (Task 4) is the second line of defence, not the first.

Spec §9's error handling: if building either scene rejects, stay where you are, log, and leave `gameMode` alone. A failed swap must not leave both scenes disposed and a black canvas.

- [ ] **Step 4: Verify the whole round trip in the browser**

Skip the intro, walk to the colonnade at (−6, 32), climb the pedestal, arrive in the tower. Climb to the summit, step on its pedestal, arrive back in the hub beside the colonnade — and confirm you do **not** immediately re-enter. Then walk off and back on to confirm it fires a second time.

- [ ] **Step 5: Run everything**

Run: `npx tsc --noEmit && pnpm vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/babylon/portalRing.ts src/presentation/babylon/hubScene.ts src/app/App.svelte
git commit -m "feat(portal): the ring, the pedestal and the round trip"
```

---

## Task 11: Make the fall read

**Added after Task 1's probe (controller Ruling 4 — see the ledger).** Spec §2 says the player
"watch[es] yourself fall past the column" and §4 says the fall "register[s] as a loss". The probe
measured that neither is true with the camera as it stands, and §2/§4 now point at §13 saying so.
A tower whose central verb is falling, where the fall cannot be seen, fails its own premise — so
this is a task, not a deferred minor.

It comes after Task 10 because it can only be tuned against a real fall down a real tower.

**Files:**
- Modify: `src/presentation/babylon/followCamera.ts`
- Modify: `src/presentation/babylon/towerScene.ts` (the column's material)

**Interfaces:**
- Consumes: `FollowCamera` (Task 5), the tower (Tasks 9, 10)
- Produces: nothing new — this task changes behaviour, not signatures

- [ ] **Step 1: Reproduce the framing failure and measure it**

Climb, fall, and measure where the knight's root sits in normalised screen space each frame of the
drop. The probe's numbers to reproduce or refute: the root crosses the bottom of the frame at 43 % of
a 20 u fall, and is off-screen at touchdown. Record what you measure — if it does not reproduce, say
so and stop; the rest of this task is then unnecessary.

- [ ] **Step 2: Keep the player in frame during a fast descent**

The two smoothers in series (`VISUAL_Y_SMOOTHING` 14 in `playerController`, `verticalSmoothing` 9 in
`followCamera`) were both tuned against a hub whose fastest vertical motion is about 9 u/s. The probe
measured them lagging 2.21 u and 3.44 u at the 30.98 u/s that ends a 20 u fall — together most of a
knight-height, downward, every frame of the fall.

Fix the framing, not the smoothers' hub behaviour: whatever you change must leave the hub's walking
and jumping camera identical, because that camera is tuned and this task has no mandate to retune it.
The cheapest shape that does this is a descent-aware term that only engages above a fall speed the
hub cannot reach — but choose your own; the constraint is the outcome plus "the hub is unchanged".

Any constant you introduce ships **Untuned** with the speed it engages at and why that speed.

- [ ] **Step 3: Stop the column vanishing when the camera is inside it**

`followCamera` does no raycast and has no obstruction handling; the probe parked it inside
`plazaPillar_0` and was not deflected at all, and with `backFaceCulling: true` the pillar rendered
nothing — the camera sees straight through the world.

Real camera collision is a project and is NOT in scope. Do the cheap half: give the tower column a
material with `backFaceCulling = false`, so a camera inside the column sees the column's inside
rather than the world beyond it. Document that this is a mitigation and not a fix, and that the real
answer is camera obstruction handling — a claim like "the camera no longer clips the column" would be
false and is exactly what this project's review flags.

- [ ] **Step 4: Re-measure and record**

Repeat Step 1's measurement. State the before and after in the commit message, and mark anything you
watched but did not measure as watched-not-measured.

- [ ] **Step 5: Run everything**

Run: `npx tsc --noEmit && pnpm vitest run`
Expected: PASS. If a camera test exists and now fails, that is a real regression — the hub's camera
was supposed to be unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/babylon/followCamera.ts src/presentation/babylon/towerScene.ts
git commit -m "fix(camera): keep the player in frame through a fall"
```

---

## Task 12: Play it, and write down what is true

**Files:**
- Modify: `docs/superpowers/specs/2026-09-08-climbing-tower-design.md` (a verification section)

- [ ] **Step 1: Climb the tower end to end, in a VISIBLE browser pane**

A hidden pane throttles `requestAnimationFrame` to ~0.5 fps and makes a working game look broken.

- [ ] **Step 2: Record what was watched and what was measured**

Separately. Anything watched but not measured keeps its **Untuned** marking; anything nobody has watched must say so. Specifically answer: do the three sections play as roughly equal time (spec §3's whole premise), does the 1.29 s fall read as a loss rather than a wait, and does the camera hold up on the climb and the fall.

- [ ] **Step 3: Correct any constant whose comment a playthrough falsified**

A value that has now been watched must not still say nobody has watched it. This is the single most-repeated finding across PR #39's 31 review rounds.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-08-climbing-tower-design.md
git commit -m "docs(tower): record what the first playthrough established"
```

---

## Self-Review

**Spec coverage:** §1 needs no task. §2 → Tasks 9, 10, 11. §3 → Task 9 Step 1. §4 → Tasks 2, 9, 11. §5 → Tasks 4, 10. §6 → Task 7. §7 → Tasks 5, 6. §8 → Tasks 2, 3, 4, and the Global Constraint on domain movement. §9 → Task 8. §10 → Task 1, whose findings then added `Player.teleport`/`FollowCamera.snap` to Task 5 and created Task 11. §11 → Task 12 and each task's test steps. §12 is out of scope by construction. No gaps.

**Placeholder scan:** Task 9's level data is the one place this plan gives a rule rather than the literal numbers — the coordinates of thirteen platforms cannot be authored honestly from a text file, and inventing them here would ship measurements nobody took. The rule, the bounds and the section boundaries are all stated. Every other step has its content.

**Type consistency:** `GroundHeight` (Task 5) is consumed by Tasks 6 and 9 under that name. `TowerCheckpoint`/`stepTowerProgress` (Task 2) are consumed by Task 9. `PORTAL_START`/`stepPortalTrigger` (Task 4) by Task 10. `createCharacterRig` (Task 6) by Tasks 7 and 9. `createHubScene`'s signature grows in Task 7 (engine) and again in Task 10 (`onEnterTower`, optional spawn) — both are stated where they change.
