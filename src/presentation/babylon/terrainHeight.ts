// Pure procedural terrain height — NO babylon imports, so it unit-tests in the node env and
// scatter/trees can sample it to sit on the surface. Deterministic (seeded), reproducible.
//
// Three layers, summed, by distance r from the centre:
//   • a gentle BASE roll everywhere (never a dead-flat plane),
//   • falloff-gated HILLS across the wide walkable belt (FLAT_RADIUS…EDGE_RADIUS, ≤ ~30°), and
//   • a steep BARRIER rim (EDGE_RADIUS…BARRIER_TOP) that rises past the character controller's
//     walkable slope — the natural boundary that encloses the field instead of an invisible wall.

export const FIELD = 100; // terrain spans FIELD x FIELD, centred on the origin
export const FLAT_RADIUS = 14; // near-flat play area within this radius of the centre
export const EDGE_RADIUS = 42; // walkable hills reach full amplitude here; the barrier begins here
export const AMPLITUDE = 5.5; // max walkable hill height, world units
const HILL_FREQ = 0.05; // long wavelength → broad, walkable hills (physical feature size, not scaled)
export const BASE_AMPLITUDE = 1.8; // rolling undulation everywhere (± this)
const BASE_FREQ = 0.075;
const SEED = 1337;
const LAYER_DECORRELATION = 100; // offsets the hill lattice so the two noise layers don't share peaks
export const BARRIER_TOP = 48; // barrier reaches full height here, then plateaus to the rim
export const BARRIER_HEIGHT = 12; // steep unwalkable rise (>60°) that walls the field with landscape

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

/** 0 inside EDGE_RADIUS, rising STEEPLY to BARRIER_HEIGHT by BARRIER_TOP (then flat) — the unwalkable
 *  rim that encloses the field. Its mid-slope exceeds the controller's 60° walkable limit. */
function barrierRamp(r: number): number {
  if (r <= EDGE_RADIUS) return 0;
  if (r >= BARRIER_TOP) return BARRIER_HEIGHT;
  return smoothstep((r - EDGE_RADIUS) / (BARRIER_TOP - EDGE_RADIUS)) * BARRIER_HEIGHT;
}

/** Ground height at world (x, z): gentle roll everywhere + walkable hills + a steep rim barrier.
 *  Pure & deterministic. Range ≈ [-BASE_AMPLITUDE, AMPLITUDE + BASE_AMPLITUDE + BARRIER_HEIGHT]. */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const base = BASE_AMPLITUDE * (valueNoise(x, z, BASE_FREQ) - 0.5) * 2;
  const hills = falloff(r) * AMPLITUDE * valueNoise(x + LAYER_DECORRELATION, z - LAYER_DECORRELATION, HILL_FREQ);
  return base + hills + barrierRamp(r);
}
