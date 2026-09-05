import { describe, it, expect, vi, beforeEach } from 'vitest';

import { busGain, DEFAULT_LEVELS } from '../../src/domain/audio/audioMixer';

/**
 * Pins what `createGameAudio` does when babylon does *not* cooperate: it leaves nothing behind.
 *
 * The graph is built out of two async factories, so a rejection can land with an `AudioContext`
 * already open and one or two buses already hanging off it — and the caller never sees the handle
 * that would let it dispose them. `buildHubAudio`'s own guard only runs once this function has
 * *resolved*, so nothing downstream can clean up after a rejection here. The failure mode is a leaked
 * `AudioContext` plus stranded buses which survive for the life of the page: no throw anyone sees, no
 * warning, and nothing audible — a browser tab that gets quietly heavier every time the scene is
 * rebuilt. That is not reachable by ear or by a build, which is what makes it worth a test.
 *
 * The engine and buses are fakes, not babylon's: AudioV2 needs a real `AudioContext`, and everything
 * asserted below is decided entirely in `audioEngine.ts` — which disposals happen, in what order, and
 * which bus ends up under which id. `createGameAudio` reaches both factories through module imports
 * rather than an injectable seam, so the seam here is `vi.mock` on those two modules, the same shape
 * `tests/presentation/soundBank.test.ts` uses.
 */

const disposed: string[] = [];

class FakeBus {
  volume = Number.NaN;
  constructor(readonly name: string) {}
  dispose(): void {
    disposed.push(`bus:${this.name}`);
  }
}

class FakeEngine {
  dispose(): void {
    disposed.push('engine');
  }
}

/** Bus ids whose creation must reject, as `CreateAudioBusAsync` does when the context is gone. */
const failing = new Set<string>();
/**
 * Bus ids whose creation resolves late. `Promise.allSettled` resolves in *input* order whatever the
 * settle order is, which is the whole point of the pairing at `audioEngine.ts`'s `settled[i]`; a bus
 * that settles out of order is how a pairing against `created` instead would be caught.
 */
const slow = new Set<string>();

let engine: FakeEngine | null = null;
const buses = new Map<string, FakeBus>();

vi.mock('@babylonjs/core/AudioV2/webAudio/webAudioEngine', () => ({
  CreateAudioEngineAsync: async () => {
    engine = new FakeEngine();
    return engine;
  },
}));

vi.mock('@babylonjs/core/AudioV2/abstractAudio/audioEngineV2', () => ({
  CreateAudioBusAsync: async (name: string) => {
    if (slow.has(name)) await new Promise((resolve) => setTimeout(resolve, 5));
    if (failing.has(name)) throw new Error(`fake bus failure: ${name}`);
    const bus = new FakeBus(name);
    buses.set(name, bus);
    return bus;
  },
}));

const { createGameAudio } = await import('../../src/presentation/audio/audioEngine');

beforeEach(() => {
  disposed.length = 0;
  failing.clear();
  slow.clear();
  buses.clear();
  engine = null;
});

describe('the audio graph', () => {
  it('builds one engine and the three named buses, at the default mix', async () => {
    const audio = await createGameAudio();

    expect([...buses.keys()]).toEqual(['music', 'sfx', 'ambience']);
    expect(audio.engine).toBe(engine);
    for (const id of ['music', 'sfx', 'ambience'] as const) {
      expect(audio.buses[id]).toBe(buses.get(id));
      expect(audio.buses[id].volume).toBe(busGain(DEFAULT_LEVELS, id));
    }
    expect(disposed).toEqual([]);
  });

  it('pairs each bus with its own id however the factories settle', async () => {
    // `music` is asked for first and answers last. Indexing the *fulfilled* results would put the
    // music bus under `ambience` here, and a mis-set bus gain is inaudible until someone moves a
    // slider that does not exist yet.
    slow.add('music');
    const audio = await createGameAudio();

    for (const id of ['music', 'sfx', 'ambience'] as const) {
      expect(audio.buses[id]).toBe(buses.get(id));
    }
  });

  it('disposes every bus and the engine when the caller is done', async () => {
    const audio = await createGameAudio();
    audio.dispose();

    expect(disposed).toEqual(['bus:music', 'bus:sfx', 'bus:ambience', 'engine']);
  });
});

describe('the audio graph, when a bus will not build', () => {
  it('rejects with the underlying reason rather than a handle nobody can dispose', async () => {
    failing.add('sfx');

    await expect(createGameAudio()).rejects.toThrow('fake bus failure: sfx');
  });

  it('takes the engine and every bus that did build down with it', async () => {
    failing.add('sfx');

    await expect(createGameAudio()).rejects.toThrow();

    // Both siblings *and* the engine: this is the one place that still holds the engine handle, so a
    // bus left here is stranded and an engine left here is a leaked `AudioContext`.
    expect(disposed).toEqual(['bus:music', 'bus:ambience', 'engine']);
  });

  it('waits for the buses still in flight before disposing', async () => {
    // `allSettled`, not `all`: `all` rejects on the first failure while `music` is still resolving,
    // and it does not cancel it — the bus arrives after the cleanup has already run and is stranded
    // on an engine nobody holds. The assertion is that the late bus is disposed too.
    failing.add('sfx');
    slow.add('music');

    await expect(createGameAudio()).rejects.toThrow();

    expect(disposed).toContain('bus:music');
    expect(disposed).toContain('bus:ambience');
    expect(disposed).toContain('engine');
  });

  it('leaves nothing behind when not one bus builds', async () => {
    for (const id of ['music', 'sfx', 'ambience']) failing.add(id);

    await expect(createGameAudio()).rejects.toThrow();

    expect(disposed).toEqual(['engine']);
  });
});
