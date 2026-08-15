import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { vec3, type Vec3 } from '../../domain/math/vec3';

/** Domain velocity/position → babylon world vector. */
export const toBabylon = (v: Vec3): Vector3 => new Vector3(v.x, v.y, v.z);

/** Babylon world vector → domain velocity/position (e.g. the controller's post-solve velocity). */
export const toVec3 = (v: Vector3): Vec3 => vec3(v.x, v.y, v.z);
