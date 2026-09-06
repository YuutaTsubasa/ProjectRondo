import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createDeferredAudio, type DeferredAudio } from '../../src/presentation/audio/deferredAudio';
import type { MusicScene } from '../../src/domain/audio/musicDirector';
import type { SoundCue } from '../../src/domain/audio/soundCue';

/**
 * Pins the deferral in front of the audio graph, and what it does with each kind of request in the
 * window before the graph exists.
 *
 * `createHubAudio` is synchronous and builds its graph in the background, so between the scene
 * resolving and the graph existing there is a window in which a request reaches no graph at all.
 * The two halves of this file are the two answers to that, and they are opposite on purpose:
 *
 * - A music scene is a STATE, and is held. Whenever the graph arrives, the answer is still the same
 *   one — so a scene asked for in the window is replayed into the graph, and a teardown has to reach
 *   a graph nobody else has a reference to yet. All three failures are inaudible: `App.svelte` asks
 *   for the intro track exactly once, from the scene-load callback, so a dropped request costs the
 *   session all of its music with nothing logged; and a `dispose` that misses a build still in
 *   flight leaves an `AudioContext` running past the page.
 * - A cue is an EVENT, and is dropped. It is tied to the moment it happened, so replaying it would
 *   fire a typing tick seconds after its character was drawn.
 *
 * Reachable here because `createDeferredAudio` takes the build as a nullary function: the fake below
 * is a plain object plus a promise this file settles by hand — no `vi.mock`, no `Scene`, no loaded
 * knight, no `AudioContext`. `hubAudio.ts` passes the real build to the same signature.
 */

interface Fake extends DeferredAudio {
  readonly scenes: MusicScene[];
  readonly cues: SoundCue[];
  disposals: number;
}

const makeFake = (): Fake => {
  const scenes: MusicScene[] = [];
  const cues: SoundCue[] = [];
  return {
    scenes,
    cues,
    disposals: 0,
    setMusicScene(scene) {
      scenes.push(scene);
    },
    play(cue) {
      cues.push(cue);
    },
    dispose() {
      this.disposals += 1;
    },
  };
};

/** The build, settled by the test rather than by a real graph. */
const deferBuild = () => {
  let settle!: (audio: Fake) => void;
  let fail!: (error: unknown) => void;
  const promise = new Promise<Fake>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  let builds = 0;
  return {
    build: () => {
      builds += 1;
      return promise;
    },
    settle,
    fail,
    get builds() {
      return builds;
    },
  };
};

/** A microtask turn, which is all the `await build()` inside the wrapper needs to run to completion. */
const flush = () => Promise.resolve().then(() => undefined);

/**
 * Silenced rather than left to print: the rejection path below deliberately warns, and a passing run
 * should not look like a broken one. Kept as a spy so the warning stays assertable.
 */
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warn.mockClear();
});

describe('the deferred audio handle', () => {
  it('starts the build immediately and hands back a handle before it resolves', () => {
    const pending = deferBuild();

    const audio = createDeferredAudio(pending.build);

    expect(pending.builds).toBe(1);
    // Nothing to forward to yet, and asking anyway must not throw: the scene calls this from a
    // callback that has no idea whether the graph exists.
    expect(() => audio.setMusicScene('intro')).not.toThrow();
  });

  it('replays a scene asked for during the build, and only the last one asked for', async () => {
    const pending = deferBuild();
    const audio = createDeferredAudio(pending.build);
    const graph = makeFake();

    audio.setMusicScene('intro');
    audio.setMusicScene('playing');
    expect(graph.scenes).toEqual([]);

    pending.settle(graph);
    await flush();

    // One request, not two: the held slot is the latest wish, not a queue of them — replaying
    // `intro` here would start a track the caller has already moved off.
    expect(graph.scenes).toEqual(['playing']);
  });

  it('forwards a scene asked for after the build to the live graph', async () => {
    const pending = deferBuild();
    const audio = createDeferredAudio(pending.build);
    const graph = makeFake();
    pending.settle(graph);
    await flush();

    audio.setMusicScene('playing');

    expect(graph.scenes).toEqual(['playing']);
  });

  it('disposes a graph whose build finished after the handle was disposed', async () => {
    const pending = deferBuild();
    const audio = createDeferredAudio(pending.build);
    const graph = makeFake();

    audio.setMusicScene('intro');
    audio.dispose();
    pending.settle(graph);
    await flush();

    // Nothing else ever holds this graph, so if the wrapper does not dispose it here its
    // `AudioContext` outlives the page.
    expect(graph.disposals).toBe(1);
    // And the held request must not pay out into a graph that is being torn down: music started
    // here would play on for the life of the tab.
    expect(graph.scenes).toEqual([]);
  });

  it('disposes the live graph once, and stops forwarding afterwards', async () => {
    const pending = deferBuild();
    const audio = createDeferredAudio(pending.build);
    const graph = makeFake();
    pending.settle(graph);
    await flush();

    audio.dispose();
    audio.dispose();
    audio.setMusicScene('playing');

    // The handle drops the graph on the first dispose, so a repeated teardown — an HMR reload
    // racing the scene's own — cannot dispose it twice or start music on it.
    expect(graph.disposals).toBe(1);
    expect(graph.scenes).toEqual([]);
  });

  it('warns and stays usable when the build fails', async () => {
    const pending = deferBuild();
    const audio = createDeferredAudio(pending.build);

    pending.fail(new Error('no audio context'));
    await flush();

    // A failed build means a silent game, not a broken one: the rejection is logged and swallowed,
    // and the handle the scene is holding keeps answering.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => audio.setMusicScene('playing')).not.toThrow();
    expect(() => audio.dispose()).not.toThrow();
  });
});

describe('createDeferredAudio, one-shot cues', () => {
  it('drops a cue asked for before the graph exists, rather than holding it', async () => {
    const deferred = deferBuild();
    const audio = createDeferredAudio(deferred.build);
    const fake = makeFake();

    audio.play('ui.type');
    deferred.settle(fake);
    await flush();

    // The opposite of setMusicScene, and the reason both behaviours are pinned here: a scene is a
    // state that is still true whenever the graph arrives, a cue is an event tied to the moment it
    // happened. Replaying it would fire a typing tick seconds after its character was drawn.
    expect(fake.cues).toEqual([]);
  });

  it('forwards a cue asked for once the graph is up', async () => {
    const deferred = deferBuild();
    const audio = createDeferredAudio(deferred.build);
    const fake = makeFake();
    deferred.settle(fake);
    await flush();

    audio.play('ui.confirm');
    expect(fake.cues).toEqual(['ui.confirm']);
  });

  it('drops a cue asked for after disposal', async () => {
    const deferred = deferBuild();
    const audio = createDeferredAudio(deferred.build);
    const fake = makeFake();
    deferred.settle(fake);
    await flush();

    audio.dispose();
    audio.play('ui.move');
    expect(fake.cues).toEqual([]);
  });
});
