import type { Scene } from '@babylonjs/core/scene';

/** Anything a level builds that `scene.dispose()` does not reach on its own. */
interface Disposable {
  dispose(): void;
}

/**
 * The pieces of a level that `scene.dispose()` cannot tear down, collected as the build makes them.
 *
 * Every field is optional because this is filled in *during* a build, not after one. Both scene
 * builders open with `new Scene(engine)` and everything after that line can reject — Havok, the
 * knight's GLB, a tree asset — so the failure path has to be able to tear down however much of a
 * level happened to exist at the moment it threw, which is anything from a bare scene upward.
 */
export interface LevelParts {
  /** The character rig. Its DOM listeners are bound to `window` and the canvas, and its Havok
   *  character controller holds handles in the WASM heap; neither belongs to the scene. */
  rig?: Disposable;
  /** The level's audio graph. */
  audio?: Disposable;
}

/**
 * Tears a level down: the parts the scene does not own, then the scene.
 *
 * One function for the finished level and the half-built one both, so the two orders cannot drift
 * apart — the only difference between them is how much of {@link LevelParts} exists by then. A
 * rejected build is retryable (step off the pedestal, step back on), so a partial build that is not
 * torn down is not one leak but one per attempt.
 *
 * **The rig goes before the scene, and that order is load-bearing.**
 * `PhysicsCharacterController.dispose()` reaches for `scene.getPhysicsEngine().getPhysicsPlugin()`
 * to release its two Havok query collectors, so a scene disposed first would leave them — and the
 * controller's `PhysicsShapeCapsule` — in the WASM heap. `havokModule.ts` keeps that heap for the
 * life of the page by design (spec §6), so nothing else ever reclaims them.
 *
 * The scene, never the engine: the engine outlives every level and is disposed only by whoever owns
 * it (`App.svelte`), never by a level.
 */
export function disposeLevel(scene: Scene, parts: LevelParts): void {
  parts.rig?.dispose();
  parts.audio?.dispose();
  scene.dispose();
}
