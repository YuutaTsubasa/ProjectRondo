import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createMusicCrossfade, type MusicBank } from '../../src/presentation/audio/musicCrossfade';
import { CROSSFADE_SECONDS } from '../../src/domain/audio/musicDirector';
import type { SoundCue } from '../../src/domain/audio/soundCue';
import type { LoopHandle } from '../../src/presentation/audio/soundBank';

/**
 * Pins the ordering of the crossfade.
 *
 * `musicDirector.test.ts` covers the pure decision (which track, or none); `soundBank.test.ts` covers
 * the bank's half of the contract (one owner per sound, retired handles no-op). Neither exercises the
 * sequence that *consumes* them — start the incoming track at zero, ramp it up, ramp the outgoing one
 * down, stop it only once its fade has run — and every way of getting that wrong is silent: no throw,
 * no warning, just a track nobody hears. That is what took a review cycle to find by ear the first
 * time (design spec §4.4), and it is the reason the sequence lives in its own module.
 *
 * The bank is a fake that records calls in order. It can be: `createMusicCrossfade` takes the bank as
 * an argument and only ever calls `startLoop`, so nothing here needs an `AudioContext` — which is also
 * what keeps this reachable at all, since the real caller sits behind a babylon `Scene` and a loaded
 * knight.
 */

interface Call {
  readonly kind: 'startLoop' | 'setVolume' | 'stop';
  readonly cue: SoundCue;
  readonly level?: number;
  readonly fadeSeconds?: number;
}

const calls: Call[] = [];
/** Cues whose `startLoop` must return `null`, as the bank does for an asset that never loaded. */
const missing = new Set<SoundCue>();

const bank: MusicBank = {
  startLoop(cue, options = {}) {
    if (missing.has(cue)) return null;
    calls.push({ kind: 'startLoop', cue, level: options.level });
    // Handed straight to the crossfade and not kept here: every assertion in this file reads `calls`,
    // so a second copy of the handle would be state the test maintains for nothing.
    const handle: LoopHandle = {
      setVolume: (level, fadeSeconds = 0) => calls.push({ kind: 'setVolume', cue, level, fadeSeconds }),
      stop: () => calls.push({ kind: 'stop', cue }),
    };
    return handle;
  },
};

const kinds = () => calls.map((c) => `${c.kind} ${c.cue}`);

beforeEach(() => {
  vi.useFakeTimers();
  calls.length = 0;
  missing.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the music crossfade', () => {
  it('holds the scene asked for while the engine is still locked', () => {
    const music = createMusicCrossfade(bank);

    // The order `App.svelte` produces: it asks for the intro theme as soon as the scene resolves,
    // which is normally before the player has clicked anything. Dropping the request here is a
    // session with no music at all, and nothing ever asks again.
    music.setScene('intro');
    expect(calls).toEqual([]);

    music.unlock();
    expect(kinds()).toEqual(['startLoop music.avg', 'setVolume music.avg']);
  });

  it('starts a track silent and ramps it up', () => {
    const music = createMusicCrossfade(bank);
    music.unlock();
    music.setScene('playing');

    // Started at 0 and ramped: starting at the manifest level would be a cut. `level` (not a play
    // gain) is what the ramp can actually move — see `soundBank.ts`'s `startLoop`.
    expect(calls[0]).toEqual({ kind: 'startLoop', cue: 'music.hub', level: 0 });
    expect(calls[1]).toEqual({
      kind: 'setVolume',
      cue: 'music.hub',
      level: 1,
      fadeSeconds: CROSSFADE_SECONDS,
    });
  });

  it('overlaps the two tracks and stops the outgoing one only once its fade has run', () => {
    const music = createMusicCrossfade(bank);
    music.unlock();
    music.setScene('intro');
    calls.length = 0;

    music.setScene('playing');
    // Incoming first, then the outgoing ramp: the reverse order is a gap of silence between them.
    expect(kinds()).toEqual(['startLoop music.hub', 'setVolume music.hub', 'setVolume music.avg']);
    expect(calls[2]).toEqual({
      kind: 'setVolume',
      cue: 'music.avg',
      level: 0,
      fadeSeconds: CROSSFADE_SECONDS,
    });

    // Still playing while it fades. Stopping it at the handover is the audible bug this ordering
    // exists to avoid, and it would look exactly like a working crossfade in the call log otherwise.
    vi.advanceTimersByTime(CROSSFADE_SECONDS * 1000 - 1);
    expect(calls.some((c) => c.kind === 'stop')).toBe(false);

    vi.advanceTimersByTime(1);
    expect(calls.filter((c) => c.kind === 'stop')).toEqual([{ kind: 'stop', cue: 'music.avg' }]);
  });

  it('does nothing when asked for the track already playing', () => {
    const music = createMusicCrossfade(bank);
    music.unlock();
    music.setScene('intro');
    calls.length = 0;

    // A repeated request must not restart the track from the top, nor race a second fade against the
    // one in flight. `App.svelte` produces exactly this: `finishIntro` asks for 'playing', and so does
    // the scene-load callback when the intro was skipped before the scene resolved.
    music.setScene('intro');
    music.unlock();
    expect(calls).toEqual([]);
  });

  it('retries a track whose cue never loaded', () => {
    const music = createMusicCrossfade(bank);
    missing.add('music.avg');
    music.unlock();
    music.setScene('intro');
    expect(calls).toEqual([]);

    // Recorded as "nothing is playing", not as the track we asked for — otherwise a cue that failed
    // to load once would read as already playing and never be attempted again.
    missing.clear();
    music.setScene('playing');
    music.setScene('intro');
    expect(kinds()).toEqual([
      'startLoop music.hub',
      'setVolume music.hub',
      'startLoop music.avg',
      'setVolume music.avg',
      'setVolume music.hub',
    ]);
  });

  it('stops both tracks on dispose and cancels the fade timer', () => {
    const music = createMusicCrossfade(bank);
    music.unlock();
    music.setScene('intro');
    music.setScene('playing');
    calls.length = 0;

    music.dispose();
    expect(kinds().sort()).toEqual(['stop music.avg', 'stop music.hub']);

    // The timer would otherwise fire up to a full fade after teardown, into a sound the bank has
    // already disposed. In dev that is every HMR reload that lands mid-crossfade.
    calls.length = 0;
    vi.advanceTimersByTime(CROSSFADE_SECONDS * 1000);
    expect(calls).toEqual([]);
  });
});
