/**
 * Every sound the game can ask for, by name.
 *
 * A closed union rather than free strings: the manifest is typed as `Record<SoundCue, CueSpec>`, so
 * adding a cue here fails the build until it has a file behind it, and a typo in a call site is a
 * type error instead of a sound that silently never plays.
 */
export type SoundCue =
  | 'footstep.armour'
  | 'footstep.grass'
  | 'jump.takeoff'
  | 'jump.land'
  | 'ui.type'
  | 'ui.move'
  | 'ui.confirm'
  | 'music.hub'
  | 'music.avg';

/** The three mix groups. Master is the engine's own output, not a bus. */
export type AudioBusId = 'music' | 'sfx' | 'ambience';

/**
 * What the character is walking on. One surface today; the cue is derived rather than hard-coded so
 * a stone plaza or shallow water is a manifest entry plus a case here, not a redesign.
 */
export type SurfaceKind = 'grass';

/** The surface layer that plays *under* `footstep.armour` for a footfall. */
export const surfaceCue = (surface: SurfaceKind): SoundCue => `footstep.${surface}`;
