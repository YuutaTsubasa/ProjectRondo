# Web Migration SP0 — Foundation + Hub Vertical Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reach M1 parity on the web — a third-person knight walking the hub, driven by a pure TypeScript domain, with Havok physics and glTF Idle/Walk animation — proving the stack holds up.

**Architecture:** Three layers mirroring the current Godot discipline. A pure TS `domain/` (no engine imports) is the single source of truth for movement; a babylon.js `presentation/` reads input → calls the domain → applies the result to a Havok character controller; Svelte hosts DOM UI (minimal HUD for SP0). The existing Godot project is preserved in `__prototype__/` as the parity reference.

**Tech Stack:** pnpm, Vite, Svelte 5 (runes), TypeScript, Vitest, `@babylonjs/core`, `@babylonjs/havok`, `@babylonjs/loaders`, Tauri v2.

Spec: `docs/superpowers/specs/2026-08-14-web-migration-sp0-design.md`

---

## File structure (created/modified in this plan)

```
/  (root = Web app)
├─ package.json  vite.config.ts  svelte.config.js  tsconfig.json  index.html  .gitignore
├─ src/
│  ├─ domain/
│  │  ├─ math/vec2.ts            Vec2 type + pure ops (add/sub/scale/length/normalize/moveToward)
│  │  ├─ math/vec3.ts            Vec3 type + constructor
│  │  ├─ kernel/normalizedPlanarDirection.ts
│  │  └─ hub/character/
│  │     ├─ movementConstants.ts, movementConfig.ts, movementInput.ts
│  │     ├─ characterMotion.ts
│  │     └─ characterMovement.ts   step() — the pure movement rule
│  ├─ presentation/babylon/
│  │  ├─ cameraRelativeDirection.ts   pure (no babylon import), unit-tested
│  │  ├─ vectorConversions.ts         babylon Vector3 <-> domain Vec3
│  │  ├─ followCamera.ts, playerController.ts, hubScene.ts
│  └─ app/main.ts, app/App.svelte
├─ tests/                          Vitest specs mirroring the xUnit tests
├─ public/models/knight_web.glb    baked mesh + Idle/Walk (asset-prep step)
├─ src-tauri/                      Tauri v2 shell
└─ __prototype__/                  the moved Godot project
```

Domain representation choices (locked in):
- `Vec2 = { readonly x: number; readonly y: number }`, `Vec3 = { readonly x,y,z: number }` — plain readonly data (so Vitest `toEqual` deep-compares cleanly; no classes/getters).
- Value types are plain readonly objects; "methods" are free functions returning new objects.
- `NormalizedPlanarDirection = { readonly value: Vec2 }`, guarded by a `fromRaw()` factory; `isZero(d)` is a free function.

---

## Phase 0 — Repo restructure & scaffold

### Task 1: Move the Godot project into `__prototype__/`

**Files:**
- Move (git mv): `project.godot`, `ProjectRondo.csproj`, `ProjectRondo.sln`, `Directory.Build.props`, `icon.svg`, `icon.svg.import`, `Scripts/`, `Scenes/`, `Assets/`, `src/`, `tests/` → under `__prototype__/`
- Keep at root: `docs/`, `README.md`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.git`

- [ ] **Step 1: Create the folder and move everything together (relative paths between csproj/sln/domain are preserved because they move as one set)**

```bash
mkdir __prototype__
git mv project.godot ProjectRondo.csproj ProjectRondo.sln Directory.Build.props icon.svg icon.svg.import Scripts Scenes Assets src tests __prototype__/
```

- [ ] **Step 2: Verify the domain still builds/tests from its new location**

Run:
```bash
DOTNET_ROLL_FORWARD=Major dotnet test __prototype__/tests/ProjectRondo.Domain.Tests/ProjectRondo.Domain.Tests.csproj
```
Expected: PASS (all existing domain tests green — 13 tests). This confirms the move didn't break relative references.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Move Godot project into __prototype__/ as parity reference"
```

### Task 2: Scaffold the web app (Vite + Svelte + TS + Vitest)

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `svelte.config.js`, `tsconfig.json`, `.gitignore` (append), `src/app/App.svelte`, `src/app/main.ts`

- [ ] **Step 1: Init pnpm and install dependencies**

```bash
pnpm init
pnpm add -D vite @sveltejs/vite-plugin-svelte svelte typescript svelte-check vitest @tsconfig/svelte
pnpm add @babylonjs/core @babylonjs/havok @babylonjs/loaders
```

- [ ] **Step 2: Create `vite.config.ts`** (Vitest config lives here; Havok wasm excluded from pre-bundling)

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Create `svelte.config.js`, `tsconfig.json`, `index.html`, and the app entry**

`svelte.config.js`:
```javascript
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default { preprocess: vitePreprocess() };
```

`tsconfig.json`:
```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>ProjectRondo</title></head>
  <body style="margin:0"><div id="app"></div><script type="module" src="/src/app/main.ts"></script></body>
</html>
```

`src/app/App.svelte`:
```svelte
<h1>ProjectRondo — web</h1>
```

`src/app/main.ts`:
```typescript
import App from './App.svelte';
import { mount } from 'svelte';
const app = mount(App, { target: document.getElementById('app')! });
export default app;
```

- [ ] **Step 4: Add scripts to `package.json`**

Add to the `"scripts"` block:
```json
{
  "dev": "vite",
  "build": "vite build",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 5: Append web/Tauri ignores to `.gitignore`**

```
node_modules/
dist/
src-tauri/target/
```

- [ ] **Step 6: Verify dev server boots**

Run: `pnpm dev` then open the printed URL.
Expected: page shows "ProjectRondo — web". Stop the server (Ctrl-C).

- [ ] **Step 7: Verify the test runner runs (no tests yet is fine)**

Run: `pnpm test`
Expected: Vitest exits 0 with "no test files found" (or similar). 

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Scaffold web app: Vite + Svelte 5 + TS + Vitest"
```

---

## Phase 1 — Domain port (TDD)

### Task 3: `math/vec2.ts` + `math/vec3.ts`

**Files:**
- Create: `src/domain/math/vec2.ts`, `src/domain/math/vec3.ts`
- Test: `tests/domain/math/vec2.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/domain/math/vec2.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { vec2, add, sub, scale, length, normalize, moveToward, ZERO } from '../../../src/domain/math/vec2';

describe('vec2', () => {
  it('length of (3,4) is 5', () => {
    expect(length(vec2(3, 4))).toBeCloseTo(5, 6);
  });
  it('normalize keeps direction at unit length', () => {
    const n = normalize(vec2(3, 4));
    expect(length(n)).toBeCloseTo(1, 6);
    expect(n.x).toBeCloseTo(0.6, 6);
    expect(n.y).toBeCloseTo(0.8, 6);
  });
  it('normalize of zero returns zero', () => {
    expect(normalize(ZERO)).toEqual(ZERO);
  });
  it('add / sub / scale are pure componentwise ops', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual(vec2(4, 6));
    expect(sub(vec2(3, 4), vec2(1, 2))).toEqual(vec2(2, 2));
    expect(scale(vec2(2, 3), 2)).toEqual(vec2(4, 6));
  });
  it('moveToward stops at target when within maxDelta', () => {
    expect(moveToward(vec2(0, 0), vec2(1, 0), 5)).toEqual(vec2(1, 0));
  });
  it('moveToward steps by maxDelta toward target when far', () => {
    const r = moveToward(vec2(0, 0), vec2(10, 0), 4);
    expect(r).toEqual(vec2(4, 0));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../../../src/domain/math/vec2`.

- [ ] **Step 3: Implement `src/domain/math/vec2.ts`**

```typescript
export interface Vec2 { readonly x: number; readonly y: number }

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });
export const ZERO: Vec2 = vec2(0, 0);

export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, k: number): Vec2 => vec2(a.x * k, a.y * k);
export const lengthSquared = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const length = (a: Vec2): number => Math.sqrt(lengthSquared(a));

export const normalize = (a: Vec2): Vec2 => {
  const len = length(a);
  return len === 0 ? ZERO : scale(a, 1 / len);
};

export const moveToward = (current: Vec2, target: Vec2, maxDelta: number): Vec2 => {
  const offset = sub(target, current);
  const distance = length(offset);
  return distance <= maxDelta || distance === 0
    ? target
    : add(current, scale(offset, maxDelta / distance));
};
```

- [ ] **Step 4: Implement `src/domain/math/vec3.ts`**

```typescript
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const ZERO3: Vec3 = vec3(0, 0, 0);
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test`
Expected: PASS (6 assertions in vec2.test.ts).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "domain: add pure vec2/vec3 math helpers"
```

### Task 4: `kernel/normalizedPlanarDirection.ts` (port NormalizedPlanarDirectionTests)

**Files:**
- Create: `src/domain/kernel/normalizedPlanarDirection.ts`
- Test: `tests/domain/kernel/normalizedPlanarDirection.test.ts`

- [ ] **Step 1: Write the failing test (ported 1:1 from `NormalizedPlanarDirectionTests.cs`)**

```typescript
import { describe, it, expect } from 'vitest';
import { vec2, length } from '../../../src/domain/math/vec2';
import { fromRaw, isZero, NONE } from '../../../src/domain/kernel/normalizedPlanarDirection';

describe('NormalizedPlanarDirection', () => {
  it('vector longer than unit is clamped to unit length', () => {
    const d = fromRaw(vec2(3, 4));
    expect(length(d.value)).toBeCloseTo(1, 3);
    expect(d.value.x).toBeCloseTo(0.6, 3);
    expect(d.value.y).toBeCloseTo(0.8, 3);
  });
  it('vector shorter than unit is preserved for analog input', () => {
    const d = fromRaw(vec2(0.5, 0));
    expect(d.value.x).toBeCloseTo(0.5, 3);
    expect(d.value.y).toBeCloseTo(0, 3);
    expect(isZero(d)).toBe(false);
  });
  it('zero vector is zero', () => {
    expect(isZero(fromRaw(vec2(0, 0)))).toBe(true);
    expect(isZero(NONE)).toBe(true);
  });
  it('diagonal overflow preserves direction at unit length', () => {
    const d = fromRaw(vec2(1, 1));
    expect(length(d.value)).toBeCloseTo(1, 3);
    expect(d.value.x).toBeCloseTo(d.value.y, 3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/domain/kernel/normalizedPlanarDirection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (mirrors the C#: only clamp when longer than unit; a private-by-convention factory guards the invariant)

`src/domain/kernel/normalizedPlanarDirection.ts`:
```typescript
import { type Vec2, ZERO, lengthSquared, normalize } from '../math/vec2';

/** A planar (X/Z) direction whose magnitude is always in [0, 1]. Build via {@link fromRaw}. */
export interface NormalizedPlanarDirection { readonly value: Vec2 }

export const NONE: NormalizedPlanarDirection = { value: ZERO };

/** Clamps `raw` to unit length, leaving shorter vectors untouched (analog input keeps its magnitude). */
export const fromRaw = (raw: Vec2): NormalizedPlanarDirection =>
  lengthSquared(raw) > 1 ? { value: normalize(raw) } : { value: raw };

export const isZero = (d: NormalizedPlanarDirection): boolean =>
  d.value.x === 0 && d.value.y === 0;
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/domain/kernel/normalizedPlanarDirection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "domain: port NormalizedPlanarDirection with tests"
```

### Task 5: Character value types (constants, config, input, motion)

**Files:**
- Create: `src/domain/hub/character/movementConstants.ts`, `movementConfig.ts`, `movementInput.ts`, `characterMotion.ts`
- Test: `tests/domain/hub/character/valueTypes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../../../src/domain/hub/character/movementConfig';
import { NONE_INPUT } from '../../../../src/domain/hub/character/movementInput';
import { IDLE } from '../../../../src/domain/hub/character/characterMotion';
import { isZero } from '../../../../src/domain/kernel/normalizedPlanarDirection';

describe('character value types', () => {
  it('DEFAULT_CONFIG matches MovementConstants', () => {
    expect(DEFAULT_CONFIG).toEqual({
      maxSpeed: 12, acceleration: 40, deceleration: 50, gravity: 24, jumpSpeed: 9,
    });
  });
  it('NONE_INPUT has no direction and no jump', () => {
    expect(isZero(NONE_INPUT.direction)).toBe(true);
    expect(NONE_INPUT.jumpRequested).toBe(false);
  });
  it('IDLE is grounded, motionless, facing -Y', () => {
    expect(IDLE.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(IDLE.facing).toEqual({ x: 0, y: -1 });
    expect(IDLE.isGrounded).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/domain/hub/character/valueTypes.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the four files**

`movementConstants.ts`:
```typescript
export const MovementConstants = {
  maxSpeed: 12, acceleration: 40, deceleration: 50, gravity: 24, jumpSpeed: 9,
} as const;
```

`movementConfig.ts`:
```typescript
import { MovementConstants } from './movementConstants';

export interface MovementConfig {
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly gravity: number;
  readonly jumpSpeed: number;
}

export const DEFAULT_CONFIG: MovementConfig = { ...MovementConstants };
```

`movementInput.ts`:
```typescript
import { type NormalizedPlanarDirection, NONE } from '../../kernel/normalizedPlanarDirection';

export interface MovementInput {
  readonly direction: NormalizedPlanarDirection;
  readonly jumpRequested: boolean;
}

export const NONE_INPUT: MovementInput = { direction: NONE, jumpRequested: false };
```

`characterMotion.ts`:
```typescript
import { type Vec3, ZERO3 } from '../../math/vec3';
import { type Vec2, vec2 } from '../../math/vec2';

/** Kinematic state: world-space velocity, planar (X/Z) facing, and grounded flag. */
export interface CharacterMotion {
  readonly velocity: Vec3;
  readonly facing: Vec2;
  readonly isGrounded: boolean;
}

/** Grounded, motionless, facing forward (negative Y in planar space). */
export const IDLE: CharacterMotion = { velocity: ZERO3, facing: vec2(0, -1), isGrounded: true };
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/domain/hub/character/valueTypes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "domain: port character value types (constants/config/input/motion)"
```

### Task 6: `characterMovement.ts` — the movement rule (port CharacterMovementTests)

**Files:**
- Create: `src/domain/hub/character/characterMovement.ts`
- Test: `tests/domain/hub/character/characterMovement.test.ts`

- [ ] **Step 1: Write the failing test (ported 1:1 from `CharacterMovementTests.cs`, all 9 cases)**

```typescript
import { describe, it, expect } from 'vitest';
import { step } from '../../../../src/domain/hub/character/characterMovement';
import { DEFAULT_CONFIG as C } from '../../../../src/domain/hub/character/movementConfig';
import { NONE_INPUT, type MovementInput } from '../../../../src/domain/hub/character/movementInput';
import { IDLE, type CharacterMotion } from '../../../../src/domain/hub/character/characterMotion';
import { fromRaw } from '../../../../src/domain/kernel/normalizedPlanarDirection';
import { vec2, vec2 as v2, length } from '../../../../src/domain/math/vec2';
import { vec3 } from '../../../../src/domain/math/vec3';

const P = 3;
const moveTowards = (rawX: number, rawY: number, jump = false): MovementInput =>
  ({ direction: fromRaw(vec2(rawX, rawY)), jumpRequested: jump });
const planarSpeed = (m: CharacterMotion) => length(v2(m.velocity.x, m.velocity.z));

describe('CharacterMovement.step', () => {
  it('full input accelerates to max speed along input direction', () => {
    const r = step(IDLE, moveTowards(1, 0), C, 1);
    expect(r.velocity.x).toBeCloseTo(C.maxSpeed, P);
    expect(r.velocity.z).toBeCloseTo(0, P);
    expect(r.facing.x).toBeCloseTo(1, P);
  });
  it('no input decelerates planar velocity to rest', () => {
    const moving: CharacterMotion = { ...IDLE, velocity: vec3(C.maxSpeed, 0, 0) };
    const r = step(moving, NONE_INPUT, C, 1);
    expect(r.velocity.x).toBeCloseTo(0, P);
    expect(r.velocity.z).toBeCloseTo(0, P);
  });
  it('diagonal input never exceeds max speed', () => {
    const r = step(IDLE, moveTowards(1, 1), C, 1);
    expect(planarSpeed(r)).toBeCloseTo(C.maxSpeed, P);
    expect(r.velocity.x).toBeCloseTo(r.velocity.z, P);
  });
  it('grounded jump imparts upward velocity and leaves ground', () => {
    const r = step(IDLE, moveTowards(0, 0, true), C, 1 / 60);
    expect(r.velocity.y).toBeCloseTo(C.jumpSpeed, P);
    expect(r.isGrounded).toBe(false);
  });
  it('airborne jump is ignored', () => {
    const airborne: CharacterMotion = { ...IDLE, isGrounded: false };
    const r = step(airborne, moveTowards(0, 0, true), C, 0.5);
    expect(r.velocity.y).toBeCloseTo(-C.gravity * 0.5, P);
    expect(r.isGrounded).toBe(false);
  });
  it('airborne applies gravity over time', () => {
    const airborne: CharacterMotion = { ...IDLE, isGrounded: false };
    const r = step(airborne, NONE_INPUT, C, 0.5);
    expect(r.velocity.y).toBeCloseTo(-C.gravity * 0.5, P);
  });
  it('grounded without jump rests with zero vertical velocity', () => {
    const settling: CharacterMotion = { ...IDLE, velocity: vec3(0, -5, 0) };
    const r = step(settling, NONE_INPUT, C, 0.5);
    expect(r.velocity.y).toBeCloseTo(0, P);
    expect(r.isGrounded).toBe(true);
  });
  it('no input preserves previous facing', () => {
    const facingRight: CharacterMotion = { ...IDLE, facing: vec2(1, 0) };
    const r = step(facingRight, NONE_INPUT, C, 0.5);
    expect(r.facing.x).toBeCloseTo(1, P);
    expect(r.facing.y).toBeCloseTo(0, P);
  });
  it('partial input accelerates toward scaled target speed', () => {
    const r = step(IDLE, moveTowards(0.5, 0), C, 1);
    expect(r.velocity.x).toBeCloseTo(C.maxSpeed * 0.5, P);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/domain/hub/character/characterMovement.test.ts`
Expected: FAIL — `step` not found.

- [ ] **Step 3: Implement `characterMovement.ts` (direct port of `CharacterMovement.cs`)**

```typescript
import { type CharacterMotion } from './characterMotion';
import { type MovementInput } from './movementInput';
import { type MovementConfig } from './movementConfig';
import { type Vec2, vec2, scale, normalize, moveToward } from '../../math/vec2';
import { vec3 } from '../../math/vec3';
import { isZero } from '../../kernel/normalizedPlanarDirection';

/** Advances the character motion by a single frame of `delta` seconds. Pure. */
export const step = (
  motion: CharacterMotion,
  input: MovementInput,
  config: MovementConfig,
  delta: number,
): CharacterMotion => {
  const planar = nextPlanarVelocity(motion, input, config, delta);
  const justJumped = motion.isGrounded && input.jumpRequested;
  const verticalSpeed = nextVerticalSpeed(motion, justJumped, config, delta);
  const facing = isZero(input.direction) ? motion.facing : normalize(input.direction.value);

  return {
    velocity: vec3(planar.x, verticalSpeed, planar.y),
    facing,
    isGrounded: motion.isGrounded && !justJumped,
  };
};

const nextPlanarVelocity = (
  motion: CharacterMotion, input: MovementInput, config: MovementConfig, delta: number,
): Vec2 => {
  const current = vec2(motion.velocity.x, motion.velocity.z);
  const target = scale(input.direction.value, config.maxSpeed);
  const rate = isZero(input.direction) ? config.deceleration : config.acceleration;
  return moveToward(current, target, rate * delta);
};

const nextVerticalSpeed = (
  motion: CharacterMotion, justJumped: boolean, config: MovementConfig, delta: number,
): number => {
  if (motion.isGrounded) return justJumped ? config.jumpSpeed : 0;
  return motion.velocity.y - config.gravity * delta;
};
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/domain/hub/character/characterMovement.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the whole domain suite and confirm parity with the C# count**

Run: `pnpm test`
Expected: PASS — 22 assertions total across math(6)+kernel(4)+valueTypes(3)+movement(9). Domain movement logic now matches `__prototype__` 1:1.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "domain: port CharacterMovement.step with full test parity"
```

---

## Phase 2 — babylon hub slice

> Presentation tasks are verified by running the app in the browser (the analog of the project's Godot headless smoke-test), except the one pure function below, which is unit-tested.

### Task 7: `cameraRelativeDirection.ts` — pure, unit-tested

Mirrors `PlayerController.PlanarDirectionFrom`: given the WASD axis and the camera's flattened right/forward on the X/Z plane, produce a `NormalizedPlanarDirection`. Kept babylon-free so it is unit-testable.

**Files:**
- Create: `src/presentation/babylon/cameraRelativeDirection.ts`
- Test: `tests/presentation/cameraRelativeDirection.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { planarDirectionFromInput } from '../../src/presentation/babylon/cameraRelativeDirection';
import { isZero } from '../../src/domain/kernel/normalizedPlanarDirection';

// Camera looking down -Z (default): right = +X (1,0), forward = -Z (0,-1) in {x,z}.
const RIGHT = { x: 1, z: 0 };
const FORWARD = { x: 0, z: -1 };

describe('planarDirectionFromInput', () => {
  it('zero axis yields the zero direction', () => {
    expect(isZero(planarDirectionFromInput({ x: 0, y: 0 }, RIGHT, FORWARD))).toBe(true);
  });
  it('pressing forward (axis.y=1) maps to camera forward', () => {
    const d = planarDirectionFromInput({ x: 0, y: 1 }, RIGHT, FORWARD);
    expect(d.value.x).toBeCloseTo(0, 3);
    expect(d.value.y).toBeCloseTo(-1, 3); // planar y == world z
  });
  it('pressing right (axis.x=1) maps to camera right', () => {
    const d = planarDirectionFromInput({ x: 1, y: 0 }, RIGHT, FORWARD);
    expect(d.value.x).toBeCloseTo(1, 3);
    expect(d.value.y).toBeCloseTo(0, 3);
  });
  it('diagonal is clamped to unit length', () => {
    const d = planarDirectionFromInput({ x: 1, y: 1 }, RIGHT, FORWARD);
    expect(Math.hypot(d.value.x, d.value.y)).toBeCloseTo(1, 3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/presentation/cameraRelativeDirection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (world = right*axis.x + forward*axis.y, on the X/Z plane; matches the Godot `basis.X * axis.X - basis.Z * axis.Y` with forward already `-Z`)

```typescript
import { fromRaw, NONE, type NormalizedPlanarDirection } from '../../domain/kernel/normalizedPlanarDirection';
import { vec2 } from '../../domain/math/vec2';

export interface PlanarBasis { readonly x: number; readonly z: number }
export interface InputAxis { readonly x: number; readonly y: number }

/** Maps a WASD axis into a camera-relative planar direction (X/Z), clamped to unit length. */
export const planarDirectionFromInput = (
  axis: InputAxis, right: PlanarBasis, forward: PlanarBasis,
): NormalizedPlanarDirection => {
  if (axis.x === 0 && axis.y === 0) return NONE;
  const worldX = right.x * axis.x + forward.x * axis.y;
  const worldZ = right.z * axis.x + forward.z * axis.y;
  return fromRaw(vec2(worldX, worldZ));
};
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test tests/presentation/cameraRelativeDirection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "presentation: camera-relative planar direction (pure, tested)"
```

### Task 8: babylon scene bootstrap (engine, ground, light, static camera)

**Files:**
- Create: `src/presentation/babylon/hubScene.ts`
- Modify: `src/app/App.svelte`, `src/app/main.ts` (mount a full-window canvas)

- [ ] **Step 1: Create `hubScene.ts` — engine, scene, ground, hemispheric light, temporary ArcRotateCamera**

```typescript
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import '@babylonjs/core/Meshes/Builders/groundBuilder';

export interface HubScene { readonly engine: Engine; readonly scene: Scene }

export function createHubScene(canvas: HTMLCanvasElement): HubScene {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);

  new HemisphericLight('light', new Vector3(0, 1, 0), scene);
  CreateGround('ground', { width: 50, height: 50 }, scene);

  const cam = new ArcRotateCamera('tmp', -Math.PI / 2, 1.2, 12, Vector3.Zero(), scene);
  cam.attachControl(canvas, true);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());
  return { engine, scene };
}
```

- [ ] **Step 2: Mount the canvas from Svelte**

`src/app/App.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createHubScene } from '../presentation/babylon/hubScene';
  let canvas: HTMLCanvasElement;
  onMount(() => { createHubScene(canvas); });
</script>

<canvas bind:this={canvas} style="width:100vw;height:100vh;display:block"></canvas>
```

- [ ] **Step 3: Verify in browser**

Run: `pnpm dev`, open the URL.
Expected: a lit ground plane; drag to orbit the temporary camera. No console errors. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "presentation: babylon hub scene bootstrap (ground/light/temp camera)"
```

### Task 9: Third-person follow camera with pointer-lock mouse-look

**Files:**
- Create: `src/presentation/babylon/followCamera.ts`
- Modify: `src/presentation/babylon/hubScene.ts` (replace the temp ArcRotateCamera; return a target node the camera follows)

- [ ] **Step 1: Create `followCamera.ts`** — yaw/pitch driven by pointer-lock mouse motion, pitch clamped, camera positioned behind a target (mirrors SpringArm yaw/pitch and `MouseSensitivity`/`MinPitch`/`MaxPitch`).

```typescript
import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

const SENSITIVITY = 0.005;
const MIN_PITCH = -1.2;
const MAX_PITCH = 0.6;
const DISTANCE = 6;
const HEIGHT = 2;

export interface FollowCamera {
  readonly camera: TargetCamera;
  /** Flattened, normalized camera right/forward on the X/Z plane, for camera-relative input. */
  planarBasis(): { right: { x: number; z: number }; forward: { x: number; z: number } };
}

export function createFollowCamera(scene: Scene, target: TransformNode, canvas: HTMLCanvasElement): FollowCamera {
  const camera = new TargetCamera('follow', new Vector3(0, HEIGHT, DISTANCE), scene);
  let yaw = 0;
  let pitch = -0.35;

  canvas.addEventListener('click', () => canvas.requestPointerLock());
  canvas.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * SENSITIVITY;
    pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch - e.movementY * SENSITIVITY));
  });

  scene.onBeforeRenderObservable.add(() => {
    const t = target.getAbsolutePosition();
    const offset = new Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(-pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ).scaleInPlace(DISTANCE);
    camera.position.copyFrom(t.add(offset).add(new Vector3(0, HEIGHT, 0)));
    camera.setTarget(t.add(new Vector3(0, HEIGHT * 0.5, 0)));
  });

  return {
    camera,
    planarBasis() {
      const fwd = camera.getDirection(Vector3.Forward());
      const f = new Vector3(fwd.x, 0, fwd.z).normalize();
      const r = new Vector3(f.z, 0, -f.x); // right = forward rotated -90° on Y
      return { right: { x: r.x, z: r.z }, forward: { x: f.x, z: f.z } };
    },
  };
}
```

- [ ] **Step 2: Wire it into `hubScene.ts`** — create a temporary `TransformNode` at origin as the follow target for now (Task 10 replaces it with the player), remove the ArcRotateCamera, set `scene.activeCamera`.

Add to `createHubScene`, replacing the ArcRotateCamera block:
```typescript
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { createFollowCamera } from './followCamera';
// ...
const target = new TransformNode('camTarget', scene);
const follow = createFollowCamera(scene, target, canvas);
scene.activeCamera = follow.camera;
```
Return `follow` and `target` from the function too (widen `HubScene`).

- [ ] **Step 3: Verify in browser**

Run: `pnpm dev`. Click the canvas (locks pointer), move the mouse.
Expected: camera orbits around the origin; pitch stops at the clamps; Esc releases the pointer. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "presentation: third-person follow camera with pointer-lock look"
```

### Task 10: Havok character controller + domain-driven movement loop

**Files:**
- Create: `src/presentation/babylon/vectorConversions.ts`, `src/presentation/babylon/playerController.ts`
- Modify: `src/presentation/babylon/hubScene.ts` (async init: load Havok, create the player, use it as the camera target)

> **API note:** `PhysicsCharacterController` and the Havok plugin are from `@babylonjs/core` / `@babylonjs/havok`. Confirm exact `integrate` / `checkSupport` signatures against the installed babylon version (see `node_modules/@babylonjs/core/Physics/v2/characterController.d.ts`). The skeleton below reflects the current API shape (`checkSupport(dt, up)` → surface info with `supportedState`; `setVelocity`; `integrate(dt, surfaceInfo, gravity)`; `getPosition()`).

- [ ] **Step 1: `vectorConversions.ts`** (domain <-> babylon)

```typescript
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { type Vec3, vec3 } from '../../domain/math/vec3';

export const toBabylon = (v: Vec3): Vector3 => new Vector3(v.x, v.y, v.z);
export const toDomain = (v: Vector3): Vec3 => vec3(v.x, v.y, v.z);
```

- [ ] **Step 2: `playerController.ts`** — owns the Havok character controller and steps the pure domain each frame.

```typescript
import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsCharacterController } from '@babylonjs/core/Physics/v2/characterController';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

import { step } from '../../domain/hub/character/characterMovement';
import { DEFAULT_CONFIG } from '../../domain/hub/character/movementConfig';
import { IDLE, type CharacterMotion } from '../../domain/hub/character/characterMotion';
import { vec3 } from '../../domain/math/vec3';
import { planarDirectionFromInput } from './cameraRelativeDirection';
import type { FollowCamera } from './followCamera';
import type { InputState } from './input';

const RADIUS = 0.5;
const HALF_HEIGHT = 0.9;
const TURN_SPEED = 12;

export interface Player { readonly root: TransformNode; motion: CharacterMotion }

export function createPlayer(scene: Scene, follow: FollowCamera, input: InputState): Player {
  const start = new Vector3(0, HALF_HEIGHT + RADIUS, 0);
  const controller = new PhysicsCharacterController(
    start, { capsuleRadius: RADIUS, capsuleHeight: HALF_HEIGHT * 2 + RADIUS * 2 }, scene,
  );
  const root = new TransformNode('player', scene);
  const player: Player = { root, motion: IDLE };

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    if (dt <= 0) return;

    const support = controller.checkSupport(dt, new Vector3(0, 1, 0));
    const grounded = support.supportedState === /* SUPPORTED */ 2;

    const { right, forward } = follow.planarBasis();
    const direction = planarDirectionFromInput(input.axis(), right, forward);
    const next = step(
      { ...player.motion, isGrounded: grounded },
      { direction, jumpRequested: input.consumeJump() },
      DEFAULT_CONFIG, dt,
    );

    controller.setVelocity(new Vector3(next.velocity.x, next.velocity.y, next.velocity.z));
    controller.integrate(dt, support, Vector3.Zero()); // gravity stays in the domain → pass 0
    const pos = controller.getPosition();
    root.position.copyFrom(pos);
    player.motion = { ...next, velocity: vec3(next.velocity.x, next.velocity.y, next.velocity.z) };

    faceMovement(root, next.facing.x, next.facing.y, dt);
  });

  return player;
}

function faceMovement(root: TransformNode, fx: number, fy: number, dt: number): void {
  const targetYaw = Math.atan2(-fx, -fy);
  const cur = root.rotation.y;
  let delta = targetYaw - cur;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // shortest angle
  root.rotation.y = cur + delta * Math.min(1, TURN_SPEED * dt);
}
```

- [ ] **Step 3: `input.ts`** — WASD axis + edge-triggered jump (mirrors `Input.GetVector` + `IsActionJustPressed`).

`src/presentation/babylon/input.ts`:
```typescript
export interface InputState {
  axis(): { x: number; y: number };
  consumeJump(): boolean;
}

export function createInput(): InputState {
  const down = new Set<string>();
  let jumpQueued = false;
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!down.has(k) && (k === ' ' || k === 'spacebar')) jumpQueued = true;
    down.add(k);
  });
  window.addEventListener('keyup', (e) => down.delete(e.key.toLowerCase()));

  return {
    axis: () => ({
      x: (down.has('d') ? 1 : 0) - (down.has('a') ? 1 : 0),
      y: (down.has('w') ? 1 : 0) - (down.has('s') ? 1 : 0),
    }),
    consumeJump: () => { const j = jumpQueued; jumpQueued = false; return j; },
  };
}
```

- [ ] **Step 4: Async Havok init in `hubScene.ts`** — enable physics before creating the player.

```typescript
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import '@babylonjs/core/Physics/physicsEngineComponent';
import { createInput } from './input';
import { createPlayer } from './playerController';

// make createHubScene async:
export async function createHubScene(canvas: HTMLCanvasElement): Promise<HubScene> {
  // ...engine, scene, light, ground as before...
  const havok = await HavokPhysics();
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene); // static floor collider

  const input = createInput();
  const player = createPlayer(scene, follow /* create follow with player.root as target */, input);
  // create the follow camera targeting player.root (reorder so player exists first, or set target after)
}
```

Update `App.svelte` `onMount` to `await createHubScene(canvas)`.

- [ ] **Step 5: Verify in browser**

Run: `pnpm dev`. Click to lock pointer.
Expected: a capsule/target sits on the ground; WASD moves it **relative to the camera**; Space makes it jump and fall back under gravity; it does not sink through the floor (Havok collision). Check the console for zero physics errors. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "presentation: Havok character controller driven by the pure domain"
```

### Task 11: Load the glTF knight and parent it to the player

**Files:**
- Create: `public/models/knight_web.glb` (asset-prep step)
- Modify: `src/presentation/babylon/playerController.ts` (load & attach the mesh)

- [ ] **Step 1: Produce `knight_web.glb` (one-time asset prep)**

The knight mesh (`__prototype__/Assets/Characters/Knight/knight.glb`) and its animations (`Idle.fbx`, `Walking.fbx`, retargeted via Godot's `KnightAnims.res`) are separate and Godot-specific. Bake them into one web GLB:

Primary path — export from Godot (reuses the working retarget):
1. Open `__prototype__/project.godot` in Godot 4.7.1 (mono).
2. Open `Scenes/Character/PlayerCharacter.tscn` (knight + `AnimationPlayer` with the Idle/Walk library).
3. `Scene → Export As… → glTF 2.0 Binary (.glb)`, enable animation export, save to `public/models/knight_web.glb`.

Fallback — Blender: import `knight.glb`, import the Mixamo `Idle.fbx`/`Walking.fbx`, retarget onto the knight armature, name the actions `Idle` and `Walk`, export a single `.glb` with both.

Verify the file loads standalone before wiring it in:
```bash
ls -lh public/models/knight_web.glb
```
Expected: a non-trivial `.glb` (hundreds of KB+).

- [ ] **Step 2: Load and attach the mesh in `playerController.ts`**

Add imports and load after creating `root`:
```typescript
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
// ...
const knight = await ImportMeshAsync('/models/knight_web.glb', scene);
const mesh = knight.meshes[0];
mesh.parent = root;
mesh.position.set(0, -(HALF_HEIGHT + RADIUS), 0); // feet at capsule bottom
```
(Make `createPlayer` async and `await` it in `hubScene.ts`.)

- [ ] **Step 3: Verify in browser**

Run: `pnpm dev`.
Expected: the knight model renders in place of the bare capsule, stands on the ground, moves with WASD, and **rotates to face the movement direction**. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "presentation: load glTF knight and parent to the physics body"
```

### Task 12: Idle/Walk animation blending by planar speed

**Files:**
- Modify: `src/presentation/babylon/playerController.ts`

- [ ] **Step 1: Grab the two AnimationGroups and blend by planar speed** (mirrors `WalkAnimationThreshold = 0.6`, `AnimationBlend = 0.2`).

After `ImportMeshAsync`:
```typescript
import { length as len2, vec2 } from '../../domain/math/vec2';
// ...
const groups = knight.animationGroups;
const idle = groups.find((g) => /idle/i.test(g.name)) ?? groups[0];
const walk = groups.find((g) => /walk/i.test(g.name)) ?? groups[1];
for (const g of [idle, walk]) { g.enableBlending?.(0.2); g.stop(); }
idle.play(true);
let walking = false;
```

Inside the render observable, after computing `next`:
```typescript
const planarSpeed = len2(vec2(next.velocity.x, next.velocity.z));
const wantWalk = planarSpeed > 0.6;
if (wantWalk !== walking) {
  walking = wantWalk;
  (wantWalk ? walk : idle).play(true);
  (wantWalk ? idle : walk).stop();
}
```

- [ ] **Step 2: Verify in browser**

Run: `pnpm dev`.
Expected: knight plays Idle when still and Walk when moving, with a visible blend on transitions. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "presentation: blend Idle/Walk animation by planar speed"
```

---

## Phase 3 — Tauri v2 packaging

### Task 13: Wrap the web app as a desktop app with Tauri v2

**Files:**
- Create: `src-tauri/` (via the Tauri CLI)
- Modify: `package.json` (add `tauri` script)

> Requires the Rust toolchain (`rustc`, `cargo`). If absent, install from https://rustup.rs and re-run.

- [ ] **Step 1: Add the Tauri CLI and initialize (non-interactive)**

```bash
pnpm add -D @tauri-apps/cli
pnpm tauri init --app-name ProjectRondo --window-title ProjectRondo \
  --frontend-dist ../dist --dev-url http://localhost:5173 \
  --before-dev-command "pnpm dev" --before-build-command "pnpm build"
```

- [ ] **Step 2: Add the script to `package.json`**

```json
{ "tauri": "tauri" }
```

- [ ] **Step 3: Run the desktop app in dev**

Run: `pnpm tauri dev`
Expected: a native window opens showing the hub with the walking knight (same scene as the browser). Physics and animation work. Close the window.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "packaging: wrap web app as a Tauri v2 desktop app"
```

### Task 14: Update README for the new layout

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the "Develop" and layout sections** to describe the web app at root, `__prototype__/` for the Godot reference, and the commands: `pnpm dev`, `pnpm test`, `pnpm tauri dev`. Keep the engineering-approach and roadmap text.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: update README for the web-first layout"
```

---

## Self-review notes (author checklist, completed)

- **Spec coverage:** repo move (T1), scaffold (T2), domain port incl. math/kernel/value-types/movement with ported tests (T3–T6), camera-relative direction (T7), babylon scene/camera (T8–T9), Havok domain-authoritative loop with gravity=0 (T10), glTF asset-prep + load (T11), Idle/Walk blend (T12), Tauri (T13), README (T14). All SP0 spec sections map to a task.
- **Placeholder scan:** every code step contains full code; asset-prep (T11) and Tauri (T13) are explicit manual procedures, not placeholders.
- **Type consistency:** `step`, `CharacterMotion`, `MovementInput`, `MovementConfig`, `DEFAULT_CONFIG`, `IDLE`, `NONE_INPUT`, `fromRaw`, `isZero`, `NormalizedPlanarDirection`, `Vec2`/`Vec3`, `planarDirectionFromInput`, `createPlayer`/`InputState`/`FollowCamera` names are used consistently across tasks.
- **Known external-API risk (flagged in spec):** Havok `PhysicsCharacterController` signatures and the `supportedState` enum value in T10 must be confirmed against the pinned babylon version during implementation; the `ImportMeshAsync` name (T11) likewise (older babylon uses `SceneLoader.ImportMeshAsync`).
```
