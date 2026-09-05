import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pins the one-owner-per-sound invariant `SoundBank.startLoop` documents.
 *
 * The sounds are fakes, not babylon's: AudioV2 needs a real `AudioContext`, and the invariant under
 * test is the bank's own bookkeeping — which handle currently owns a sound, and whether a retired
 * one's `setVolume`/`stop` still reach it. That is decided entirely in `soundBank.ts` before any
 * babylon call, so a fake that records calls pins it exactly as well as a real engine would, and
 * without a browser. `loadSoundBank` reaches the two factories through module imports rather than an
 * injectable seam, so the seam here is `vi.mock` on that module.
 *
 * Why it is worth pinning: two handles over one sound is reachable through `setMusicScene`, whose
 * crossfade keeps the outgoing handle for 1.5 s after the next track starts, and the failure is
 * silence — no throw, no warning, just a track nobody hears. That is not something a type or a build
 * catches, and by ear it is easy to miss.
 */

interface FakeCall {
  readonly sound: FakeSound;
  readonly kind: 'play' | 'stop' | 'setVolume';
  readonly value?: number;
}

const calls: FakeCall[] = [];

class FakeSound {
  constructor(readonly name: string) {}
  play(): void {
    calls.push({ sound: this, kind: 'play' });
  }
  stop(): void {
    calls.push({ sound: this, kind: 'stop' });
  }
  setVolume(value: number): void {
    calls.push({ sound: this, kind: 'setVolume', value });
  }
  dispose(): void {}
}

const made = new Map<string, FakeSound>();
const create = async (_cue: string, file: string) => {
  const sound = new FakeSound(file);
  made.set(file, sound);
  return sound;
};

vi.mock('@babylonjs/core/AudioV2/abstractAudio/audioEngineV2', () => ({
  CreateSoundAsync: create,
  CreateStreamingSoundAsync: create,
}));

const { loadSoundBank } = await import('../../src/presentation/audio/soundBank');
const { MANIFEST } = await import('../../src/presentation/audio/manifest');
type GameAudio = Parameters<typeof loadSoundBank>[0];

/** Enough of a `GameAudio` for the bank: it only ever reads `buses[spec.bus]` and `engine`. */
const audio = {
  engine: {},
  buses: { music: {}, sfx: {}, ambience: {} },
} as unknown as GameAudio;

/** A cue with a single file, so "the sound" and "the cue" are the same thing in the assertions. */
const CUE = 'music.hub';
const soundOf = (cue: keyof typeof MANIFEST) => made.get(MANIFEST[cue].files[0])!;

beforeEach(() => {
  calls.length = 0;
});

describe('the sound bank', () => {
  it('gives one sound exactly one live loop handle', async () => {
    const bank = await loadSoundBank(audio);
    const sound = soundOf(CUE);

    const first = bank.startLoop(CUE);
    expect(first).not.toBeNull();
    calls.length = 0;

    const second = bank.startLoop(CUE);
    expect(second).not.toBeNull();
    // The takeover stops the sound before restarting it: leaving that to the retired handle would let
    // its teardown timer land in the middle of the new loop instead.
    expect(calls.map((c) => c.kind)).toEqual(['stop', 'setVolume', 'play']);

    calls.length = 0;
    first!.setVolume(0.5);
    first!.stop();
    expect(calls).toEqual([]);

    second!.setVolume(0.25);
    expect(calls.filter((c) => c.kind === 'setVolume')).toHaveLength(1);
    second!.stop();
    expect(calls.some((c) => c.kind === 'stop' && c.sound === sound)).toBe(true);
  });

  it('retires a handle its own stop already released', async () => {
    const bank = await loadSoundBank(audio);
    const handle = bank.startLoop(CUE)!;
    handle.stop();
    calls.length = 0;
    handle.stop();
    handle.setVolume(1);
    expect(calls).toEqual([]);
  });

  it('retires every outstanding handle before disposing the sounds it owns', async () => {
    const bank = await loadSoundBank(audio);
    const handle = bank.startLoop(CUE)!;
    bank.dispose();
    calls.length = 0;
    handle.setVolume(0);
    handle.stop();
    expect(calls).toEqual([]);
  });
});
