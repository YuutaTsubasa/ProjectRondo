/**
 * The hub's one wind direction, in the XZ plane. It is a fact about the hub world, not about the
 * shader that reads it, which is why it sits in the domain.
 *
 * **Unit length, and load-bearing.** 0.8^2 + 0.6^2 = 1 exactly, and `wind.ts` uses this pair twice in
 * the same shader: once as the phase direction, where the length rescales what `SPATIAL_FREQ` means,
 * and once as the displacement direction, where it rescales the amplitude every call site was tuned
 * against. A plausible-looking edit to (1, 1) would strengthen the wind by 41% while looking like a
 * direction change. `tests/domain/hub/windDirection.test.ts` pins the length so it cannot.
 */
export const WIND_DIRECTION_X = 0.8;
export const WIND_DIRECTION_Z = 0.6;
