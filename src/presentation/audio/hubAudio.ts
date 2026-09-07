import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import type { Nullable } from '@babylonjs/core/types';

import { createFootstepCadence } from '../../domain/audio/footstepCadence';
import { cadenceSample } from '../../domain/audio/locomotionGait';
import { surfaceCue } from '../../domain/audio/soundCue';
import { createVariantRotation } from '../../domain/audio/variantRotation';
import { WALK_THRESHOLD, type Knight, type KnightMotionSample } from '../babylon/knight';
import { createGameAudio } from './audioEngine';
import { phaseOf, weightOf } from './clipSample';
import { createDeferredAudio, type DeferredAudio } from './deferredAudio';
import { jumpSoundFrom, stepJumpSound, type JumpSoundState } from './jumpSound';
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

/**
 * What `hubScene` holds. The same shape the deferral speaks, named here so the scene keeps importing
 * the handle from the module that builds it.
 */
export type HubAudio = DeferredAudio;

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
 * The bookkeeping that deferral needs — holding a `setMusicScene` that arrives before the build
 * finishes, and disposing a graph whose build outlived the scene — lives in `deferredAudio.ts`, where
 * a test can reach it without a `Scene`. All that is left here is what the build itself needs.
 *
 * `motion` is the reading the animation layer already takes — the *same* function `hubScene` hands to
 * `driveKnightAnimation`, not a second one built beside it. `groundContact.ts` exists because two
 * consumers deciding "is it on the ground" independently drifted apart, and planar speed beside it is
 * the same shape of duplication: sound and pose answer "how fast, and off the ground?" from one
 * source, and through one rule — `jumpSound.ts` and `jumpPose.ts` both widen `airborne` via the same
 * `isOffGround` — or they will eventually answer it differently.
 */
export function createHubAudio(
  scene: Scene,
  motion: () => KnightMotionSample,
  knight: Knight,
): HubAudio {
  return createDeferredAudio(() => buildHubAudio(scene, motion, knight));
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

    // The manifest gives some cues several files — `ui.type` has four — and `soundBank.play` picks
    // by an index its caller supplies, so something has to count. It counts on this side rather than
    // at the call site because how many recordings back a cue is the manifest's business: the
    // dialogue UI asks for "a typing tick" and has no reason to learn there are four of them. The
    // counting itself is in the domain, for the same reason the crossfade above is its own module —
    // nothing in here is reachable by a test without a scene.
    const variants = createVariantRotation();

    const cadence = createFootstepCadence();
    // Seeded from the first sample rather than from a standing pose — see `jumpSoundFrom`.
    let jumpSound: JumpSoundState = jumpSoundFrom(motion());

    observer = scene.onBeforeRenderObservable.add(() => {
      const elapsed = scene.getEngine().getDeltaTime() / 1000;
      // The same `motion` the animation layer reads, called again here — see this module's doc
      // comment. One source, two readings a frame; not one reading shared between them.
      const sample = motion();
      const { planarSpeed } = sample;

      // Take-off and landing ride the edges of the same widened off-ground signal the jump clip's
      // pose rides, not the bare `airborne` flag: the support probe finds floor mid-dash and beside a
      // low crystal, so `airborne` goes false for single frames in the middle of a flight. See
      // `jumpSound.ts` for what those frames sound like when this layer trusts it.
      //
      // Both cues are the one armour sample, so the playback rate is the only thing telling them
      // apart — without it a jump is the same 0.145 s clip twice, 1.6 dB apart, which reads as one
      // event stuttering rather than as leaving the ground and arriving back on it. Up for the
      // push-off, down for the landing: the shift is what makes one read as lighter and the other as
      // heavier, and ±12 % is about as far as it goes before it stops sounding like the same armour.
      const jump = stepJumpSound(jumpSound, sample);
      jumpSound = jump.state;
      const { offGround } = jump.state;
      if (jump.cue) {
        soundBank.play(jump.cue, {
          playbackRate: jump.cue === 'jump.takeoff' ? JUMP_RATE : LAND_RATE,
        });
      }

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
          // The cadence's "no footfalls while the feet are not on the ground" gate, so it is fed the
          // same widened signal the cues above ride — on the bare flag, a dash's skim frame and a
          // low-crystal arrival un-gate the run cadence at `homingSpeed` for as long as the
          // locomotion weights stay up.
          airborne: offGround,
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
      play(cue) {
        soundBank.play(cue, { variant: variants.next(cue) });
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
