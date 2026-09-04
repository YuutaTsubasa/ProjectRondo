import type { AudioBusId, SoundCue } from '../../domain/audio/soundCue';

export interface CueSpec {
  /** One entry per variant; a cue with several is chosen from by the caller. */
  readonly files: readonly string[];
  readonly bus: AudioBusId;
  /**
   * Playback volume. Every one-shot ships peak-normalised to −3 dBFS (`tools/audio/preprocess.mjs`),
   * so the balance between sounds lives here and nowhere else — re-cutting one asset cannot silently
   * change the level of the others.
   */
  readonly volume: number;
  readonly loop?: boolean;
  /** Streamed rather than decoded up front. For the multi-megabyte music tracks. */
  readonly streaming?: boolean;
  /** Present ⇒ positioned in the world. The file must be mono; a stereo buffer cannot be panned. */
  readonly spatial?: { readonly maxDistance: number };
}

const AUDIO = '/audio';

/**
 * Every cue, and the file behind it.
 *
 * Typed as a total record over `SoundCue`, so a cue added to the union fails the build here until it
 * has a file — rather than becoming a call site that silently plays nothing.
 */
export const MANIFEST: Record<SoundCue, CueSpec> = {
  // The armour layer plays on every footfall, on take-off and on landing: it is the only armour
  // sample there is, and playback-rate jitter is what stops that reading as a machine gun.
  'footstep.armour': { files: [`${AUDIO}/sfx/armor_step.ogg`], bus: 'sfx', volume: 0.45 },
  // Two variants, one per foot. Soft and long rather than percussive — the source was continuous
  // grass rustle, not discrete steps (spec §5.1).
  'footstep.grass': {
    files: [`${AUDIO}/sfx/footstep_grass_01.ogg`, `${AUDIO}/sfx/footstep_grass_02.ogg`],
    bus: 'sfx',
    volume: 0.25,
  },
  'jump.takeoff': { files: [`${AUDIO}/sfx/armor_step.ogg`], bus: 'sfx', volume: 0.5 },
  'jump.land': { files: [`${AUDIO}/sfx/armor_step.ogg`], bus: 'sfx', volume: 0.6 },

  // Lowest of all the one-shots: this is the most frequently repeated sound in the game.
  'ui.type': {
    files: [
      `${AUDIO}/sfx/ui_type_01.ogg`,
      `${AUDIO}/sfx/ui_type_02.ogg`,
      `${AUDIO}/sfx/ui_type_03.ogg`,
      `${AUDIO}/sfx/ui_type_04.ogg`,
    ],
    bus: 'sfx',
    volume: 0.3,
  },
  'ui.move': { files: [`${AUDIO}/sfx/ui_move.ogg`], bus: 'sfx', volume: 0.5 },
  'ui.confirm': { files: [`${AUDIO}/sfx/ui_confirm.ogg`], bus: 'sfx', volume: 0.6 },

  'ambience.wind': { files: [`${AUDIO}/ambience/wind_field.ogg`], bus: 'ambience', volume: 0.35, loop: true },
  // Positioned at the pond. maxDistance is a little past the pond's radius of 12, so the sound is
  // gone by the time the water is a feature in the distance rather than a place you are standing at.
  'ambience.water': {
    files: [`${AUDIO}/ambience/water_pond.ogg`],
    bus: 'ambience',
    volume: 0.6,
    loop: true,
    spatial: { maxDistance: 30 },
  },

  'music.hub': { files: [`${AUDIO}/music/hub_theme.mp3`], bus: 'music', volume: 0.5, loop: true, streaming: true },
  'music.avg': { files: [`${AUDIO}/music/avg_theme.mp3`], bus: 'music', volume: 0.55, loop: true, streaming: true },
};
