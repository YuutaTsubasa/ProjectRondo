import { CreateAudioEngineAsync } from '@babylonjs/core/AudioV2/webAudio/webAudioEngine';
// The Create*Async factories all live in audioEngineV2, not beside the types they return.
import { CreateAudioBusAsync } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import type { AudioBus } from '@babylonjs/core/AudioV2/abstractAudio/audioBus';
import type { AudioEngineV2 } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';

import { busGain, DEFAULT_LEVELS, type MixerLevels } from '../../domain/audio/audioMixer';
import type { AudioBusId } from '../../domain/audio/soundCue';

const BUS_IDS: readonly AudioBusId[] = ['music', 'sfx', 'ambience'];

export interface GameAudio {
  readonly engine: AudioEngineV2;
  readonly buses: Record<AudioBusId, AudioBus>;
  /** Pushes a mix down onto the buses. */
  applyLevels(levels: MixerLevels): void;
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
 */
export async function createGameAudio(levels: MixerLevels = DEFAULT_LEVELS): Promise<GameAudio> {
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

  const buses = Object.fromEntries(
    BUS_IDS.map((id, i) => [id, created[i].value] as const),
  ) as Record<AudioBusId, AudioBus>;

  const applyLevels = (next: MixerLevels) => {
    for (const id of BUS_IDS) buses[id].volume = busGain(next, id);
  };
  applyLevels(levels);

  return {
    engine,
    buses,
    applyLevels,
    dispose: () => {
      for (const id of BUS_IDS) buses[id].dispose();
      engine.dispose();
    },
  };
}
