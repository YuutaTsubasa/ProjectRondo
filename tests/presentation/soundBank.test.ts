import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pins the two invariants the sound bank is shaped around: one owner per sound, and *it never throws
 * and never rejects*.
 *
 * The sounds are fakes, not babylon's: AudioV2 needs a real `AudioContext`, and both invariants are
 * decided entirely in `soundBank.ts` — which handle currently owns a sound, whether a retired one's
 * `setVolume`/`stop` still reach it, and what happens around a call that fails — so a fake that
 * records calls, and fails where it is told to, pins them exactly as well as a real engine would, and
 * without a browser. `loadSoundBank` reaches the two factories through module imports rather than an
 * injectable seam, so the seam here is `vi.mock` on that module.
 *
 * Why they are worth pinning:
 *
 * - Two handles over one sound is reachable through `setMusicScene`, whose crossfade keeps the
 *   outgoing handle for 1.5 s after the next track starts, and the failure is silence — no throw, no
 *   warning, just a track nobody hears. That is not something a type or a build catches, and by ear it
 *   is easy to miss.
 * - A synchronous throw escaping `play` / `startLoop` / `LoopHandle.setVolume` is worse than a dropped
 *   sound. Those run from `scene.onBeforeRenderObservable`, which `_processFrame` notifies *before*
 *   the next frame is queued and which does not catch observer exceptions, so one throw out of a torn
 *   -down AudioV2 node stops the render loop for good: a frozen game, not a missing noise. A rejecting
 *   `CreateSoundAsync` is the same story one level up — `loadSoundBank` resolving is what keeps a
 *   missing asset from taking the scene down with it.
 *
 * The failure paths were previously established only by deleting a file by hand and reloading (spec
 * §7), which cannot reach the synchronous throws at all.
 */

interface FakeCall {
  readonly sound: FakeSound;
  readonly kind: 'play' | 'stop' | 'setVolume';
  readonly value?: number;
}

const calls: FakeCall[] = [];

/** Files whose creation must reject, as `CreateSoundAsync` does for an asset that is not there. */
const failing = new Set<string>();
/** `file:kind` calls that must throw, as a torn-down AudioV2 node does ("Connect failed"). */
const throwing = new Set<string>();

class FakeSound {
  constructor(readonly name: string) {}
  /**
   * Recorded rather than ignored: "was this sound ever handed back to be released" is the whole of
   * the leak the multi-variant load path can produce, and nothing else in the fake can show it.
   */
  disposed = false;
  /** Fails where the real node would: before doing anything, so a throw is not also a recorded call. */
  private guard(kind: FakeCall['kind']): void {
    if (throwing.has(`${this.name}:${kind}`)) throw new Error(`fake ${kind} failure: ${this.name}`);
  }
  play(): void {
    this.guard('play');
    calls.push({ sound: this, kind: 'play' });
  }
  stop(): void {
    this.guard('stop');
    calls.push({ sound: this, kind: 'stop' });
  }
  setVolume(value: number): void {
    this.guard('setVolume');
    calls.push({ sound: this, kind: 'setVolume', value });
  }
  dispose(): void {
    this.disposed = true;
  }
}

const made = new Map<string, FakeSound>();
const create = async (_cue: string, file: string) => {
  if (failing.has(file)) throw new Error(`fake load failure: ${file}`);
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

/**
 * Silenced rather than left to print: the failure paths below deliberately warn, and a passing run
 * should not look like a broken one. Kept as a spy so "one warning, then silence" stays assertable.
 */
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  calls.length = 0;
  made.clear();
  failing.clear();
  throwing.clear();
  warn.mockClear();
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

describe('the sound bank, when the audio engine fails under it', () => {
  it('silences only the cue whose asset would not load', async () => {
    failing.add(MANIFEST[CUE].files[0]);
    const bank = await loadSoundBank(audio);

    // Silent, and silent without a throw: the load failure has to reach the caller as a missing sound,
    // not as an exception out of a render-frame callback.
    expect(bank.startLoop(CUE)).toBeNull();
    expect(() => bank.play(CUE)).not.toThrow();
    expect(calls).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);

    // Every other cue is untouched. This is the property `loadKnight` does not have (HANDOFF §3): one
    // missing file costs one cue, not the scene.
    bank.play('ui.move');
    expect(calls.map((c) => c.sound)).toEqual([soundOf('ui.move')]);
  });

  it('still resolves when not one cue loads', async () => {
    for (const spec of Object.values(MANIFEST)) for (const file of spec.files) failing.add(file);

    // The assertion is the `await` itself: a rejection here is a caller that has to remember `.catch`,
    // and the one that forgets takes the scene down at startup.
    const bank = await loadSoundBank(audio);

    expect(bank.startLoop(CUE)).toBeNull();
    expect(() => bank.play(CUE)).not.toThrow();
    expect(() => bank.dispose()).not.toThrow();
    expect(calls).toEqual([]);
  });

  it('swallows a one-shot whose sound throws on play', async () => {
    const bank = await loadSoundBank(audio);
    throwing.add(`${MANIFEST['ui.move'].files[0]}:play`);

    expect(() => bank.play('ui.move')).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('swallows a loop that throws on start, and leaves the sound unowned', async () => {
    const bank = await loadSoundBank(audio);
    const file = MANIFEST[CUE].files[0];
    throwing.add(`${file}:play`);

    expect(bank.startLoop(CUE)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

    throwing.clear();
    calls.length = 0;
    expect(bank.startLoop(CUE)).not.toBeNull();
    // No takeover `stop`: the failed start released the sound instead of leaving a phantom owner
    // behind, so the next start is a first start and not a restart.
    expect(calls.map((c) => c.kind)).toEqual(['setVolume', 'play']);
  });

  it('restarts a loop whose takeover stop throws', async () => {
    const bank = await loadSoundBank(audio);
    const first = bank.startLoop(CUE)!;
    throwing.add(`${MANIFEST[CUE].files[0]}:stop`);
    calls.length = 0;

    // The stop is best-effort; failing it must not cost the caller the new loop.
    const second = bank.startLoop(CUE);
    expect(second).not.toBeNull();
    expect(calls.map((c) => c.kind)).toEqual(['setVolume', 'play']);

    // And the takeover still happened: the retired handle stays retired whether or not the stop landed.
    calls.length = 0;
    first.setVolume(0.5);
    first.stop();
    expect(calls).toEqual([]);
  });

  it('swallows a volume change that throws, on both the immediate and the fading path', async () => {
    const bank = await loadSoundBank(audio);
    const handle = bank.startLoop(CUE)!;
    throwing.add(`${MANIFEST[CUE].files[0]}:setVolume`);

    expect(() => handle.setVolume(0.5)).not.toThrow();
    expect(() => handle.setVolume(0, 1.5)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  /**
   * Only `ui.type` (four variants) and `footstep.grass` (two) can fail *partly*; the other seven cues
   * have a single file and settle the same way under either design. Both properties below were
   * unreachable while the load was a `Promise.all`, which rejects on the first file without cancelling
   * its siblings and then discards the ones that had already resolved.
   */
  it('keeps the variants that did load when a sibling rejects, and wraps onto them', async () => {
    const [first, missing, third, fourth] = MANIFEST['ui.type'].files;
    failing.add(missing);
    const bank = await loadSoundBank(audio);

    // One warning for the cue, not one per missing file and not one per play.
    expect(warn).toHaveBeenCalledTimes(1);

    for (const variant of [0, 1, 2, 3]) bank.play('ui.type', { variant });
    // The cue stays audible on three of its four ticks. `variant % sounds.length` wraps onto the
    // survivors, so the variant a caller asks for is a preference and never a requirement.
    expect(calls.map((c) => c.sound.name)).toEqual([first, third, fourth, first]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('still owns those siblings, so disposing the bank releases them', async () => {
    failing.add(MANIFEST['ui.type'].files[1]);
    const bank = await loadSoundBank(audio);

    const variants = MANIFEST['ui.type'].files
      .map((file) => made.get(file))
      .filter((sound) => sound !== undefined);
    expect(variants).toHaveLength(3);

    bank.dispose();
    // The leak this pins: three sounds built against the engine and registered in its node set, with
    // nothing holding a handle to them — alive on the sfx bus until `engine.dispose()` at teardown.
    expect(variants.filter((sound) => !sound.disposed)).toEqual([]);
    expect([...made.values()].filter((sound) => !sound.disposed)).toEqual([]);
  });

  it('retires a handle whose own stop throws', async () => {
    const bank = await loadSoundBank(audio);
    const handle = bank.startLoop(CUE)!;
    throwing.add(`${MANIFEST[CUE].files[0]}:stop`);

    expect(() => handle.stop()).not.toThrow();

    // Retired even though the stop failed — otherwise a crossfade's teardown timer would keep calling
    // into the node that just threw, once per attempt.
    throwing.clear();
    calls.length = 0;
    handle.setVolume(1);
    handle.stop();
    expect(calls).toEqual([]);
  });
});
