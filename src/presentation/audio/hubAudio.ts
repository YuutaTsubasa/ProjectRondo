import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import type { Nullable } from '@babylonjs/core/types';

import { createFootstepCadence } from '../../domain/audio/footstepCadence';
import { cadenceSample } from '../../domain/audio/locomotionGait';
import type { MusicScene } from '../../domain/audio/musicDirector';
import { surfaceCue } from '../../domain/audio/soundCue';
import { WALK_THRESHOLD, type Knight, type KnightMotionSample } from '../babylon/knight';
import { createGameAudio } from './audioEngine';
import { phaseOf, weightOf } from './clipSample';
import { createMusicCrossfade } from './musicCrossfade';
import { loadSoundBank, type SoundBank } from './soundBank';

/**
 * Playback rates for the two jump cues, which share the armour sample with the footstep layer.
 * Up for the push-off, down for the landing — see the call site.
 */
const JUMP_RATE = 1.12;
const LAND_RATE = 0.88;

/**
 * The events that count as the user gesture a browser wants before it will start an AudioContext.
 *
 * Listened to directly rather than through `createInput`: the unlock has to be retried on *any*
 * interaction with the page, including the ones gameplay input deliberately ignores while the AVG
 * overlay owns the keyboard — which is exactly when the first click of a session arrives.
 */
const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

export interface HubAudio {
  setMusicScene(scene: MusicScene): void;
  dispose(): void;
}

/**
 * Connects the scene to the audio.
 *
 * The only file that touches both, on purpose: `hubScene.ts` gains one construction and one dispose
 * call, which keeps this feature's footprint on a file another branch is also editing down to
 * something a rebase resolves on sight.
 *
 * **Synchronous, and deliberately so: nothing about the scene may wait on audio.** The graph is built
 * in the background and this returns a handle to it immediately. `createHubScene` used to `await` the
 * build, which put every asset in the manifest on the critical path of scene startup — and the two
 * `streaming: true` music cues resolve only on their media element's `canplaythrough`, so a browser
 * that defers media loading before a user gesture, or a hung connection, leaves that `await` pending
 * *forever*: no `runRenderLoop`, no resolved `createHubScene`, and the blank canvas `docs/HANDOFF.md`
 * §3 describes. Careful handling of the rejection path does nothing for a promise that never settles;
 * not waiting does. It also stops first render queueing behind 7,217,303 B of music — 7.2 MB decimal
 * (hub_theme 3.39 MB + avg_theme 3.83 MB), 6.9 MiB as the design spec's §5.4 table counts it — both
 * tracks copied verbatim from their sources (see `tools/audio/preprocess.mjs`), and none of it needed
 * until after the first click.
 *
 * A failure in the background build therefore means a silent game, not a broken one — the same
 * contract as before, now with "never settles" covered as well as "rejects".
 *
 * `motion` is the reading the animation layer already takes — the *same* function `hubScene` hands to
 * `driveKnightAnimation`, not a second one built beside it. `groundContact.ts` exists because two
 * consumers deciding "is it on the ground" independently drifted apart, and planar speed beside it is
 * the same shape of duplication: sound and pose answer "how fast, and airborne?" from one reading or
 * they will eventually answer it differently.
 */
export function createHubAudio(
  scene: Scene,
  motion: () => KnightMotionSample,
  knight: Knight,
): HubAudio {
  let live: HubAudio | null = null;
  let disposed = false;
  let pending: MusicScene | null = null;

  const start = async () => {
    try {
      const audio = await buildHubAudio(scene, motion, knight);
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

async function buildHubAudio(
  scene: Scene,
  motion: () => KnightMotionSample,
  knight: Knight,
): Promise<HubAudio> {
  const audio = await createGameAudio();

  // Everything built below this point has to be torn down if a later step throws — otherwise a
  // failure at, say, the sound bank leaves the AudioContext and every decoded cue alive for the life
  // of the page: the caller's catch only logs, so nothing built before the throw is ever reachable
  // again. Tracked here and released in the `catch` below, before the error is rethrown.
  let bank: SoundBank | undefined;
  // `Observable.add`'s last overload already returns `Nullable<Observer<T>>`, so this is the type the
  // `add` below hands back, written under the name babylon gives it rather than derived through a
  // `ReturnType` that then re-adds the `null` it already contained.
  let observer: Nullable<Observer<Scene>> = null;

  try {
    // A `const` alias, taken right after the assignment above: `bank` itself stays `| undefined` so
    // the `catch` below can tell whether it needs disposing, but every use inside this closure below
    // wants the narrowed, definitely-assigned type.
    const soundBank = (bank = await loadSoundBank(audio));

    // Music is deferred until the audio engine actually unlocks. The tracks are *streaming* sounds
    // — HTMLMediaElements — and a browser rejects their playback outright before a user gesture,
    // rather than scheduling it on a suspended context the way a decoded buffer is. `App.svelte` asks
    // for the intro track the moment the scene finishes loading, which is long before the player has
    // clicked anything, so without this the request lands in the one window where it cannot be
    // honoured and is never retried. `musicCrossfade` holds the request until `unlock()` says it can
    // be honoured; everything about *how* one track hands over to the next lives in there, where a
    // test can reach it without a scene.
    const crossfade = createMusicCrossfade(soundBank);

    const cadence = createFootstepCadence();
    let wasAirborne = motion().airborne;

    observer = scene.onBeforeRenderObservable.add(() => {
      const elapsed = scene.getEngine().getDeltaTime() / 1000;
      // One reading, shared with the animation layer — see this module's doc comment.
      const { planarSpeed, airborne } = motion();

      // Take-off and landing ride the edges of the same `airborne` flag the jump clip uses, rather
      // than a second reading of the ground probe. `groundContact.ts` exists because two consumers
      // deciding "is it grounded" independently drifted apart; sound and pose stay on one source.
      //
      // Both are the one armour sample, so the playback rate is the only thing telling them apart —
      // without it a jump is the same 0.145 s clip twice, 1.6 dB apart, which reads as one event
      // stuttering rather than as leaving the ground and arriving back on it. Up for the push-off,
      // down for the landing: the shift is what makes one read as lighter and the other as heavier,
      // and ±12 % is about as far as it goes before it stops sounding like the same armour.
      if (airborne !== wasAirborne) {
        soundBank.play(airborne ? 'jump.takeoff' : 'jump.land', {
          playbackRate: airborne ? JUMP_RATE : LAND_RATE,
        });
      }
      wasAirborne = airborne;

      const { walk, run } = knight.animations;
      // Which clip to believe, and whether the character is moving at all, is decided by
      // `cadenceSample` in the domain — see its doc comment for why each of those readings is a
      // separate failure. This callback's job is only to take the readings.
      const fall = cadence.step(
        cadenceSample({
          speed: planarSpeed,
          walkThreshold: WALK_THRESHOLD,
          walkWeight: weightOf(walk),
          runWeight: weightOf(run),
          walkPhase: phaseOf(walk),
          runPhase: phaseOf(run),
          airborne,
          elapsed,
        }),
      );
      if (!fall) return;
      // Two layers, one footfall: the armour on the character and the surface under it.
      soundBank.play('footstep.armour', { playbackRate: fall.playbackRate, gain: fall.volume });
      soundBank.play(surfaceCue('grass'), {
        playbackRate: fall.playbackRate,
        gain: fall.volume,
        variant: fall.foot === 'left' ? 0 : 1,
      });
    });

    // Retried on every gesture rather than latched on one promise. `unlockAsync()` is `resumeAsync()`,
    // i.e. a bare `audioContext.resume()` issued before any user gesture: older Safari *rejects* that
    // outright, and a browser that defers media loading can leave it pending indefinitely. Either way
    // a single attempt would leave the game silent for the session even though `resumeOnInteraction`
    // resumes the context for real on the very next click. The engine's own state-change observable
    // would be the event to listen to, but it is `@internal` on `_WebAudioEngine` and absent from the
    // `AudioEngineV2` type this module holds, so the gesture itself is what we can subscribe to.
    const tryUnlock = async () => {
      await audio.engine.unlockAsync();
      stopWatchingForGestures();
      crossfade.unlock();
    };
    const onGesture = () => {
      void tryUnlock().catch((error: unknown) =>
        console.warn('[audio] unlock retry failed; waiting for the next gesture:', error),
      );
    };
    const stopWatchingForGestures = () => {
      for (const type of GESTURE_EVENTS) document.removeEventListener(type, onGesture);
    };
    for (const type of GESTURE_EVENTS) document.addEventListener(type, onGesture);
    void tryUnlock().catch((error: unknown) =>
      console.warn('[audio] engine not unlocked yet; music waits for the first gesture:', error),
    );

    return {
      setMusicScene(next) {
        crossfade.setScene(next);
      },
      dispose() {
        stopWatchingForGestures();
        if (observer) scene.onBeforeRenderObservable.remove(observer);
        // Before the bank: the crossfade's outgoing handles and their timers have to be released
        // while the sounds they name are still alive.
        crossfade.dispose();
        soundBank.dispose();
        audio.dispose();
      },
    };
  } catch (error) {
    // Tear down whatever got built before the throw — see the comment above this `try` — then rethrow
    // so the caller logs it and the game simply stays silent.
    if (observer) scene.onBeforeRenderObservable.remove(observer);
    bank?.dispose();
    audio.dispose();
    throw error;
  }
}
