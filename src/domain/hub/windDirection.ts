/**
 * The hub's one wind direction, in the XZ plane, unit length — 0.8^2 + 0.6^2 = 1 exactly.
 *
 * Lives in the domain so it has exactly one definition: `src/presentation/babylon/wind.ts` (the
 * shader that bends grass, flowers and trees) and `src/domain/hub/butterfly.ts` (the wander path,
 * stretched along the wind) both import these two numbers instead of each hand-keeping its own copy.
 * The domain may not import from `src/presentation/`, but presentation may import the domain freely —
 * so putting the direction here, rather than in `wind.ts`, is the only placement the dependency
 * direction allows both consumers to share.
 */
export const WIND_DIRECTION_X = 0.8;
export const WIND_DIRECTION_Z = 0.6;
