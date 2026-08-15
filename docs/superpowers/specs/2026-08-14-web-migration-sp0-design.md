# Web Migration — SP0: Foundation + Hub Vertical Slice (Design)

- **Date:** 2026-08-14
- **Status:** Approved (design), pending implementation plan
- **Author:** brainstormed with Claude

## Motivation

Two goals drive moving ProjectRondo from Godot to the web:

1. **Distribution (primary).** Ship playable via a URL, no install; also package a
   desktop/mobile app from the same codebase.
2. **Longevity / engine independence.** Reduce reliance on Godot's future and its
   weak C# web-export story; prefer a web-native stack that is unlikely to disappear.

The project is early (M1–M2), so switching now is cheap relative to later.

## Strategic decisions

- **Single main = Web.** No parallel Godot codebase maintained for "insurance." The
  real insurance is architectural: a pure, engine-agnostic domain that makes swapping
  the renderer (or returning to Godot) a *presentation-layer* change, not a rewrite —
  the same discipline the current C# project already has.
- **Stack:** Svelte 5 + TypeScript, `@babylonjs/core` for 3D, Havok for physics,
  Vite (build/dev), Vitest (domain tests), Tauri v2 (desktop/mobile packaging).
  Package manager: pnpm.
- **Godot code is preserved**, moved wholesale into `__prototype__/`, and serves as a
  behavior reference for parity — not deleted.

## Target architecture (three layers, mirroring today's discipline)

| Layer | Today (Godot) | Web | Responsibility |
| --- | --- | --- | --- |
| Domain (pure logic) | C# `ProjectRondo.Domain` | pure TS `src/domain/` (no babylon/Svelte imports) | movement, dialogue, level rules; single source of truth; independently testable |
| 3D presentation | Godot Scene | babylon.js scene | read input → call domain → apply result to the physics body |
| UI presentation | Godot Control | Svelte components | dialogue box, menus, 2048/Sudoku (DOM UI) |
| Packaging | Godot export | Vite → browser; Tauri v2 → desktop/mobile | one build → many targets |
| Tests | xUnit | Vitest | domain tests carried over 1:1 |

The 18 engineering principles (`docs/engineering-principles.md`) are language-agnostic and
carry over: TDD via Vitest, pure functional core, reactive UI via Svelte runes/stores
(replacing R3 — which today lives only in presentation, never in the domain).

## Decomposition into sub-projects

Each sub-project gets its own spec → plan → implementation cycle.

- **SP0 (this document)** — Foundation + Hub vertical slice. Reaches **M1 parity** on the
  web and proves the riskiest paths (Havok physics + glTF skeletal animation, both driven
  by the pure domain) up front. This is deliberately the *confidence milestone*.
- **SP1** — Dialogue system on web: port the existing dialogue domain + Svelte dialogue UI
  + babylon NPC interaction (M2 parity).
- **SP2+** — Levels & puzzles: Sonic-style 2D/3D, 2048, Sudoku.

## Repository structure (after the move)

```
/  (root = Web app, the new main)
├─ package.json  vite.config.ts  svelte.config.js  tsconfig.json  index.html
├─ src/
│  ├─ domain/                    pure TS, no babylon / no svelte imports
│  │  ├─ math/                   vec2.ts, vec3.ts (pure helpers; replace System.Numerics)
│  │  ├─ kernel/                 normalizedPlanarDirection.ts
│  │  └─ hub/character/          characterMotion / movementInput / movementConfig
│  │                             / movementConstants / characterMovement
│  ├─ presentation/
│  │  ├─ babylon/                hubScene, playerController, followCamera, vectorConversions
│  │  └─ ui/                     Svelte components (SP0: minimal HUD only)
│  └─ app/                       main.ts, App.svelte (bootstrap)
├─ tests/                        Vitest domain tests (mirror the current xUnit tests)
├─ src-tauri/                    Tauri v2 shell
├─ docs/                         stays at root (cross-language specs/plans/principles)
└─ __prototype__/                the whole Godot project (project.godot, Scripts/, Scenes/,
                                 src/, tests/, Assets/, *.csproj, *.sln, …)
```

Notes:
- `docs/` and repo-level config stay at root. The C#-tuned `.editorconfig` effectively
  applies to `__prototype__/`; the web app adds its own formatting/lint config.
- The C# domain and its xUnit tests move into `__prototype__/` as the parity reference.

## SP0 scope

### 1) Domain port (TDD, parity-oriented)

- **`System.Numerics` → self-contained `vec2.ts` / `vec3.ts`** pure functions
  (add / sub / scale / length / normalize / moveToward). **babylon's `Vector3` must never
  leak into the domain** — conversion happens only in presentation (the web equivalent of
  today's `ToGodot()` / `ToNumerics()`).
- `record struct` value semantics → TS `readonly` objects + pure functions returning new
  objects; tests assert with Vitest `toEqual` (deep equality).
- `NormalizedPlanarDirection`'s "clamp to unit length" invariant → protected by a
  `from(raw)` factory.
- **Port the existing xUnit tests to Vitest first, then implement (red → green).**
  Files to port: `CharacterMovement`, `CharacterMotion`, `MovementInput`, `MovementConfig`,
  `MovementConstants`, `NormalizedPlanarDirection`, plus their tests
  (`CharacterMovementTests`, `NormalizedPlanarDirectionTests`).

### 2) babylon hub slice (reproduce current hub behavior)

Item-by-item correspondence with `Scripts/Character/PlayerController.cs`:

| Godot | babylon |
| --- | --- |
| `Input.GetVector` + `IsActionJustPressed` | keyboard WASD + pointer-lock → `MovementInput` |
| SpringArm basis → planar direction | follow-camera basis → camera-relative direction |
| `CharacterMovement.Step` | the same ported domain |
| `MoveAndSlide()` + `IsOnFloor()` | Havok `PhysicsCharacterController` (see Decision A) |
| SpringArm3D 3rd-person + mouse yaw/pitch | follow camera; yaw/pitch with pitch clamp |
| facing lerp + Idle/Walk animation | facing lerp; glTF AnimationGroups (see Decision B) |

**Decision A — Havok, with the domain still authoritative.**
- Use babylon `PhysicsCharacterController` (Havok WASM plugin, `@babylonjs/havok`).
- Per frame: `checkSupport()` → grounded; `CharacterMovement.Step(motion, input, config, dt)`
  (the same pure domain, **including gravity/jump**) → velocity; `setVelocity` +
  `integrate(dt, support, gravity = 0)` for collide-and-slide; read the new position and
  apply it to the mesh.
- **Gravity stays in the domain; gravity passed to Havok is 0**, avoiding double gravity and
  keeping the existing domain tests unchanged. Havok only resolves collision and reports
  support — exactly the "apply the result to the physics body" role from the README.

**Decision B — glTF Knight + animation.**
- **One-time asset prep:** the mesh (`Assets/Characters/Knight/knight.glb`) and animations
  (`Idle.fbx` / `Walking.fbx`, Mixamo) are separate today and retargeted onto the knight
  skeleton via Godot's `KnightAnims.res` + `Retarget/*.tres` — none of which babylon can
  consume, and the Mixamo bone names differ from the knight's (hence the retarget maps).
  Produce a single web-ready `knight_web.glb` with Idle + Walk baked onto the knight
  skeleton. **Primary path: export from Godot** (`Scene → Export → glTF`), reusing the
  retargeting already working there. **Fallback: retarget in Blender** and export GLB.
- babylon: `@babylonjs/loaders` loads `knight_web.glb` → two `AnimationGroup`s; blend
  Idle/Walk by planar speed `> 0.6` via `enableBlending` (mirrors `WalkAnimationThreshold`
  and `AnimationBlend`). The visual mesh is parented under the physics capsule; facing uses
  angle lerp (mirrors `FaceMovement`).

### 3) Tooling

Vite + Svelte 5 (runes) + TypeScript + Vitest + `@babylonjs/core` + `@babylonjs/havok` +
`@babylonjs/loaders` + Tauri v2. The Tauri shell is the last SP0 step: validate the core in
the browser first, then wrap it to confirm multi-platform packaging works end-to-end.

## SP0 definition of done

In the browser (and wrapped by Tauri), a third-person knight walks around the hub:
Havok-driven collision + ground detection, Idle/Walk animation blending, movement controlled
entirely by the pure TS domain. This equals **M1 parity on the web** and demonstrates that
physics + skeletal animation hold up on the web — the confidence milestone.

## Out of scope (YAGNI)

Dialogue system (SP1); levels/puzzles (SP2+); audio; save/load; anything beyond a minimal
HUD in Svelte for SP0.

## Risks / open questions

- **Godot glTF export fidelity** for the retargeted animations — verify Idle/Walk export
  cleanly; Blender retarget is the fallback.
- **Havok `PhysicsCharacterController` API** specifics (exact `integrate`/`checkSupport`
  signatures) to be confirmed against the pinned babylon version during implementation.
- **Tauri v2 toolchain** requires Rust; confirm the environment can build it.
