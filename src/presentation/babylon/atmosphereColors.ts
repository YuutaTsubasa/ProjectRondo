/**
 * Colours shared between the sky gradient (`environment.ts`) and the fog (`postProcessing.ts`).
 *
 * These two live in different modules on purpose — one builds the sky, the other owns the frame —
 * but the horizon stop and the fog colour are not independent: fog is what the distant mountains
 * dissolve *into*, so any mismatch shows up as a visible band where the ridge meets the sky. Keeping
 * the value in one place means the two cannot drift apart silently.
 */

/** The pale horizon colour, and therefore the fog colour. */
export const HORIZON_HEX = '#dcecf7';
