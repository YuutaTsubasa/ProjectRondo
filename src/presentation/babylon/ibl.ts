/**
 * The one image-based-lighting plate, and the two numbers that describe how it is used. Both levels
 * light the same knight with it, so they are shared rather than restated (principle 6): they were
 * byte-for-byte copies in `environment.ts` and `towerScene.ts`, with a comment in the tower asserting
 * that they matched and nothing holding them to it — and {@link IBL_INTENSITY}'s own doc asks for a
 * re-measurement on a character swap, which is exactly the edit that would have moved one and left
 * the other lighting the same armour at a different brightness.
 *
 * What is NOT here is how each scene builds its lighting. `createEnvironment` also raises a skydome,
 * tints an ambient to a horizon colour and aims a sun at a hub, none of which belong in a tower; the
 * tower keeps its own construction and its own failure warning. Only the three values that describe
 * the shared asset moved.
 */

/** Cube-map face size the panorama is resampled to for image-based lighting. 128 is plenty: the
 *  environment is only ever seen as a *reflection* on the armour (the skydome is a separate unlit
 *  mesh), and metal reflections are prefiltered/blurred by roughness, so a larger map buys nothing
 *  visible while costing load-time convolution and memory. */
export const IBL_FACE_SIZE = 128;

/** The panorama. Named so each scene's failure warning can quote the path it actually asked for. */
export const IBL_URL = '/env/studio.hdr';

/** Scales the environment's contribution to every PBR material. 1.0 would be the panorama's own baked
 *  radiance; 1.4 is tuned live against the armour mask.
 *
 *  **This doc is the one place the shipped plate's brightness is recorded.** Measured during this
 *  branch's tuning pass on the stylized-knight armour, hide-the-body diff mask (85 687 px), scene
 *  frozen, at `BODY_METALLIC = 1` and `BODY_DIRECT_INTENSITY = 1`: the plate's mean luma is ~117/255,
 *  up from ~113 at IBL 1.0 — matching the pre-IBL brightness the old no-environment workaround reached
 *  — with blown highlights at 0% (1.6 starts clipping them) and ~2% of pixels below luma 30, down from
 *  7.7% pre-IBL.
 *
 *  It says "one place" because there were three, in two files, and they disagreed: this ~117, a second
 *  ~117 on `BODY_DIRECT_INTENSITY`, and a `BODY_METALLIC` note recording the same shipped configuration
 *  as 114.3 — which then justified this 1.4 as compensating for the ~4 luma between them, so the two
 *  numbers were arguing in a circle. None of the three could be re-measured while reconciling them (the
 *  mask measurement needs the scene running), so the pair that agreed is what survives, stated once,
 *  here. Treat it as inherited from that tuning pass rather than independently confirmed.
 *
 *  This is the lever to reach for if the plate reads too hot or too dim — and, for the panorama's own
 *  levels, the only one: `public/env/studio.hdr` is a committed binary with no committed generator (see
 *  `public/env/CREDITS.md`), so it cannot be re-baked brighter or darker. Prefer it over the
 *  per-material `BODY_METALLIC` too, which stays at the physically-correct 1 now that there is an
 *  environment to reflect (see `knight.ts`). The figures move with the model, so re-measure on a
 *  character swap — in one place, which is why this constant lives here rather than in each scene. */
export const IBL_INTENSITY = 1.4;
