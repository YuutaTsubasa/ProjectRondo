/**
 * The rock/stone diffuse colour.
 *
 * Shared between the scattered rocks (`scatter.ts`) and the plaza's stone colonnade (`landmark.ts`).
 * The landmark is deliberately built to read as the same material as the rocks scattered across the
 * hub — one grade of stone, not two — so the two are not independent: retuning one without the other
 * would silently break the match and leave the plaza looking like a different kind of rock. One
 * definition means the two cannot drift apart silently.
 */
export const ROCK_DIFFUSE_RGB: [number, number, number] = [0.55, 0.54, 0.52];
