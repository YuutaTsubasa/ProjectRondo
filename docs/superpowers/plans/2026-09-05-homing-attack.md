# Homing Attack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the knight a 3D-Sonic-style homing attack — jump, press jump again, dash to the nearest crystal inside the camera's cone, bounce off it, chain.

**Architecture:** Two new pure domain modules (3D vector arithmetic, and cone-and-range target selection) plus a new branch inside the existing `characterMovement.step`, so velocity keeps exactly one owner per frame. Presentation holds the crystal list, runs the selection against the camera's true 3D forward, and hands the domain a single offset vector.

**Tech Stack:** TypeScript, `@babylonjs/core` 9.21.0 (deep subpath imports), Havok character controller, Vitest, pnpm. Godot 4.7.2 mono for the animation task only.

**Spec:** `docs/superpowers/specs/2026-09-05-homing-attack-design.md`

## Global Constraints

- **Package manager is pnpm.** `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm dev`. Never npm/yarn.
- **No new runtime dependencies.** Only `@babylonjs/core`, `@babylonjs/havok`, `@babylonjs/loaders` are installed. `TrailMesh` is already inside `@babylonjs/core`.
- **No new binary assets except the one the owner supplied.** Crystals are procedural geometry, like `scatter.ts`'s rocks. The only new binary is `FlyingKick.fbx` (Task 8), which is LFS-tracked by `.gitattributes`.
- **`src/domain/` stays pure** — no babylon, Svelte, DOM or IO imports, ever. Vitest-covered, TDD red-then-green.
- **Scene code is verified in-browser; the rules it feeds are not scene code.** What needs a live Babylon scene — meshes, materials, the render observable — can only be judged by playing the game, and that is the browser gate spec §10 describes. But a rule that merely *runs* inside a render loop is testable the moment it is lifted out of one, and this repo lifts them: `groundContact.ts` and `slopeMotion.ts` already have Vitest suites under `tests/presentation/`, and this phase adds `homingLock.ts` and `jumpPose.ts` on the same reasoning. The test is whether the thing can be reduced to inputs and outputs, not which directory it lives in. An edge machine that only misbehaves for one frame is exactly what a browser pass cannot catch, so pulling it out is the point rather than an exception.
- **Deep babylon subpath imports need their side-effect imports** (e.g. `import '@babylonjs/core/Materials/standardMaterial'`), or a mesh with no explicit material renders nothing, silently.
- **A constant may not claim a tuning that did not happen.** Every new tuning value ships marked **Untuned** with its derivation, until someone has played it. This is enforced by review in this repo.
- **`MovementInput.homingTarget` is an OFFSET, not a position** — the vector *from the player to the crystal*, in world axes. See the note under Task 3; this is the plan's resolution of an ambiguity the spec left open.
- Node and pnpm are not on the Bash tool's PATH. Prefix shell commands with:
  `export PATH="$PATH:/c/Users/sinma/AppData/Roaming/npm:/c/Program Files/nodejs"`
- Baseline before Task 1: **23 test files, 136 tests, all passing**; `pnpm exec tsc --noEmit` clean.

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/domain/math/vec3.ts` | modify | 3D vector arithmetic (currently only the type, `vec3()` and `ZERO3`) |
| `tests/domain/math/vec3.test.ts` | create | Its arithmetic, including the zero-length normalize convention |
| `src/domain/hub/character/homingTarget.ts` | create | Cone-and-range selection. Pure geometry, no kinematics |
| `tests/domain/hub/character/homingTarget.test.ts` | create | Selection cases including the degenerate coincident target |
| `src/domain/hub/character/characterMotion.ts` | modify | `homing` state on `CharacterMotion` |
| `src/domain/hub/character/movementInput.ts` | modify | `homingTarget` offset on `MovementInput` |
| `src/domain/hub/character/movementConstants.ts` | modify | The five homing constants |
| `src/domain/hub/character/movementConfig.ts` | modify | Their types |
| `src/domain/hub/character/characterMovement.ts` | modify | The dash branch inside `step` |
| `tests/domain/hub/character/homingMovement.test.ts` | create | The dash branch, kept out of the existing movement suite |
| `tests/domain/hub/character/characterMovement.test.ts` | modify | Its input fixture gains `homingTarget: null` |
| `tests/domain/hub/character/valueTypes.test.ts` | modify | The five constants in `DEFAULT_CONFIG`, and the new fields on `NONE_INPUT` and `IDLE` |
| `src/presentation/babylon/crystals.ts` | create | Procedural crystals, their world positions, and the hit flash. Takes a `Scene` |
| `src/presentation/babylon/homingLock.ts` | create | The lock lifecycle: which crystal a dash is committed to, its entry estimate, and the reticle's separate preview |
| `tests/presentation/homingLock.test.ts` | create | The lock alone, and composed with the ground machine over the press both could claim |
| `src/presentation/babylon/homingReticle.ts` | create | The ring drawn on the crystal a press would hit right now |
| `src/presentation/babylon/homingColors.ts` | create | The one red the reticle and the hit flash both read, so aim and arrival cannot drift apart |
| `src/presentation/babylon/jumpPose.ts` | create | One off-ground signal for the pose, and which seam the jump clip starts from |
| `tests/presentation/jumpPose.test.ts` | create | The seam choice, and the probe frames that find floor mid-dash and under a low crystal |
| `src/presentation/babylon/groundContact.ts` | modify | Keep the bounce's climb off the probe, and keep a press on a frame a dash owns out of the jump |
| `tests/presentation/groundContact.test.ts` | modify | The bounce and dash-in-flight cases added to the existing suite |
| `src/presentation/babylon/slopeMotion.ts` | modify | `solverVelocity`: keep the surface's climb off a jump's and a dash's own vertical velocity |
| `tests/presentation/slopeMotion.test.ts` | modify | The frames that must bypass `alignToSurface`, added to the existing suite |
| `src/presentation/babylon/playerController.ts` | modify | Press → selection → offset into the domain; flash the crystal on the bounce |
| `src/presentation/babylon/knight.ts` | modify | Dash pose, the bounce's clip seam, the trail |
| `src/presentation/babylon/hubScene.ts` | modify | Build the test crystals |

Code only. The Flying Kick clip's binaries and pipeline files live in Task 8's own Files block instead,
because whether they move at all depends on how the retarget run goes — the task is sequenced last
precisely so a failed run costs nothing here.

---

### Task 1: Vec3 arithmetic

**Files:**
- Modify: `src/domain/math/vec3.ts`
- Test: `tests/domain/math/vec3.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `sub(a, b)`, `scale(a, k)`, `lengthSquared(a)`, `length(a)`, `normalize(a)`, `dot(a, b)` — all over `Vec3`, all returning `Vec3` except `lengthSquared`/`length`/`dot` which return `number`. Not `add`: mirroring `vec2.ts` suggests it, but nothing in this phase adds two `Vec3`s — the dash offset is built by `sub` and consumed by `scale` — and an export with no caller is a surface to maintain in exchange for nothing.

`vec3.ts` today is three lines: the type, `vec3()` and `ZERO3`. The cone test needs subtraction, length, normalization and a dot product, and none exist. `src/domain/math/vec2.ts` already has the 2D equivalents — mirror its names and its conventions exactly, so a reader who knows one knows the other.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/math/vec3.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { vec3, ZERO3, sub, scale, lengthSquared, length, normalize, dot } from '../../../src/domain/math/vec3';

const P = 10;

describe('vec3 arithmetic', () => {
  it('subtracts componentwise', () => {
    expect(sub(vec3(10, 20, 30), vec3(1, 2, 3))).toEqual(vec3(9, 18, 27));
  });

  it('scales componentwise', () => {
    expect(scale(vec3(1, -2, 3), 2)).toEqual(vec3(2, -4, 6));
  });

  it('measures length and squared length', () => {
    expect(lengthSquared(vec3(3, 4, 12))).toBe(169);
    expect(length(vec3(3, 4, 12))).toBeCloseTo(13, P);
  });

  it('normalizes to unit length', () => {
    const n = normalize(vec3(0, 0, -5));
    expect(n).toEqual(vec3(0, 0, -1));
    expect(length(normalize(vec3(1, 2, 3)))).toBeCloseTo(1, P);
  });

  // Mirrors vec2.normalize, which returns ZERO rather than NaN for a zero vector and documents that
  // as intentional. The homing cone relies on it: a crystal exactly at the player has a zero-length
  // direction, and NaN there would poison the whole comparison.
  it('normalizes the zero vector to zero rather than NaN', () => {
    expect(normalize(ZERO3)).toEqual(ZERO3);
  });

  it('takes a dot product', () => {
    expect(dot(vec3(1, 0, 0), vec3(0, 1, 0))).toBe(0);
    expect(dot(vec3(1, 2, 3), vec3(4, -5, 6))).toBe(4 - 10 + 18);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/domain/math/vec3.test.ts`
Expected: FAIL — `sub`, `scale`, `lengthSquared`, `length`, `normalize` and `dot` are not exported.

- [ ] **Step 3: Write the implementation**

Replace the body of `src/domain/math/vec3.ts` with:

```ts
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const ZERO3: Vec3 = vec3(0, 0, 0);

export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => vec3(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const lengthSquared = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const length = (a: Vec3): number => Math.sqrt(lengthSquared(a));

export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  // Intentional: return ZERO3 (not NaN) for a zero vector, the same convention `vec2.normalize`
  // documents. Callers here guard against zero before it matters — `homingTarget` treats a
  // zero-length direction as "not in the cone" — and NaN would silently propagate through the
  // comparison instead of failing.
  return len === 0 ? ZERO3 : scale(a, 1 / len);
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/domain/math/vec3.test.ts`
Expected: PASS, 6 tests.

Run: `pnpm test`
Expected: 24 files, 142 tests, all passing.

- [ ] **Step 5: Commit**

```bash
git add src/domain/math/vec3.ts tests/domain/math/vec3.test.ts
git commit -m "feat(math): give Vec3 the arithmetic Vec2 already had

The homing cone needs subtraction, length, normalization and a dot product
in 3D; vec3.ts was the bare type plus a constructor. Mirrors vec2.ts's names
and its zero-length normalize convention.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Target selection

**Files:**
- Create: `src/domain/hub/character/homingTarget.ts`
- Test: `tests/domain/hub/character/homingTarget.test.ts` (create)

**Interfaces:**
- Consumes: `Vec3`, `sub`, `length`, `normalize`, `dot` from Task 1.
- Produces:
  - `interface HomingSelectionConfig { readonly homingRange: number; readonly homingConeHalfAngle: number }`
  - `selectHomingTarget(from: Vec3, cameraForward: Vec3, candidates: readonly Vec3[], config: HomingSelectionConfig): number | null`

The config is a **structural subset** of `MovementConfig`, declared here rather than imported from it, so this module depends on the two numbers it uses and not on the whole movement tuning object. `MovementConfig` will satisfy it by having those fields (Task 3).

- [ ] **Step 1: Write the failing test**

Create `tests/domain/hub/character/homingTarget.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectHomingTarget, type HomingSelectionConfig } from '../../../../src/domain/hub/character/homingTarget';
import { vec3, ZERO3 } from '../../../../src/domain/math/vec3';

// 35 degrees, the starting cone half-angle.
const C: HomingSelectionConfig = { homingRange: 12, homingConeHalfAngle: 0.6109 };
const AT_ORIGIN = ZERO3;
const FORWARD = vec3(0, 0, -1); // the scene is right-handed; the knight's default facing is -Z

describe('selectHomingTarget', () => {
  it('selects a candidate inside both the cone and the range', () => {
    expect(selectHomingTarget(AT_ORIGIN, FORWARD, [vec3(0, 0, -5)], C)).toBe(0);
  });

  it('rejects a candidate outside the cone', () => {
    // 90 degrees off the forward axis
    expect(selectHomingTarget(AT_ORIGIN, FORWARD, [vec3(5, 0, 0)], C)).toBeNull();
  });

  it('rejects a candidate beyond the range', () => {
    expect(selectHomingTarget(AT_ORIGIN, FORWARD, [vec3(0, 0, -20)], C)).toBeNull();
  });

  it('picks the nearest of several qualifying candidates', () => {
    const candidates = [vec3(0, 0, -9), vec3(0, 0, -3), vec3(0, 0, -6)];
    expect(selectHomingTarget(AT_ORIGIN, FORWARD, candidates, C)).toBe(1);
  });

  it('breaks an exact distance tie by lower index, so it is deterministic', () => {
    const candidates = [vec3(1, 0, -5), vec3(-1, 0, -5)];
    const first = selectHomingTarget(AT_ORIGIN, FORWARD, candidates, C);
    const second = selectHomingTarget(AT_ORIGIN, FORWARD, candidates, C);
    expect(first).toBe(0);
    expect(second).toBe(0);
  });

  it('returns null for an empty candidate list', () => {
    expect(selectHomingTarget(AT_ORIGIN, FORWARD, [], C)).toBeNull();
  });

  // A crystal can sit exactly where the player stands. The direction to it is zero-length, and
  // normalizing that is a divide by zero; the result must be a decision, never NaN.
  it('does not select a candidate coincident with the player, and returns no NaN', () => {
    const result = selectHomingTarget(AT_ORIGIN, FORWARD, [AT_ORIGIN], C);
    expect(result).toBeNull();
  });

  // The caller hands over a camera vector. If the function assumed it was unit length, a longer one
  // would inflate the dot product and silently widen the cone.
  it('normalizes cameraForward rather than assuming it is unit length', () => {
    const long = vec3(0, 0, -100);
    expect(selectHomingTarget(AT_ORIGIN, long, [vec3(5, 0, 0)], C)).toBeNull();
    expect(selectHomingTarget(AT_ORIGIN, long, [vec3(0, 0, -5)], C)).toBe(0);
  });

  // Vertical aim is the whole point for a climb: a crystal straight above must be selectable when
  // the camera looks up at it.
  it('selects a candidate above the player when the camera looks up', () => {
    expect(selectHomingTarget(AT_ORIGIN, vec3(0, 1, 0), [vec3(0, 6, 0)], C)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/domain/hub/character/homingTarget.test.ts`
Expected: FAIL — `Failed to resolve import ".../homingTarget"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/hub/character/homingTarget.ts`:

```ts
import { type Vec3, sub, length, normalize, dot } from '../../math/vec3';

/**
 * The two numbers selection needs. A structural subset of `MovementConfig`, declared here rather
 * than imported, so this module depends on what it reads and not on the whole movement tuning.
 */
export interface HomingSelectionConfig {
  /** Furthest a candidate may be, in world units. */
  readonly homingRange: number;
  /** Half the cone's opening angle, in radians, measured off `cameraForward`. */
  readonly homingConeHalfAngle: number;
}

/**
 * Picks which candidate a homing attack should fly to, or `null` for none.
 *
 * A candidate qualifies when it is within `homingRange` of `from` AND the direction from `from` to it
 * is within `homingConeHalfAngle` of `cameraForward`. Among those, the nearest wins; an exact tie
 * goes to the lower index so the result never depends on iteration luck.
 *
 * Returns an INDEX, not a position: the caller needs to know *which* crystal, for the trail and for
 * anything a level wants to attach to a specific anchor.
 *
 * `cameraForward` is normalized here rather than assumed unit-length — it comes from a camera, and a
 * non-unit vector would inflate the dot product and silently widen the cone.
 *
 * The cone is a true 3D test, not a planar one. A climb is vertical, so a crystal directly overhead
 * has to be selectable when the player looks up at it; flattening the comparison to X/Z the way
 * `followCamera.planarBasis()` does for locomotion would make exactly that shot impossible.
 */
export const selectHomingTarget = (
  from: Vec3,
  cameraForward: Vec3,
  candidates: readonly Vec3[],
  config: HomingSelectionConfig,
): number | null => {
  const aim = normalize(cameraForward);
  const minCos = Math.cos(config.homingConeHalfAngle);

  let best: number | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const offset = sub(candidates[i], from);
    const distance = length(offset);
    if (distance > config.homingRange) continue;
    // A candidate exactly at `from` normalizes to ZERO3, whose dot with `aim` is 0. That is below
    // any cos of a half-angle under 90 degrees, so it falls out here as "not in the cone" rather
    // than producing NaN — which is why this comparison is safe without a separate zero guard.
    if (dot(normalize(offset), aim) < minCos) continue;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/domain/hub/character/homingTarget.test.ts`
Expected: PASS, 9 tests.

Run: `pnpm test`
Expected: 25 files, 151 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/hub/character/homingTarget.ts tests/domain/hub/character/homingTarget.test.ts
git commit -m "feat(homing): cone-and-range target selection

Pure geometry, separate from kinematics. Returns an index so the caller
knows which crystal was hit. The cone is a true 3D test, not a planar one:
a climb is vertical, so a crystal overhead has to be selectable.

A candidate coincident with the player normalizes to ZERO3, whose dot with
the aim is 0 and therefore below any half-angle under 90 degrees -- it falls
out as 'not in the cone' rather than producing NaN.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The dash inside the movement domain

**Files:**
- Modify: `src/domain/hub/character/characterMotion.ts`
- Modify: `src/domain/hub/character/movementInput.ts`
- Modify: `src/domain/hub/character/movementConstants.ts`
- Modify: `src/domain/hub/character/movementConfig.ts`
- Modify: `src/domain/hub/character/characterMovement.ts`
- Test: `tests/domain/hub/character/homingMovement.test.ts` (create)

**Interfaces:**
- Consumes: `Vec3` arithmetic from Task 1.
- Produces:
  - `CharacterMotion.homing: HomingDash | null` where `interface HomingDash { readonly direction: Vec3; readonly remaining: number; readonly elapsed: number }`
  - `MovementInput.homingTarget: Vec3 | null`
  - `MovementConfig` gains `homingRange`, `homingConeHalfAngle`, `homingSpeed`, `homingBounceSpeed`, `homingMaxDuration`.

**THE AMBIGUITY THIS TASK RESOLVES — read before writing code.** The spec calls the input field
`homingTarget: Vec3 | null` without saying whether that `Vec3` is the crystal's world position or the
offset to it. It is **the offset**, the vector from the player to the crystal. The reason is that a
world position would force `step` to know where the player is, and it does not: `CharacterMotion` is
`{velocity, facing, isGrounded}`, and position belongs to the Havok controller. Adding position to the
domain would create a second source of truth for it. Presentation knows both points and can subtract.

A consequence worth stating: the dash direction is **fixed at entry** and not re-aimed each frame.
Targets are static and the dash lasts under a second, so course correction would be invisible — and
Sonic's own homing attack is a straight line to a locked target.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/hub/character/homingMovement.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { step } from '../../../../src/domain/hub/character/characterMovement';
import { DEFAULT_CONFIG as C } from '../../../../src/domain/hub/character/movementConfig';
import { NONE_INPUT, type MovementInput } from '../../../../src/domain/hub/character/movementInput';
import { IDLE, type CharacterMotion } from '../../../../src/domain/hub/character/characterMotion';
import { vec3 } from '../../../../src/domain/math/vec3';

const P = 6;
const AIRBORNE: CharacterMotion = { ...IDLE, isGrounded: false, velocity: vec3(0, -2, 0) };
const pressTowards = (offset: ReturnType<typeof vec3>): MovementInput => ({ ...NONE_INPUT, homingTarget: offset });

describe('homing dash', () => {
  it('does not start from the ground — the same press is an ordinary jump there', () => {
    const r = step(IDLE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    expect(r.homing).toBeNull();
  });

  it('starts when airborne and a target offset is supplied', () => {
    const r = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    expect(r.homing).not.toBeNull();
    expect(r.homing!.remaining).toBeLessThan(6);
  });

  it('travels at homingSpeed along the offset direction', () => {
    const r = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    expect(r.velocity.z).toBeCloseTo(-C.homingSpeed, P);
    expect(r.velocity.x).toBeCloseTo(0, P);
    expect(r.velocity.y).toBeCloseTo(0, P);
  });

  it('suspends gravity while dashing', () => {
    const dashing = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    const next = step(dashing, NONE_INPUT, C, 1 / 60);
    // A plain airborne frame would subtract gravity*dt from velocity.y; a dash must not.
    expect(next.velocity.y).toBeCloseTo(0, P);
  });

  it('ignores steering input while dashing', () => {
    const dashing = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    const steered = step(dashing, { ...NONE_INPUT, direction: NONE_INPUT.direction }, C, 1 / 60);
    expect(steered.velocity.z).toBeCloseTo(-C.homingSpeed, P);
  });

  it('bounces straight up on arrival and clears the dash', () => {
    // One frame long enough to cover the whole 6-unit offset.
    const r = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1);
    expect(r.homing).toBeNull();
    expect(r.velocity.y).toBeCloseTo(C.homingBounceSpeed, P);
    expect(r.velocity.x).toBeCloseTo(0, P);
    expect(r.velocity.z).toBeCloseTo(0, P);
    expect(r.isGrounded).toBe(false);
  });

  it('aborts at homingMaxDuration and lets gravity resume', () => {
    let m = step(AIRBORNE, pressTowards(vec3(0, 0, -1000)), C, 1 / 60);
    for (let i = 0; i < 200 && m.homing; i++) m = step(m, NONE_INPUT, C, 1 / 60);
    expect(m.homing).toBeNull();
    const falling = step(m, NONE_INPUT, C, 1 / 60);
    expect(falling.velocity.y).toBeLessThan(0);
  });

  it('cannot restart while already dashing', () => {
    const dashing = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1 / 60);
    const again = step(dashing, pressTowards(vec3(6, 0, 0)), C, 1 / 60);
    expect(again.velocity.x).toBeCloseTo(0, P);
    expect(again.velocity.z).toBeCloseTo(-C.homingSpeed, P);
  });

  it('can chain: after a bounce a new press starts a new dash', () => {
    const bounced = step(AIRBORNE, pressTowards(vec3(0, 0, -6)), C, 1);
    const again = step(bounced, pressTowards(vec3(0, 6, 0)), C, 1 / 60);
    expect(again.homing).not.toBeNull();
    expect(again.velocity.y).toBeCloseTo(C.homingSpeed, P);
  });

  it('does nothing when the press comes with no target', () => {
    const r = step(AIRBORNE, NONE_INPUT, C, 1 / 60);
    expect(r.homing).toBeNull();
    expect(r.velocity.y).toBeLessThan(0); // still just falling
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/domain/hub/character/homingMovement.test.ts`
Expected: FAIL — `homing` is not a property of `CharacterMotion`, `homingTarget` is not a property of `MovementInput`, and `C.homingSpeed` is undefined.

- [ ] **Step 3: Add the state, the input field and the constants**

In `src/domain/hub/character/characterMotion.ts`, add above `CharacterMotion`:

```ts
import { type Vec3 } from '../../math/vec3';

/**
 * An in-flight homing dash. `direction` is a unit vector fixed at entry — targets are static and the
 * dash lasts under a second, so re-aiming every frame would be invisible. `remaining` is the distance
 * left to cover, and `elapsed` is what the timeout in `characterMovement.step` reads.
 */
export interface HomingDash {
  readonly direction: Vec3;
  readonly remaining: number;
  readonly elapsed: number;
}
```

and add the field to the interface and to `IDLE`:

```ts
export interface CharacterMotion {
  readonly velocity: Vec3;
  readonly facing: Vec2;
  readonly isGrounded: boolean;
  /** Non-null only while a homing dash is in flight. */
  readonly homing: HomingDash | null;
}
```

`IDLE` gains `homing: null`.

In `src/domain/hub/character/movementInput.ts`:

```ts
export interface MovementInput {
  readonly direction: NormalizedPlanarDirection;
  readonly jumpRequested: boolean;
  /** Sprint modifier held. A state, not an edge — unlike `jumpRequested`. */
  readonly runRequested: boolean;
  /**
   * The OFFSET from the player to the crystal a homing dash should fly to, or null. Not a world
   * position: `step` does not know where the player is, and giving the domain a position would make
   * it a second source of truth for something the physics controller owns. Presentation knows both
   * points and subtracts. Non-null only on the frame the press is resolved to a target.
   */
  readonly homingTarget: Vec3 | null;
}
```

`NONE_INPUT` gains `homingTarget: null`.

In `src/domain/hub/character/movementConstants.ts`, extend the object and document each addition:

```ts
  /**
   * Homing attack. ALL FIVE ARE UNTUNED — these are derived starting points, and nobody has played
   * them. Tune live via `window.moveConfig` and record what they settle at.
   *
   * `homingSpeed` 24 is 3x `runSpeed`, so the dash reads as a dash rather than a fast run.
   * `homingBounceSpeed` 9 equals `jumpSpeed`, so a chain gains the height the player already has an
   * intuition for. `homingRange` 12 is three of the knight's jump apexes. `homingConeHalfAngle`
   * 0.61 rad is 35 degrees — wide enough to forgive a roughly-aimed camera, narrow enough that two
   * crystals at different headings stay distinguishable, which is the number route choice lives or
   * dies on. `homingMaxDuration` 0.6 s is the 0.5 s it takes to cross `homingRange` at `homingSpeed`
   * plus margin; it is a safety bound, not a feel knob (see characterMovement's dash branch).
   */
  homingRange: 12,
  homingConeHalfAngle: 0.6109,
  homingSpeed: 24,
  homingBounceSpeed: 9,
  homingMaxDuration: 0.6,
```

In `src/domain/hub/character/movementConfig.ts`, add the five fields to `MovementConfig` with `readonly … : number`, and a line pointing at `homingTarget.ts`'s `HomingSelectionConfig`, which `MovementConfig` structurally satisfies.

- [ ] **Step 4: Write the dash branch**

In `src/domain/hub/character/characterMovement.ts`, import the Vec3 helpers and add the branch at the top of `step`:

```ts
export const step = (
  motion: CharacterMotion,
  input: MovementInput,
  config: MovementConfig,
  delta: number,
): CharacterMotion => {
  const dash = motion.homing ?? enterHoming(motion, input);
  if (dash) return stepHoming(motion, dash, config, delta);

  const facing = nextFacing(motion, input, config, delta);
  const planar = nextPlanarVelocity(motion, input, config, delta, facing);
  const justJumped = motion.isGrounded && input.jumpRequested;
  const verticalSpeed = nextVerticalSpeed(motion, justJumped, config, delta);

  return {
    velocity: vec3(planar.x, verticalSpeed, planar.y),
    facing,
    isGrounded: motion.isGrounded && !justJumped,
    homing: null,
  };
};

/**
 * A press only becomes a dash in the air. On the ground the same button is an ordinary jump, which
 * the normal path below handles — so this returns null there and nothing else has to know.
 */
const enterHoming = (motion: CharacterMotion, input: MovementInput): HomingDash | null => {
  if (motion.isGrounded || input.homingTarget === null) return null;
  const distance = length3(input.homingTarget);
  if (distance === 0) return null; // coincident target: nothing to fly toward
  return { direction: normalize3(input.homingTarget), remaining: distance, elapsed: 0 };
};

/**
 * The dash frame. Gravity and steering are both suspended here — that is the whole reason this state
 * lives inside `step` rather than beside it, since three things `step` otherwise does unconditionally
 * become conditional.
 *
 * The timeout is not defensive polish. `step` emits a velocity but Havok applies it, and a dash whose
 * straight line crosses terrain never arrives: the controller pins the capsule to the wall while this
 * function keeps asking for `homingSpeed` toward a point it can never reach, gravity suspended, for
 * ever. Aborting is a normal outcome — a mistimed press near a wall should drop you, not trap you.
 */
const stepHoming = (
  motion: CharacterMotion, dash: HomingDash, config: MovementConfig, delta: number,
): CharacterMotion => {
  const elapsed = dash.elapsed + delta;
  if (elapsed >= config.homingMaxDuration) {
    return { velocity: ZERO3, facing: motion.facing, isGrounded: false, homing: null };
  }

  const travelled = config.homingSpeed * delta;
  if (travelled >= dash.remaining) {
    return {
      velocity: vec3(0, config.homingBounceSpeed, 0),
      facing: motion.facing,
      isGrounded: false,
      homing: null,
    };
  }

  return {
    velocity: scale3(dash.direction, config.homingSpeed),
    facing: motion.facing,
    isGrounded: false,
    homing: { direction: dash.direction, remaining: dash.remaining - travelled, elapsed },
  };
};
```

Import the Vec3 helpers under aliases so they do not collide with the Vec2 ones already imported in
this file:

```ts
import { vec3, ZERO3, length as length3, normalize as normalize3, scale as scale3 } from '../../math/vec3';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test tests/domain/hub/character/homingMovement.test.ts`
Expected: PASS, 10 tests.

Run: `pnpm test`
Expected: 26 files, 161 tests. **The existing movement tests must still pass unchanged** — if any fails, the dash branch is intercepting a case it should not, which is a real defect and not a test to adjust.

Run: `pnpm exec tsc --noEmit`
Expected: clean. Every construction of a `CharacterMotion` or `MovementInput` literal now needs the new fields; the compiler will name them.

- [ ] **Step 6: Commit**

```bash
git add src/domain/hub/character tests/domain/hub/character/homingMovement.test.ts
git commit -m "feat(homing): the dash, inside characterMovement.step

The homing state lives in step rather than in a module composed beside it,
because the alternative gives velocity two owners in one frame -- the mistake
groundContact.ts already exists to fix.

MovementInput.homingTarget is the OFFSET to the crystal, not its position:
step does not know where the player is, and putting position in the domain
would make it a second source of truth for something Havok owns.

The timeout is mandatory, not defensive. step emits a velocity but Havok
applies it, so a dash into terrain never arrives and would otherwise pin the
player to the wall with gravity suspended.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Crystals

**Files:**
- Create: `src/presentation/babylon/crystals.ts`
- Modify: `src/presentation/babylon/hubScene.ts`

**Interfaces:**
- Consumes: `rng` from `src/domain/math/rng.ts`, `terrainHeight` from `./terrainHeight`.
- Produces: `createCrystals(scene: Scene, spots: readonly CrystalSpot[]): Crystals`, where
  `interface CrystalSpot { readonly x: number; readonly y: number; readonly z: number }` and
  `interface Crystals { readonly positions: readonly Vec3[] }`.

No test file: this is presentation, verified in-browser per the repo's split (spec §10).

- [ ] **Step 1: Write the module**

Create `src/presentation/babylon/crystals.ts`:

```ts
import type { Scene } from '@babylonjs/core/scene';
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { type Vec3, vec3 } from '../../domain/math/vec3';

/** Half-height of a crystal, in world units. The knight is ~1.9 tall, so this reads as a held object. */
const CRYSTAL_SIZE = 0.45;

/**
 * Emissive tint. Bright and unlit so a crystal reads as a target from across the field rather than
 * as scenery — the same reasoning `scatter.ts` uses for its emissive floors, taken further because
 * this one is supposed to catch the eye.
 */
const CRYSTAL_EMISSIVE = new Color3(0.35, 0.75, 0.95);

export interface CrystalSpot { readonly x: number; readonly y: number; readonly z: number }

export interface Crystals {
  /** World positions, in the order given — the index `selectHomingTarget` returns indexes into. */
  readonly positions: readonly Vec3[];
}

/**
 * Places homing-attack crystals.
 *
 * Takes a `Scene` and reaches for nothing else in the hub: the tower mode will be a second Babylon
 * scene, and crystals are the one thing both it and the hub need. Writing it scene-agnostic on day
 * one is free and is the difference between reusing this and rewriting it.
 *
 * Polyhedron type 1 is an octahedron — two square pyramids base to base, which is a crystal shape
 * without a model, a texture, or anything entering Git LFS.
 */
export function createCrystals(scene: Scene, spots: readonly CrystalSpot[]): Crystals {
  const mat = new StandardMaterial('crystalMat', scene);
  mat.diffuseColor = new Color3(0.1, 0.3, 0.4);
  mat.emissiveColor = CRYSTAL_EMISSIVE;
  mat.specularColor = new Color3(0.6, 0.8, 0.9);

  const positions = spots.map((spot, i) => {
    const mesh = CreatePolyhedron(`crystal_${i}`, { type: 1, size: CRYSTAL_SIZE }, scene);
    mesh.position.set(spot.x, spot.y, spot.z);
    mesh.material = mat;
    mesh.isPickable = false;
    // Not registered with `shadows`: a crystal's shadow says nothing, and the frame measurement
    // (2026-08-25 shadow-quality spec) puts every caster at four extra draw calls across four cascades.
    return vec3(spot.x, spot.y, spot.z);
  });

  return { positions };
}
```

- [ ] **Step 2: Place test crystals in the hub**

In `src/presentation/babylon/hubScene.ts`, import and call it after `createGroundScatter`:

```ts
import { createCrystals } from './crystals';
```

```ts
  const crystals = createCrystals(scene, TEST_CRYSTALS);
```

and add the spot table above `createHubScene`, with the reasoning:

```ts
/**
 * Test crystals for the homing attack, placed by hand near spawn so the move can be exercised without
 * hunting for one. A rising diagonal line plus a cluster: the line is for chaining, the cluster is for
 * checking that the camera cone actually picks between neighbours rather than grabbing the nearest.
 *
 * These are a playground, not level design. The tower spec owns real placement.
 */
const TEST_CRYSTALS = [
  { x: 0, y: 3, z: -8 },
  { x: 0, y: 5.5, z: -13 },
  { x: 0, y: 8, z: -18 },
  { x: 3, y: 4, z: -10 },
  { x: -3, y: 4, z: -10 },
] as const;
```

- [ ] **Step 3: Typecheck and run the suite**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

Run: `pnpm test`
Expected: 161 passing, unchanged — this task adds no tests and must break none.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/babylon/crystals.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(homing): procedural crystals as homing anchors

An octahedron from CreatePolyhedron -- a crystal shape with no model, no
texture and nothing entering LFS, the same way scatter.ts's rocks are made.
Takes a Scene rather than reaching into the hub, because the tower will be a
second scene and crystals are the one thing both need.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the press to the domain

**Files:**
- Modify: `src/presentation/babylon/playerController.ts`
- Modify: `src/presentation/babylon/hubScene.ts`

**Interfaces:**
- Consumes: `selectHomingTarget` (Task 2), `MovementInput.homingTarget` (Task 3), `Crystals.positions` (Task 4).
- Produces: nothing new; `createPlayer` gains a `crystals` parameter.

- [ ] **Step 1: Give the player controller the crystals and the camera's true forward**

`createPlayer` gains a `crystals: Crystals` parameter, and `hubScene.ts` passes the value from Task 4.

Inside the per-frame update, where the `MovementInput` is currently assembled, resolve the press:

```ts
// The jump key is edge-triggered and consumed once. Airborne, it means "home"; grounded, it means
// "jump" — the domain decides which, but only one of the two can be true, so the same press feeds
// both fields and `step` reads whichever applies.
const pressed = input.consumeJump();
const homingTarget = pressed && player.airborne
  ? selectedOffset(root.getAbsolutePosition(), follow, crystals)
  : null;

const movementInput: MovementInput = {
  direction: planarDirectionFromInput(input.axis(), follow.planarBasis()),
  jumpRequested: pressed,
  runRequested: input.isRunHeld(),
  homingTarget,
};
```

and add the helper beside it:

```ts
/**
 * The offset from the player to the crystal the camera is aiming at, or null.
 *
 * The aim vector is the camera's TRUE 3D forward — `target - position` — and deliberately not
 * `follow.planarBasis().forward`, which is flattened to X/Z for locomotion. A climb is vertical: a
 * crystal directly overhead is exactly the shot a flattened aim can never take.
 */
const selectedOffset = (
  from: Vector3, follow: FollowCamera, crystals: Crystals,
): Vec3 | null => {
  const cam = follow.camera;
  const forward = cam.getTarget().subtract(cam.position);
  const index = selectHomingTarget(toVec3(from), toVec3(forward), crystals.positions, config);
  if (index === null) return null;
  const target = crystals.positions[index];
  return vec3(target.x - from.x, target.y - from.y, target.z - from.z);
};
```

`config` is the same live `MovementConfig` object the rest of the controller uses, so
`window.moveConfig` tuning reaches the cone and the range immediately.

- [ ] **Step 2: Typecheck and run the suite**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

Run: `pnpm test`
Expected: 161 passing.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/babylon/playerController.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(homing): resolve the press against the camera cone

The jump key does double duty -- grounded it jumps, airborne it homes -- so
one press feeds both input fields and the domain reads whichever applies.

The aim vector is the camera's true 3D forward, not planarBasis().forward:
that one is flattened to X/Z for locomotion, and a crystal directly overhead
is exactly the shot a flattened aim can never take.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The knight's dash pose, bounce seam and trail

**Files:**
- Modify: `src/presentation/babylon/knight.ts`

**Interfaces:**
- Consumes: `Player.motion.homing` (Task 3).
- Produces: nothing new.

- [ ] **Step 1: Spin during the dash**

`driveKnightAnimation` polls a `KnightMotionSample`. Extend that sample with `homing: boolean`, sourced
in `hubScene.ts` from `player.motion.homing !== null`.

While `homing` is true, roll the knight's model about its own forward axis at a fixed rate, and reset
the roll to zero when it ends. This is the placeholder Task 8 replaces:

```ts
/**
 * Placeholder dash pose: a fast roll about the model's own axis. Sonic curls into a ball for this
 * move; the knight cannot, but a spin is a legible "this is not a jump" signal and costs no asset.
 * Task 8 replaces it with the Flying Kick clip; when it does, delete this and the roll reset.
 */
const DASH_SPIN_RATE = 18; // rad/s
```

- [ ] **Step 2: Start the bounce from the measured seam**

When `homing` goes from true to false **and** the vertical velocity is positive (a bounce, not a
timeout), restart the jump clip at the seam this file already measured — **0.76 s**, where the hip
curve passes back through standing and the rise begins.

Do not start it at the clip's head. The reason is recorded in this file's jump-segment doc comment:
the airborne segment already begins at 0.72 s deliberately, past the anticipation crouch, because the
game's jump is instantaneous and a wind-up played after the capsule has left the ground reads as the
knight hanging in mid-air still winding up (0.2 s of it, measured). A bounce is the same situation.

- [ ] **Step 3: Add the trail**

`TrailMesh` from `@babylonjs/core/Meshes/trailMesh`, attached to the knight's root, blue and emissive,
started when the dash starts and stopped at the bounce or the timeout.

```ts
import { TrailMesh } from '@babylonjs/core/Meshes/trailMesh';
```

- [ ] **Step 4: Typecheck and run the suite**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

Run: `pnpm test`
Expected: 161 passing.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/babylon/knight.ts src/presentation/babylon/hubScene.ts
git commit -m "feat(homing): dash pose, bounce seam and trail

The bounce restarts the jump clip at 0.76s -- the seam this file already
measured off the hip curve, where the rise begins -- for the same reason the
airborne segment starts at 0.72s: a wind-up played after the capsule has left
the ground reads as the knight hanging in mid-air still winding up.

The dash pose is a placeholder spin, deleted when the Flying Kick clip lands.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Play it, and tune the five constants

**Files:**
- Modify: `src/domain/hub/character/movementConstants.ts` (the values, and their Untuned markings)
- Modify: `docs/superpowers/specs/2026-09-05-homing-attack-design.md` (§7, record what they settled at)

This task is the point of the phase. The five constants are derived guesses; none is a measurement
until someone has played it.

- [ ] **Step 1: Run it with the Browser pane displayed**

Start the dev server with `preview_start` (config `dev`) and **make sure the pane is displayed** — a
hidden pane stops compositing *and* rAF, so nothing animates and screenshots time out. Dismiss the AVG
intro from the console: `document.querySelector('[aria-label="advance dialogue"]').click()`, then
`document.querySelector('.choice').click()`.

- [ ] **Step 2: Check the move works at all**

Jump toward the crystal at `(0, 3, -8)` and press jump again in the air. Expect: the knight dashes to
it, spins on the way, trails blue, and pops upward at the crystal.

- [ ] **Step 3: Tune, in this order**

1. **`homingRange` and `homingConeHalfAngle`** first — they decide whether the move triggers when the
   player expects it to. Aim at one crystal of the `(±3, 4, -10)` pair and check the *other* is not
   taken; that pair exists to test exactly this.
2. **`homingSpeed`** — the dash should read as decisive, not as teleporting.
3. **`homingBounceSpeed`** — the height that makes the `(0, 3, -8) → (0, 5.5, -13) → (0, 8, -18)`
   line chainable. This is the number the tower's spacing will be derived from, so it matters most.
4. **`homingMaxDuration`** last, and only if a dash into a tree feels wrong: it is a safety bound, not
   a feel knob.

`window.moveConfig` is live — mutate it in the console and the next frame uses it.

- [ ] **Step 4: Check the failure paths**

- Press with the camera on empty sky: nothing happens, and the knight keeps falling.
- Dash at a crystal with a tree in the way: the knight stops at the tree, and after the timeout falls
  normally rather than hanging.
- Press while grounded: an ordinary jump.

- [ ] **Step 5: Record the values**

Update each constant's doc comment with what it settled at, and **remove the Untuned marking only from
the ones actually tuned**. Any constant left at its derived value keeps its marking — this repo treats
a constant claiming a tuning that did not happen as a defect.

Update spec §7 with the same values and a one-line note on what each one was chosen against.

- [ ] **Step 6: Commit**

```bash
git add src/domain/hub/character/movementConstants.ts docs/superpowers/specs/2026-09-05-homing-attack-design.md
git commit -m "tune(homing): the five constants, against the running scene

Records what each settled at and what it was judged against. Constants still
at their derived values keep their Untuned marking.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The Flying Kick clip

**Files:**
- Create: `__prototype__/Assets/Animations/FlyingKick.fbx` (from `~/Downloads/Flying Kick.fbx`)
- Create: `__prototype__/Assets/Animations/FlyingKick.fbx.import`
- Modify: `__prototype__/tools/extract_anims.gd` (`SRC`, `NON_LOOPING`)
- Modify: `public/models/knight_web.glb` (regenerated)
- Modify: `src/presentation/babylon/knight.ts` (fifth clip, guard, cache-buster, delete the spin)
- Modify: `README.md` (if the regenerated GLB's scalars come out clean, see Step 6)

**This task is sequenced last and blocks nothing.** If it fails, Task 6's placeholder spin ships and
this becomes its own piece of work. That is a real outcome, not a formality — the pipeline has
documented traps and the GLB regeneration touches a known defect class.

- [ ] **Step 1: Stage the FBX under the repo's naming convention**

```bash
cp ~/Downloads/"Flying Kick.fbx" __prototype__/Assets/Animations/FlyingKick.fbx
```

The space is dropped to match `Idle.fbx` / `Jump.fbx` / `Running.fbx` / `Walking.fbx`. `.gitattributes`
tracks `*.fbx` in LFS, so it lands there without further action.

- [ ] **Step 2: Let Godot write a default .import, then give it the bone map**

Godot is not on PATH; the console build is the one that prints headless output:

```bash
GODOT="C:/Users/sinma/AppData/Local/Microsoft/WinGet/Packages/GodotEngine.GodotEngine.Mono_Microsoft.Winget.Source_8wekyb3d8bbwe/Godot_v4.7.2-stable_mono_windows_arm64/Godot_v4.7.2-stable_mono_windows_arm64_console.exe"
"$GODOT" --headless --path __prototype__ --import
```

Then copy the `_subresources` bone_map block out of `Walking.fbx.import` into `FlyingKick.fbx.import`.
Without it the retarget's bone renaming does not apply, and it fails **silently** — the clip imports,
it just animates nothing.

**If a clip's source or `.import` changed, delete `.godot/imported/FlyingKick.fbx-*` first.** Godot
serves a stale import otherwise, which is the same silent failure wearing a different hat. This is the
README's step 0 and it exists because it has bitten this project before.

- [ ] **Step 3: Register the clip**

In `__prototype__/tools/extract_anims.gd`, add `FlyingKick` to `SRC`, and add it to `NON_LOOPING`
(which currently holds only `"Jump"`) — a flying kick is a one-shot, and looping it would make the
knight kick repeatedly for the whole dash.

- [ ] **Step 4: Rebuild the library and the GLB**

```bash
GODOT="C:/Users/sinma/AppData/Local/Microsoft/WinGet/Packages/GodotEngine.GodotEngine.Mono_Microsoft.Winget.Source_8wekyb3d8bbwe/Godot_v4.7.2-stable_mono_windows_arm64/Godot_v4.7.2-stable_mono_windows_arm64_console.exe"
"$GODOT" --headless --path __prototype__ --script res://tools/extract_anims.gd
"$GODOT" --headless --path __prototype__ --script res://tools/export_web_glb.gd
```

Then the texture-only optimization — **do not simplify, quantize or resample; it corrupts the skeletal
animation**:

```bash
gltf-transform resize __prototype__/knight_web.glb /tmp/k.glb --width 1024 --height 1024
gltf-transform webp /tmp/k.glb public/models/knight_web.glb --quality 80
```

`pnpm dlx @gltf-transform/cli` **fails on Windows** — pnpm's hard-linked store breaks its peer
resolution. Install `@gltf-transform/cli@4.4.2` into a scratch directory with an
`overrides: { "sharp": "0.34.5" }` pin; the transitive `sharp@0.35.x` throws
`colourspace: parameter space not set` on the 8192² source textures.

- [ ] **Step 5: Check every scalar against its glTF spec default**

**This is the step the README says not to skip.** The `gltf-transform` pass writes default-valued
scalars as `0` instead of omitting them. Three shipped that way and `knight.ts` still carries
load-time corrections: `normalTexture.scale` (0 zeroes the armour's normal map), `emissiveStrength`
(0 zeroes the face emissive), and `metallicFactor` (0, currently benign only because no
`roughnessFactor` ships alongside it).

Read the regenerated GLB's JSON chunk and compare **every** scalar against its spec default — not just
those three. The defect is a systematic property of the export pass, not three coincidences.

- [ ] **Step 6: Drop the corrections if, and only if, they are now dead**

If the regenerated GLB ships correct defaults (or omits the keys), delete the matching load-time
corrections in `knight.ts` and the README paragraph that documents them. A guard for a defect that no
longer exists is a lie about the asset.

If the defect persists, keep the corrections and say so in the commit — that is information, not
failure.

- [ ] **Step 7: Wire the clip**

In `knight.ts`: add the fifth `byName(/kick/i)` lookup, **add its name to the guard's error message**
(otherwise a future missing clip reports the wrong list), bump the `?v=N` cache-buster on the GLB URL
so browsers refetch, play the clip during the dash, and **delete the placeholder spin from Task 6**
along with its roll reset.

- [ ] **Step 8: Verify in the browser and commit**

Run `pnpm exec tsc --noEmit` and `pnpm test` (161 passing), then watch a dash in the running scene:
the kick plays once, does not loop, and the bounce still picks up at the 0.76 s jump seam.

```bash
git add __prototype__ public/models/knight_web.glb src/presentation/babylon/knight.ts README.md
git commit -m "feat(homing): the flying kick clip

Adds FlyingKick through the Godot retarget pipeline, as a NON_LOOPING
one-shot, and replaces Task 6's placeholder spin.

Records what the regenerated GLB's scalars came out as against their glTF
spec defaults -- the gltf-transform pass writes defaults as 0, and knight.ts
carries load-time corrections for three of them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Fix the dead-code timeout — live offset, not dead reckoning

**Files:**
- Modify: `src/domain/hub/character/characterMotion.ts` (`HomingDash` doc comment)
- Modify: `src/domain/hub/character/characterMovement.ts` (`step`, `stepHoming`)
- Modify: `src/presentation/babylon/playerController.ts` (`homingCrystal` lock, live offset)
- Modify: `tests/domain/hub/character/homingMovement.test.ts`
- Modify: `docs/superpowers/specs/2026-09-05-homing-attack-design.md` (§4, §5)

**Not in the original plan.** Task 7's browser pass (at `d3b64cb`) found that `homingMaxDuration`'s
abort branch could never fire: `enterHoming` fixed `HomingDash.direction` at entry and `stepHoming`
decremented `remaining` by `homingSpeed * delta` every frame, regardless of whether the capsule had
actually moved. Since a selectable target is always within `homingRange` (12), that dead-reckoned
distance always hit zero within `homingRange / homingSpeed` = 0.5s, strictly before `homingMaxDuration`'s
0.6s — a dash blocked by terrain "arrived" and bounced off the obstacle instead of timing out, which
contradicts §5's claim that the bound is mandatory. This task is that fix, added after Task 8 landed
and reviewed on its own (commit `05f1923`) because it changes an input contract Tasks 3 and 5 already
passed review on.

**Interfaces:**
- Changes: `HomingDash` narrows from `{direction, remaining, elapsed}` to `{elapsed}` — direction and
  remaining are no longer carried on the domain's returned state, only derived internally each frame.
- Changes: `characterMovement.step` no longer builds a `HomingDash` before dashing; it calls
  `stepHoming(motion, elapsedSoFar, input.homingTarget, config, delta)` whether entering
  (`elapsedSoFar = 0`) or continuing (`elapsedSoFar = motion.homing.elapsed`), and `stepHoming` derives
  both `direction` and `remaining` fresh from the offset argument every frame.
- Changes: `playerController.ts` holds a `homingCrystal: number | null` closure variable across frames
  for as long as `player.motion.homing` is non-null, and recomputes the LIVE offset from the player's
  current position to that same crystal every frame the dash is in flight — not only on the press
  frame — feeding it into `MovementInput.homingTarget`.

- [ ] **Step 1: Update the failing/changed tests first**

In `tests/domain/hub/character/homingMovement.test.ts`: a dash whose supplied offset stops shrinking
(frozen, simulating a capsule pinned against a wall) must now time out rather than arrive; an offset
that keeps shrinking must still arrive and bounce, unchanged; a `null` offset mid-dash must end the
dash safely rather than continue on stale data; a changed offset frame-to-frame must steer the dash
(course correction) without resetting `elapsed`. `suspends gravity while dashing` and
`ignores steering input while dashing` must feed the continuing frame a live (shrinking) offset instead
of `NONE_INPUT`, since `NONE_INPUT`'s null `homingTarget` now legitimately ends the dash.
`cannot restart while already dashing` — which asserted a fixed entry direction ignores a second
offset — is replaced with `does not restart the dash from scratch when the live offset changes frame to
frame`, since the old assertion is false by design once the dash is genuinely homing.

- [ ] **Step 2: Narrow `HomingDash` and rewrite `stepHoming`**

`characterMotion.ts`'s `HomingDash` keeps only `elapsed`. `characterMovement.ts`'s `stepHoming` takes
`(motion, elapsedSoFar, offset, config, delta)`: a `null` offset ends the dash exactly like a timeout;
otherwise `remaining = length3(offset)` and `direction = normalize3(offset)` are computed fresh, arrival
is still checked before the timeout (arriving should beat a timeout landing on the same frame), and only
`elapsed` is carried onto the returned `homing`.

- [ ] **Step 3: Supply the live offset from presentation**

`playerController.ts`: lock `homingCrystal` on a fresh press exactly as before, but stop computing the
offset once at entry — recompute `homingOffset(root.getAbsolutePosition(), crystals, homingCrystal)`
every frame the dash is in flight and pass that into `MovementInput.homingTarget` each frame, not only
the press frame.

- [ ] **Step 4: Update the spec**

§4 and §5 of `docs/superpowers/specs/2026-09-05-homing-attack-design.md`: describe the live-offset
mechanism as shipped, not as a proposed follow-up. §7 (Task 7's historical measurement log) is left
untouched here — it is an accurate record of what Task 7 found at the time, not a spec of current
behaviour — but see the final-review fix wave for why it needed its own pass once §5 and §7 started
disagreeing.

- [ ] **Step 5: Typecheck and run the suite**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

Run: `pnpm test`
Expected: 26 files, 166 tests (163 + 3 net new: the previously-impossible blocked-dash case, the
null-offset-mid-dash case, and the course-correction case).

- [ ] **Step 6: Commit**

```bash
git add src/domain/hub/character/characterMotion.ts src/domain/hub/character/characterMovement.ts \
  src/presentation/babylon/playerController.ts tests/domain/hub/character/homingMovement.test.ts \
  docs/superpowers/specs/2026-09-05-homing-attack-design.md
git commit -m "fix(homing): make remaining track a live offset, not dead reckoning

homingMaxDuration's abort branch could never fire: remaining was dead-
reckoned from homingSpeed * delta regardless of whether the capsule had
actually moved, so a dash blocked by terrain always 'arrived' within 0.5s,
strictly before the 0.6s timeout. stepHoming now derives direction and
remaining from a live offset presentation supplies every frame instead of
carrying a fixed entry direction forward, so a dash a wall has actually
stopped has an offset that stops shrinking too -- and, as a side effect,
the dash now genuinely corrects course toward its target each frame.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage.** §2's settled decisions → Tasks 3 (bounce, trigger, no-air-dash), 4 (crystals
persist, procedural). §3 selection → Task 2, every listed case including the coincident target and the
non-unit `cameraForward`. §4 the dash → Task 3. §5 the timeout → Task 3, with its own test. §6
chaining without a counter → Task 3's chain test. §7 constants → Task 3 creates them Untuned, Task 7
tunes them. §8 presentation table → Tasks 4, 5, 6; `TrailMesh` and the 0.76 s seam both in Task 6.
§9 the clip → Task 8, including the scalar check and the guard message. §10 testing → domain tests in
Tasks 1–3, the browser gate in Task 7. §11 out of scope → nothing here builds any of it.

**Type consistency.** `selectHomingTarget(from, cameraForward, candidates, config) → number | null` is
defined in Task 2 and called with exactly those four arguments in Task 5. `HomingDash` is defined in
Task 3 as `{direction, remaining, elapsed}`, and **Task 9 narrows it to `{elapsed}` alone**, which is
what ships: `direction` and `remaining` become per-frame derivations inside `stepHoming` rather than
carried state, leaving `motion.homing !== null` (Tasks 5 and 6) and `motion.homing.elapsed` (Task 3's
`step`) as the only reads anywhere. This paragraph was written when the plan had eight tasks and is
the one place the ninth's interface change had to be carried back to, since certifying the types is
its whole job.
`MovementInput.homingTarget` is a `Vec3 | null` offset everywhere it appears. `Crystals.positions` is
produced in Task 4 and indexed in Task 5 by the index Task 2 returns. The Vec3 helpers are imported
under `length3` / `normalize3` / `scale3` aliases in `characterMovement.ts` because that file already
imports the Vec2 functions under the bare names.

**Two things this plan decides that the spec left open, both recorded rather than absorbed:**

1. **`homingTarget` is an offset, not a position.** The spec's §4 gives the field a `Vec3` without
   saying which. A position would force `step` to know where the player is, which it does not and
   should not — position belongs to the Havok controller, and duplicating it into the domain would
   create a second source of truth. The cost was taken to be that the dash direction is fixed at entry
   rather than re-aimed each frame — an offset is only true of the frame it was measured on — and it
   was accepted because targets are static and the dash is under a second. **Task 9 removed that cost
   rather than paying it**: presentation re-supplies the live offset every frame (`playerController`
   holds the locked crystal precisely so it can), `stepHoming` re-derives direction and remaining
   distance from it, and the dash corrects course continuously. What the decision costs in the end is
   the obligation that puts on the caller: a dead-reckoned or stale offset aims the dash at where the
   crystal used to be relative to the player, and the domain has no position of its own to notice
   with. That same obligation is what makes the timeout reachable — a dash a wall has stopped is one
   whose offset stops shrinking — which is why Task 9 exists at all.
2. **The camera's aim is its true 3D forward, not `planarBasis().forward`.** The spec says "the
   camera's forward direction" and the codebase's existing forward helper is flattened to X/Z for
   locomotion. For a climb the vertical component is the whole point, so Task 5 computes
   `target - position` instead. Task 2's test suite pins this with a look-up case.
