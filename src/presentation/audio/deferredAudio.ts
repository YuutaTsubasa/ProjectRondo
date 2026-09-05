import type { MusicScene } from '../../domain/audio/musicDirector';

/**
 * The handle the scene holds: ask for a music scene, and tear the graph down.
 *
 * Named here rather than in `hubAudio.ts` because both sides of the deferral speak it — the graph the
 * build eventually produces, and the wrapper handed back before that build has finished.
 */
export interface DeferredAudio {
  setMusicScene(scene: MusicScene): void;
  dispose(): void;
}

/**
 * Hands back an audio handle immediately and forwards to the real one once `build` resolves.
 *
 * **Its own module because every way of getting this wrong is silent**, the same reason
 * `musicCrossfade` is one. Three behaviours ride on the three variables below, and not one of them
 * announces a failure:
 *
 * - A `setMusicScene` arriving before the build resolves is *held* and replayed. `App.svelte` asks
 *   exactly once, from the scene-load callback, and never asks again — and the build is normally
 *   still in flight at that point, since it is deliberately not awaited (see `createHubAudio`).
 *   Dropping that one request costs the session all of its music.
 * - A `setMusicScene` arriving after the build has resolved must reach the live graph, not just the
 *   held slot.
 * - A `dispose` landing mid-build must dispose the graph that build is about to finish. Nothing else
 *   ever sees that graph, so otherwise its `AudioContext` outlives the page it belongs to — in dev,
 *   once per HMR reload that lands inside the build window.
 *
 * `build` is a function rather than a promise so a test can settle it on its own schedule, and takes
 * no arguments so nothing here needs a `Scene`, a loaded knight or an `AudioContext`: what the build
 * closes over is the caller's business. Pinned by `tests/presentation/deferredAudio.test.ts`.
 *
 * A rejecting build is logged and swallowed: a failure here means a silent game, not a broken one.
 */
export function createDeferredAudio(build: () => Promise<DeferredAudio>): DeferredAudio {
  let live: DeferredAudio | null = null;
  let disposed = false;
  let pending: MusicScene | null = null;

  const start = async () => {
    try {
      const audio = await build();
      // The scene can be torn down while the build is still in flight; without this the graph it
      // just finished building would outlive the page it belongs to.
      if (disposed) {
        audio.dispose();
        return;
      }
      live = audio;
      if (pending !== null) audio.setMusicScene(pending);
    } catch (error) {
      console.warn('[audio] could not start; the game will be silent:', error);
    }
  };
  void start();

  return {
    // Held rather than dropped: `App.svelte` asks for the intro track the moment the scene resolves,
    // which is now normally *before* the graph is ready.
    setMusicScene(next) {
      pending = next;
      live?.setMusicScene(next);
    },
    dispose() {
      disposed = true;
      live?.dispose();
      live = null;
    },
  };
}
