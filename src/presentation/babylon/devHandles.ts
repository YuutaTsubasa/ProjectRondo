import type { Scene } from '@babylonjs/core/scene';

/**
 * Puts a handle on `window` for the dev console, and takes it off again when the level it belongs to
 * is disposed. Dev builds only; in a production build this is a no-op and nothing is written.
 *
 * **The rule these handles obey, stated once here because six of them obey it, and they did not all
 * obey the same one before.** Five — `window.tower`, `window.shadows`, `window.charController`,
 * `window.moveConfig`, `window.cameraConfig` — are written from inside a level's *build*, which is
 * before `App.svelte` swaps the render loop onto that level. So for the length of a load they name
 * the level that is coming, not the one on screen: type `moveConfig.maxSpeed = 3.5` while the tower
 * is loading and you have tuned the tower while standing in the hub. That much is inherent — the
 * values exist before there is anything to commit them to, and the alternative is having no handle on
 * a level while it builds, which is when a console is most wanted. `window.hub` is the exception in
 * the other direction: `App.svelte` writes it from the commit, so it never names an uncommitted
 * level.
 *
 * What is *not* inherent, and what this fixes, is a handle that outlives its level. Each one is
 * cleared on its own scene's dispose, and only if it still points at the value that registered it —
 * so the incoming level's write survives the outgoing level's teardown, and a build that fails or is
 * abandoned takes its handles with it when it disposes its own partial scene (`levelTeardown.ts`).
 * Before this, only `window.hub` was ever cleared, by hand, in the one of its two call sites that
 * needed it; the other five were left naming a disposed scene for as long as the page lived.
 *
 * So: a handle may name a level that is still loading, and never one that is gone.
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
