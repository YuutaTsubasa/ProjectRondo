/**
 * A body of standing water, as plain data. Engine-agnostic on purpose: `water.ts` builds the mesh
 * from this, and shallow-water feedback (splashes, slowdown, wet shading) should read the same shape
 * rather than re-deriving the pond's geometry from the mesh.
 *
 * That feedback is NOT built, and it is not P4's — P4 shipped as wind and clouds, and shallow
 * water was ruled out of it because it is movement feel and would reach into the pure movement domain
 * (`2026-09-04-life-and-motion-design.md` §1). This shape is still the right one for whoever does
 * build it; it just has no scheduled owner.
 */
export interface WaterBody {
  readonly centreX: number;
  readonly centreZ: number;
  /**
   * Radius of the *rendered surface*, deliberately larger than the flooded contour (~8.7 units).
   * Where terrain rises above `surfaceY` it occludes the water, so an oversized disc disappears
   * into the bank, while an undersized one would leave a visible gap at the shoreline.
   */
  readonly radius: number;
  readonly surfaceY: number;
}

/**
 * The hub's pond. Centre and radius come from flood-filling the basin at the surface height, not from
 * eyeballing the lowest point: at y = −0.95 the connected flooded region is 238 cells spanning
 * x −23..−9, with its centroid at (−15.3, −4.8). Centring on the lowest *point* instead put the disc
 * 2–3 units off, leaving a fifth of its rim underwater — a visible gap at the shoreline.
 *
 * Radius 12 is the smallest that keeps the whole rim on dry land, which is what lets the bank occlude
 * it. 0.58 m at the deepest — knee-height on the ~1.9-unit knight — so it wades.
 *
 * ~16 units from spawn, and 38 from the plaza in `landmark.ts`, so the two destinations do not crowd.
 */
export const POND: WaterBody = {
  centreX: -15,
  centreZ: -5,
  radius: 12,
  surfaceY: -0.95,
};
