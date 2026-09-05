import { CreateAudioEngineAsync } from '@babylonjs/core/AudioV2/webAudio/webAudioEngine';
// The Create*Async factories all live in audioEngineV2, not beside the types they return.
import { CreateAudioBusAsync } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import type { AudioBus } from '@babylonjs/core/AudioV2/abstractAudio/audioBus';
import type { AudioEngineV2 } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';

import { busGain, DEFAULT_LEVELS } from '../../domain/audio/audioMixer';
import type { AudioBusId } from '../../domain/audio/soundCue';

const BUS_IDS: readonly AudioBusId[] = ['music', 'sfx', 'ambience'];

export interface GameAudio {
  readonly engine: AudioEngineV2;
  readonly buses: Record<AudioBusId, AudioBus>;
  dispose(): void;
}

/**
 * Builds the audio graph: one engine, three buses.
 *
 * Browsers refuse to start an audio context without a user gesture. `resumeOnInteraction` (AudioV2's
 * default, set explicitly here because it is load-bearing) hangs the unlock off the first click, and
 * the game already requires one — to capture the mouse for gameplay, and to advance the AVG intro.
 * Until then everything below runs normally and is simply inaudible; nothing throws and nothing has
 * to be retried.
 *
 * `disableDefaultUI` turns off babylon's own "click to start audio" overlay, which would otherwise
 * paint a button over the canvas for a gesture the game is already collecting.
 *
 * The buses are set from `DEFAULT_LEVELS` once, here, and nothing can move them afterwards: there is
 * no settings UI (spec §9), so a `levels` parameter and an `applyLevels` on the handle would be a
 * wrapper with no caller — one that reads as "the mix is adjustable" when the only mix that can ever
 * reach the buses is the default. `busGain` stays the one place a bus gain is computed, so the panel,
 * when it is built, adds the way *in* rather than the rules.
 */
export async function createGameAudio(): Promise<GameAudio> {
  const engine = await CreateAudioEngineAsync({
    resumeOnInteraction: true,
    disableDefaultUI: true,
  });

  // `allSettled`, not `all`: a rejection here has to leave nothing behind, and this is the one place
  // that can. `buildHubAudio`'s own guard only starts once this function has *resolved*, so a throw
  // from inside it reaches the caller with no handle to the engine awaited above — an `AudioContext`
  // that then survives for the life of the page. `all` would also reject on the first bus while its
  // siblings were still in flight, and it does not cancel them, so the buses that did resolve would
  // be stranded on an engine nobody can reach. Waiting for all three is what makes them disposable.
  const settled = await Promise.allSettled(BUS_IDS.map((id) => CreateAudioBusAsync(id, {}, engine)));
  const created = settled.filter((r): r is PromiseFulfilledResult<AudioBus> => r.status === 'fulfilled');
  const failed = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed.length > 0) {
    for (const r of created) r.value.dispose();
    engine.dispose();
    throw failed[0].reason;
  }

  // Paired against `settled`, not against `created`: `Promise.allSettled` resolves in *input* order,
  // so `settled[i]` is the result for `BUS_IDS[i]` by construction of the map above and by nothing
  // else. Indexing `created` would line up only for as long as the throw above keeps the two arrays
  // the same length — a proof from six lines away, and one that stops holding the moment that throw
  // is relaxed to tolerate a partial failure.
  const buses = Object.fromEntries(
    BUS_IDS.map((id, i) => {
      const result = settled[i];
      // Not reachable: the throw above leaves nothing rejected. This is the narrowing, written as the
      // check it is so the pairing does not depend on the reader remembering that.
      if (result.status === 'rejected') throw result.reason;
      return [id, result.value] as const;
    }),
  ) as Record<AudioBusId, AudioBus>;

  for (const id of BUS_IDS) buses[id].volume = busGain(DEFAULT_LEVELS, id);

  return {
    engine,
    buses,
    dispose: () => {
      for (const id of BUS_IDS) buses[id].dispose();
      engine.dispose();
    },
  };
}
