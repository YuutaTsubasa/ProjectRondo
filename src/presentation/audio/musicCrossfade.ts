import { musicChange, type MusicScene } from '../../domain/audio/musicDirector';
import type { SoundCue } from '../../domain/audio/soundCue';
import type { LoopHandle, SoundBank } from './soundBank';

/** The one thing a crossfade needs from the bank. Narrowed so a test can hand it a recording fake. */
export type MusicBank = Pick<SoundBank, 'startLoop'>;

export interface MusicCrossfade {
  /**
   * Asks for a scene's track. Held, not dropped, while the engine is still locked: `App.svelte` asks
   * for the intro theme the moment the scene resolves, which is normally before the first click.
   */
  setScene(scene: MusicScene): void;
  /** Called once the audio engine has unlocked, which is when a held request can finally be honoured. */
  unlock(): void;
  /** Stops the current track and every crossfade still in flight, cancelling their timers. */
  dispose(): void;
}

/**
 * The music crossfade: which track is playing, and the handover between two of them.
 *
 * **Its own module because the sequence below is load-bearing and every way of getting it wrong is
 * silent** — no throw, no warning, just a track nobody hears, which by ear is easy to mistake for an
 * asset problem. It cost this feature a whole review cycle once already (§4.4 of the design spec).
 * Lifted out of `hubAudio` so it can be pinned by a test against a fake bank: `hubAudio` itself needs
 * a live babylon `Scene`, a loaded knight and a real `AudioContext` before a single line of this runs,
 * so in there this logic is only reachable by ear.
 *
 * What the tests hold still, in order:
 *
 * - Nothing starts before `unlock()`; the scene asked for meanwhile is applied when it arrives.
 * - A track starts at `level: 0` and is ramped up from there — starting it at its manifest level and
 *   fading the old one out would be a bump, not a crossfade.
 * - The incoming track starts *before* the outgoing one is ramped down, and the outgoing one keeps
 *   playing until its fade has fully run: it is stopped by the timer, not at handover.
 * - Asking for the track already playing does nothing (`musicChange` returns `null`), so a repeated
 *   request cannot restart a track from the top or race a second fade against the one in flight.
 */
export function createMusicCrossfade(bank: MusicBank): MusicCrossfade {
  let unlocked = false;
  let desired: MusicScene | null = null;
  let music: LoopHandle | null = null;
  let playingTrack: SoundCue | null = null;
  // Crossfades still running, each with the timer that ends it. Held so `dispose` can both stop the
  // outgoing track — nothing else references it once the fade has moved on to the new handle — and
  // cancel the timer, which would otherwise fire up to `fadeSeconds` after teardown against a sound
  // the bank has already disposed, logging a stop failure from a scene that no longer exists and
  // keeping the handle alive until it did. In dev that is every HMR reload landing mid-crossfade.
  const fadingOut = new Map<LoopHandle, ReturnType<typeof setTimeout>>();

  const apply = () => {
    if (!unlocked || desired === null) return;
    const change = musicChange(playingTrack, desired);
    if (!change) return;

    // A real crossfade, not a cut: the outgoing track keeps playing while the new one fades in
    // under it, and only stops once it has faded fully out.
    const outgoing = music;
    music = bank.startLoop(change.track, { level: 0 });
    // `null` when the cue never loaded. Recording it as "nothing is playing" rather than as the track
    // we asked for is what lets a later request try it again instead of deciding it is already on.
    playingTrack = music ? change.track : null;
    music?.setVolume(1, change.fadeSeconds);

    if (!outgoing) return;
    outgoing.setVolume(0, change.fadeSeconds);
    fadingOut.set(
      outgoing,
      setTimeout(() => {
        outgoing.stop();
        fadingOut.delete(outgoing);
      }, change.fadeSeconds * 1000),
    );
  };

  return {
    setScene(next) {
      desired = next;
      apply();
    },
    unlock() {
      unlocked = true;
      apply();
    },
    dispose() {
      music?.stop();
      music = null;
      playingTrack = null;
      for (const [handle, timer] of fadingOut) {
        clearTimeout(timer);
        handle.stop();
      }
      fadingOut.clear();
    },
  };
}
