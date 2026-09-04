/**
 * The hub's one wind direction, in the XZ plane, unit length — 0.8^2 + 0.6^2 = 1 exactly.
 *
 * Lives in the domain so it has exactly one definition: `src/presentation/babylon/wind.ts` (the
 * shader that bends grass, flowers and trees) and `src/presentation/babylon/clouds.ts` (which rotates
 * the cloud dome about the axis perpendicular to this) both import these two numbers instead of each
 * hand-keeping its own copy.
 *
 * It sits in the domain rather than in `wind.ts` because a domain consumer used to need it too — the
 * butterfly wander path, since removed. Both remaining consumers are presentation, so `wind.ts` would
 * now be a legal home as well; it stays here because the wind direction is a fact about the hub world
 * rather than about the shader that happens to read it, and moving it back would only re-create the
 * choice the next time anything pure needs to know which way the wind blows.
 */
export const WIND_DIRECTION_X = 0.8;
export const WIND_DIRECTION_Z = 0.6;
