// Pure procedural terrain height — NO babylon imports, so it unit-tests in the node env and
// scatter/trees can sample it to sit on the surface. Deterministic (seeded), reproducible.

export const FIELD = 50; // terrain spans FIELD x FIELD, centred on the origin
export const FLAT_RADIUS = 10; // near-flat play area within this radius of the centre
export const EDGE_RADIUS = 24; // hills reach full amplitude by here (inside the ±25 walls)
export const AMPLITUDE = 5; // maximum hill height, world units
const NOISE_FREQ = 0.12; // lattice cells per world unit (smaller = broader, gentler hills)
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

/** Smooth value noise in [0,1): bilinear blend of four lattice values, smoothstep-eased. */
function valueNoise(x: number, z: number): number {
  const gx = x * NOISE_FREQ;
  const gz = z * NOISE_FREQ;
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

/** 0 inside FLAT_RADIUS, easing to 1 by EDGE_RADIUS — flat centre, raised rim. */
function falloff(r: number): number {
  if (r <= FLAT_RADIUS) return 0;
  if (r >= EDGE_RADIUS) return 1;
  return smoothstep((r - FLAT_RADIUS) / (EDGE_RADIUS - FLAT_RADIUS));
}

/** Ground height at world (x, z): flat centre, hills toward the edges. Pure & deterministic. */
export function terrainHeight(x: number, z: number): number {
  return falloff(Math.hypot(x, z)) * AMPLITUDE * valueNoise(x, z);
}
