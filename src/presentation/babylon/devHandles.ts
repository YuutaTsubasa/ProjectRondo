import type { Scene } from '@babylonjs/core/scene';

/**
 * Puts a handle on `window` for the dev console, and takes it off again when the level it belongs to
 * is disposed. Dev builds only; in a production build this is a no-op and nothing is written.
 *
 * **The rule these handles obey, stated once here because five of them obey it.** `window.hub`,
 * `window.tower`, `window.shadows`, `window.charController` and `window.moveConfig` are all written
 * during a level's *build*, which is before `App.svelte` swaps the render loop onto it. So for the
 * length of a load they name the level that is coming, not the one on screen — type `moveConfig.
 * maxSpeed = 3.5` while the tower is loading and you have tuned the tower, standing in the hub. That
 * is inherent: the values exist before there is anything to commit them to, and the alternative is
 * having no handle on a level while it builds, which is when they are most wanted.
 *
 * What is *not* inherent, and what this fixes, is a handle that outlives its level. Each one is
 * cleared on its own scene's dispose, and only if it still points at the value that registered it —
 * so the incoming level's write survives the outgoing level's teardown, and a build that fails or is
 * abandoned takes its handles with it when it disposes its own partial scene (`levelTeardown.ts`).
 * Before this, `window.tower` and the three below it were left naming a disposed scene, and only
 * `App.svelte` cleared `window.hub`, by hand, in one of the two places it needed clearing.
 *
 * Handles therefore say "the newest level to have started building", never "a level that is gone".
 */
export function exposeDevHandle(scene: Scene, name: string, value: unknown): void {
  if (!import.meta.env.DEV) return;
  const handles = window as unknown as Record<string, unknown>;
  handles[name] = value;
  scene.onDisposeObservable.addOnce(() => {
    // Only if nothing has claimed it since: a swap builds the incoming level before disposing the
    // outgoing one, so by the time this runs the name usually belongs to the level now on screen.
    if (handles[name] === value) delete handles[name];
  });
}
