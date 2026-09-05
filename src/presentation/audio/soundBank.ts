// The Create*Async factories all live in audioEngineV2, not beside the types they return.
import { CreateSoundAsync, CreateStreamingSoundAsync } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import type { StaticSound } from '@babylonjs/core/AudioV2/abstractAudio/staticSound';
import type { StreamingSound } from '@babylonjs/core/AudioV2/abstractAudio/streamingSound';
import { AudioParameterRampShape } from '@babylonjs/core/AudioV2/audioParameter';

import type { SoundCue } from '../../domain/audio/soundCue';
import type { GameAudio } from './audioEngine';
import { MANIFEST, type CueSpec } from './manifest';

/**
 * A running looped sound.
 *
 * **A handle stops being that the moment the same sound is started again**, and both of its methods
 * then do nothing — see {@link SoundBank.startLoop}. Without that, a handle would outlive what it
 * names: neither method can reach a single *instance* (AudioV2 gives none out — `play()` returns
 * `void`), so `stop()` stops every instance of the sound and `setVolume` writes the sound's one volume
 * subnode. Two live handles over one sound would be two names for the same thing, each believing it
 * held its own: their fades would cancel each other on the same param, and whichever stopped first
 * would silence the other's track.
 */
export interface LoopHandle {
  /**
   * Ramps this cue's volume to `level` × its manifest volume, or sets it immediately when
   * `fadeSeconds` is 0 or omitted.
   *
   * `level` is a 0-1 **fraction of the cue's manifest volume**, not an absolute gain: a caller fading
   * a loop in or out never needs to know what that manifest volume actually is, and the manifest stays
   * the one place the mix balance lives.
   */
  setVolume(level: number, fadeSeconds?: number): void;
  stop(): void;
}

export interface PlayOptions {
  /**
   * Retunes the cue before playing it.
   *
   * **This is a property of the cue, not of this one play.** AudioV2 carries `playbackRate` only on
   * `StaticSound` (`IStaticSoundStoredOptions`); `IStaticSoundPlayOptions` has no such field and
   * `AbstractSound.play()` returns `void`, so there is no instance handle to set it on — the setter
   * writes through to every instance of that cue currently sounding. Two overlapping plays of the
   * *same* cue therefore share whichever rate was set last; `gain` below is the one that is genuinely
   * per-instance.
   */
  readonly playbackRate?: number;
  /** Scales the manifest volume, for per-instance jitter. */
  readonly gain?: number;
  /** Which variant to use; wraps, so a running counter is fine. */
  readonly variant?: number;
}

export interface LoopOptions {
  /**
   * The level to start at, as a fraction of the cue's manifest volume — **the same units
   * {@link LoopHandle.setVolume} takes**, so `startLoop(cue, { level: 0 })` followed by
   * `setVolume(1, fade)` is a fade in from silence to the manifest level and back again.
   *
   * Deliberately not the `gain` a one-shot takes: `gain` is a per-instance scale that stays applied,
   * and a start gain that `setVolume` then ignored would make `setVolume(1)` jump somewhere the
   * caller did not ask for. Defaults to 1.
   */
  readonly level?: number;
  /** Which variant to use; wraps, so a running counter is fine. */
  readonly variant?: number;
}

export interface SoundBank {
  /** Plays a one-shot. A no-op for a cue that failed to load. */
  play(cue: SoundCue, options?: PlayOptions): void;
  /**
   * Starts a loop, or returns `null` for a cue that failed to load.
   *
   * **One loop per sound.** Starting a loop that is already running stops it first and retires the
   * handle that was holding it, so the caller ends up with exactly one live handle over that sound
   * rather than two aliases of it — see {@link LoopHandle}. A retired handle's `setVolume` and `stop`
   * become no-ops, which is what lets a crossfade's outgoing handle and its teardown timer stay
   * harmless after the cue they were fading has been taken over by a newer play of it.
   */
  startLoop(cue: SoundCue, options?: LoopOptions): LoopHandle | null;
  dispose(): void;
}

type Sound = StaticSound | StreamingSound;
type Loaded = readonly Sound[];

const load = async (audio: GameAudio, cue: SoundCue, spec: CueSpec): Promise<Loaded | null> => {
  try {
    const sounds = await Promise.all(
      spec.files.map((file) =>
        spec.streaming
          ? CreateStreamingSoundAsync(cue, file, { outBus: audio.buses[spec.bus] }, audio.engine)
          : CreateSoundAsync(cue, file, { outBus: audio.buses[spec.bus] }, audio.engine),
      ),
    );
    return sounds;
  } catch (error) {
    // The one and only failure path, and it is deliberately not fatal. `loadKnight` rejecting on an
    // unpulled LFS pointer takes the whole scene down with it (docs/HANDOFF.md §3); audio must not
    // add a second instance of that. One warning, then silence for this cue only — which is also
    // what lets the system ship and be verified before every asset is final.
    console.warn(`[audio] cue "${cue}" unavailable, it will be silent:`, error);
    return null;
  }
};

/**
 * Loads every cue in the manifest.
 *
 * Resolves once all of them have either loaded or failed. It never rejects: a caller that has to
 * remember to `.catch` is the failure mode this is avoiding.
 */
export async function loadSoundBank(audio: GameAudio): Promise<SoundBank> {
  const cues = Object.keys(MANIFEST) as SoundCue[];
  const loaded = new Map<SoundCue, Loaded>();
  await Promise.all(
    cues.map(async (cue) => {
      const sounds = await load(audio, cue, MANIFEST[cue]);
      if (sounds) loaded.set(cue, sounds);
    }),
  );

  const pick = (cue: SoundCue, variant = 0) => {
    const sounds = loaded.get(cue);
    return sounds ? sounds[variant % sounds.length] : null;
  };

  // The handle currently holding each looping sound, keyed by the sound itself rather than by the cue
  // because variants of one cue are separate sounds with separate volume subnodes. `startLoop` retires
  // whatever it finds here before taking the sound over; a retired handle's methods return early, so
  // the sound has exactly one owner at a time. See LoopHandle's doc comment for what goes wrong
  // otherwise — two handles over one music track is reachable today through `setMusicScene`, whose
  // crossfade holds the outgoing handle for 1.5 s after starting the next track.
  const owner = new Map<Sound, { held: boolean }>();

  return {
    // `play` and `startLoop` (and the `stop`/`setVolume` a loop hands back) run from
    // `scene.onBeforeRenderObservable` in hubAudio.ts. `Observable.notifyObservers` does not catch
    // observer exceptions, and `AbstractEngine._renderLoop` calls `_processFrame` — which is what runs
    // that observable — *before* it queues the next frame, so one uncaught throw here does not just
    // drop a sound, it stops the render loop permanently. Babylon's own AudioV2 sound instances throw
    // synchronously from exactly this position: `_WebAudioStaticSoundInstance._initSourceNode` /
    // `_deinitSourceNode` throw `Error("Connect failed")` / `"Disconnect failed"` when the underlying
    // node is in a state that cannot be connected or disconnected. Every call into a sound below is
    // therefore guarded, and the guard is what stands between one bad node and a frozen game.
    play(cue, options = {}) {
      const sound = pick(cue, options.variant);
      if (!sound) return;
      const spec = MANIFEST[cue];
      try {
        if (options.playbackRate !== undefined && 'playbackRate' in sound)
          (sound as StaticSound).playbackRate = options.playbackRate;
        sound.play({ volume: spec.volume * (options.gain ?? 1) });
      } catch (error) {
        console.warn(`[audio] cue "${cue}" failed to play:`, error);
      }
    },

    startLoop(cue, options = {}) {
      const sound = pick(cue, options.variant);
      if (!sound) return null;
      const spec = MANIFEST[cue];
      // Take the sound over from whoever held it. Stopping it here is not the same as leaving the
      // previous handle to stop it later: `play` below starts a fresh instance regardless, and a
      // retired handle's timer firing mid-fade would otherwise stop *this* one too.
      const previous = owner.get(sound);
      if (previous) {
        previous.held = false;
        try {
          sound.stop();
        } catch (error) {
          console.warn(`[audio] cue "${cue}" failed to stop before restarting:`, error);
        }
      }
      const held = { held: true };
      owner.set(sound, held);
      try {
        // **A loop's level lives on the sound, not on the instance.** `play({ volume })` sets a
        // per-instance GainNode that *multiplies* the sound's own volume subnode, and the
        // `setVolume` handed back below ramps the latter — so a loop started with an instance gain
        // of 0 can never be faded up, and stays silent for good however far the ramp travels. That
        // is exactly how the music was silenced when the crossfade was first written. A loop has one
        // instance, so nothing is lost by putting its level on the sound; `play` above keeps using
        // the instance gain, which is what lets overlapping footsteps each carry their own.
        sound.setVolume(spec.volume * (options.level ?? 1), { shape: AudioParameterRampShape.None });
        sound.play({ loop: true });
      } catch (error) {
        console.warn(`[audio] cue "${cue}" failed to start looping:`, error);
        held.held = false;
        owner.delete(sound);
        return null;
      }
      return {
        setVolume: (level, fadeSeconds = 0) => {
          if (!held.held) return;
          const target = spec.volume * level;
          try {
            // Verified against @babylonjs/core@9.21.0's `_WebAudioParameterComponent.setTargetValue`
            // (which both `sound.setVolume` and `sound.volume =` end up calling): it does *not* throw
            // when a ramp is requested while another is already in progress. Its first act is
            // `this._param.cancelScheduledValues(0)`, so the in-flight ramp is silently cancelled and
            // replaced — the hazard is a fade quietly getting cut off and restarted, not an exception.
            // `sound.volume = target` goes through the same path with no options, which defaults to a
            // *linear ramp* over `engine.parameterRampDuration`, not an immediate set — so the genuinely
            // immediate path is `setVolume` with `shape: None`, which assigns the underlying param
            // directly. The try/catch is still worth keeping for the reason `play`/`startLoop` above
            // are guarded: this call happens inside the same render-frame callback, and a torn-down
            // audio node can still throw synchronously regardless of the ramp semantics.
            if (fadeSeconds > 0) sound.setVolume(target, { duration: fadeSeconds });
            else sound.setVolume(target, { shape: AudioParameterRampShape.None });
          } catch (error) {
            // Retrying with `sound.volume = target` would just re-run the call that failed against the
            // same node — not a genuinely different operation — so this gives up on the change instead
            // of risking a second throw out of the render frame.
            console.warn(`[audio] cue "${cue}" volume change failed:`, error);
          }
        },
        stop: () => {
          if (!held.held) return;
          held.held = false;
          owner.delete(sound);
          try {
            sound.stop();
          } catch (error) {
            console.warn(`[audio] cue "${cue}" failed to stop:`, error);
          }
        },
      };
    },

    dispose() {
      // Retire every outstanding handle first: `hubAudio` keeps a crossfade's outgoing handle in a
      // timer that it cancels on teardown, but a handle can also be held by a caller this bank never
      // sees, and calling one after its sound is disposed is exactly the throw the guards above exist
      // for. Retired, it is a no-op instead.
      for (const held of owner.values()) held.held = false;
      owner.clear();
      for (const sounds of loaded.values()) for (const s of sounds) s.dispose();
      loaded.clear();
    },
  };
}
