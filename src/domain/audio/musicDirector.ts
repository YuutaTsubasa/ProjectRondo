import type { SoundCue } from './soundCue';

/** What the game is doing, as far as the music is concerned. */
export type MusicScene = 'intro' | 'playing';

/** How long a track takes to hand over. Long enough to be a fade rather than a cut. */
export const CROSSFADE_SECONDS = 1.5;

export interface MusicChange {
  readonly track: SoundCue;
  readonly fadeSeconds: number;
}

const TRACKS: Record<MusicScene, SoundCue> = {
  intro: 'music.avg',
  playing: 'music.hub',
};

/**
 * What should change about the music, given what is playing now.
 *
 * Returns `null` when nothing should change, which is the whole point: the caller polls this every
 * time the game state might have moved and only acts on a non-null answer, so it cannot restart a
 * track that is already playing or fire a second crossfade into the one it just started. AudioV2 does
 * *not* throw if a volume ramp is requested while another is in progress — it silently cancels the
 * in-flight ramp and replaces it (see `soundBank.ts`'s `LoopHandle.setVolume`) — so a crash was never
 * the risk. The risk `null` avoids is restarting an already-playing track from its beginning and
 * racing a freshly-started fade against one that was already running, which is audible even though
 * neither half of it throws.
 */
export const musicChange = (playing: SoundCue | null, scene: MusicScene): MusicChange | null => {
  const track = TRACKS[scene];
  return playing === track ? null : { track, fadeSeconds: CROSSFADE_SECONDS };
};
