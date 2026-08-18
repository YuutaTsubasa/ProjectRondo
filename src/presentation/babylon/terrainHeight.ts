// Pure procedural terrain height — NO babylon imports, so it unit-tests in the node env and
// scatter/trees can sample it to sit on the surface. Deterministic (seeded), reproducible.
//
// Two layers, summed:
//   • a gentle BASE roll applied EVERYWHERE (incl. the centre) so the ground never reads as a
//     dead-flat plane, and
//   • bigger HILLS that a radial falloff keeps out of the central play area and ramps up toward the
//     rim — the "central-flatter, hills around the edges" shape.

export const FIELD = 50; // terrain spans FIELD x FIELD, centred on the origin
export const FLAT_RADIUS = 8; // big hills stay outside this central play radius…
export const EDGE_RADIUS = 24; // …and reach full amplitude by here (inside the ±25 walls)
export const AMPLITUDE = 6; // max additional hill height toward the rim, world units
const HILL_FREQ = 0.09; // broad edge hills
export const BASE_AMPLITUDE = 2.0; // rolling undulation everywhere (± this), so nowhere is dead-flat
const BASE_FREQ = 0.13; // broad wavelength → visible rolling hills, not fine bumps
const SEED = 1337;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Deterministic hashed value in [0,1) at integer lattice point (ix, iz). */
function latticeValue(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + SEED) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1) at world (x,z) sampled on a lattice of the given frequency:
 *  bilinear blend of four lattice values, smoothstep-eased. */
function valueNoise(x: number, z: number, freq: number): number {
  const gx = x * freq;
  const gz = z * freq;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const fx = smoothstep(gx - x0);
  const fz = smoothstep(gz - z0);
  const v00 = latticeValue(x0, z0);
  const v10 = latticeValue(x0 + 1, z0);
  const v01 = latticeValue(x0, z0 + 1);
  const v11 = latticeValue(x0 + 1, z0 + 1);
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fz;
}

/** 0 inside FLAT_RADIUS, easing to 1 by EDGE_RADIUS — keeps the big hills off the centre. */
function falloff(r: number): number {
  if (r <= FLAT_RADIUS) return 0;
  if (r >= EDGE_RADIUS) return 1;
  return smoothstep((r - FLAT_RADIUS) / (EDGE_RADIUS - FLAT_RADIUS));
}

/** Ground height at world (x, z): gentle roll everywhere + bigger hills toward the edges. Pure &
 *  deterministic. Can dip slightly below 0 (shallow hollows) — roughly [-BASE_AMPLITUDE,
 *  AMPLITUDE + BASE_AMPLITUDE]. */
export function terrainHeight(x: number, z: number): number {
  const base = BASE_AMPLITUDE * (valueNoise(x, z, BASE_FREQ) - 0.5) * 2;
  // Offset the hill lattice so the two layers don't share their peaks.
  const hills = falloff(Math.hypot(x, z)) * AMPLITUDE * valueNoise(x + 100, z - 100, HILL_FREQ);
  return base + hills;
}
