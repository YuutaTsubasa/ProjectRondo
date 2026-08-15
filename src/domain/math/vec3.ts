export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const ZERO3: Vec3 = vec3(0, 0, 0);
