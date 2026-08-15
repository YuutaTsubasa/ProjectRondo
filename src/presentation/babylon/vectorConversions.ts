import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { type Vec3 } from '../../domain/math/vec3';

/** Domain velocity/position → babylon world vector. */
export const toBabylon = (v: Vec3): Vector3 => new Vector3(v.x, v.y, v.z);
