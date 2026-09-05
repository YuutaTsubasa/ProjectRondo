export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const ZERO3: Vec3 = vec3(0, 0, 0);

// No `add`, unlike `vec2.ts`: `vec2.add` is load-bearing (`vec2.moveToward` calls it), but nothing in
// `src/` ever needed to add two Vec3s — every 3D consumer only subtracts (an offset), scales (a
// velocity) or measures (length/dot). Add it back the day something needs it rather than for parity
// with a sibling module that has an actual caller for its own copy.
export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => vec3(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const lengthSquared = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const length = (a: Vec3): number => Math.sqrt(lengthSquared(a));

export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  // Intentional: return ZERO3 (not NaN) for a zero vector, the same convention `vec2.normalize`
  // documents. Callers here guard against zero before it matters — `homingTarget` treats a
  // zero-length direction as "not in the cone" — and NaN would silently propagate through the
  // comparison instead of failing.
  return len === 0 ? ZERO3 : scale(a, 1 / len);
};
