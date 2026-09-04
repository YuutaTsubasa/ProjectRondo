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

  const entries = await Promise.all(
    BUS_IDS.map(async (id) => [id, await CreateAudioBusAsync(id, {}, engine)] as const),
  );
  const buses = Object.fromEntries(entries) as Record<AudioBusId, AudioBus>;

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
