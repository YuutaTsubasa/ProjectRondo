// The Create*Async factories all live in audioEngineV2, not beside the types they return.
import { CreateSoundAsync, CreateStreamingSoundAsync } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import type { StaticSound } from '@babylonjs/core/AudioV2/abstractAudio/staticSound';
import type { StreamingSound } from '@babylonjs/core/AudioV2/abstractAudio/streamingSound';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

import type { SoundCue } from '../../domain/audio/soundCue';
import type { GameAudio } from './audioEngine';
import { MANIFEST, type CueSpec } from './manifest';

/** A running looped sound. */
export interface LoopHandle {
  /** Ramps to a new volume, or sets it immediately when `fadeSeconds` is 0. */
  setVolume(value: number, fadeSeconds?: number): void;
  stop(): void;
}

export interface PlayOptions {
  readonly playbackRate?: number;
  /** Scales the manifest volume, for per-instance jitter. */
  readonly gain?: number;
  /** Which variant to use; wraps, so a running counter is fine. */
  readonly variant?: number;
  readonly position?: Vector3;
}

export interface SoundBank {
  /** Plays a one-shot. A no-op for a cue that failed to load. */
  play(cue: SoundCue, options?: PlayOptions): void;
  /** Starts a loop, or returns `null` for a cue that failed to load. */
  startLoop(cue: SoundCue, options?: PlayOptions): LoopHandle | null;
  dispose(): void;
}

type Loaded = readonly (StaticSound | StreamingSound)[];

const load = async (audio: GameAudio, cue: SoundCue, spec: CueSpec): Promise<Loaded | null> => {
  try {
    const sounds = await Promise.all(
      spec.files.map((file) =>
        spec.streaming
          ? CreateStreamingSoundAsync(cue, file, { outBus: audio.buses[spec.bus] }, audio.engine)
          : CreateSoundAsync(
              cue,
              file,
              {
                outBus: audio.buses[spec.bus],
                ...(spec.spatial
                  ? {
                      spatialEnabled: true,
                      spatialDistanceModel: 'linear' as const,
                      spatialMaxDistance: spec.spatial.maxDistance,
                    }
                  : {}),
              },
              audio.engine,
            ),
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

  return {
    play(cue, options = {}) {
      const sound = pick(cue, options.variant);
      if (!sound) return;
      const spec = MANIFEST[cue];
      if (options.position) sound.spatial.position = options.position;
      if (options.playbackRate !== undefined && 'playbackRate' in sound)
        (sound as StaticSound).playbackRate = options.playbackRate;
      sound.play({ volume: spec.volume * (options.gain ?? 1) });
    },

    startLoop(cue, options = {}) {
      const sound = pick(cue, options.variant);
      if (!sound) return null;
      const spec = MANIFEST[cue];
      if (options.position) sound.spatial.position = options.position;
      sound.play({ loop: true, volume: spec.volume * (options.gain ?? 1) });
      return {
        setVolume: (value, fadeSeconds = 0) => {
          // AudioV2 throws when a ramp is requested while one is already in progress. A zero-length
          // change is therefore set outright rather than ramped over the default 10 ms, and the
          // catch covers the other half of the same hazard: two fades landing on one sound inside
          // each other's window. Snapping to the value is the right degradation — a volume change
          // is never worth throwing out of a render frame, or into App.svelte's uncaught `.then`.
          try {
            if (fadeSeconds > 0) sound.setVolume(value, { duration: fadeSeconds });
            else sound.volume = value;
          } catch {
            sound.volume = value;
          }
        },
        stop: () => sound.stop(),
      };
    },

    dispose() {
      for (const sounds of loaded.values()) for (const s of sounds) s.dispose();
      loaded.clear();
    },
  };
}
