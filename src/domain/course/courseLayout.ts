import { type Vec3, vec3 } from '../math/vec3';

export interface CourseGate {
  readonly label: string;
  /** Standing capsule-center height, rather than the surface height. */
  readonly center: Vec3;
  readonly halfWidth: number;
  readonly halfDepth: number;
  /** Capsule-center spawn, with a small settling clearance above the standing height. */
  readonly spawn: Vec3;
}
export interface CoursePlatform {
  readonly id: string;
  /** X/Z midpoint and Y of the flat walkable top. */
  readonly center: Vec3;
  readonly width: number;
  readonly depth: number;
}

/** One forward route: meadow, broken bridge, crystal ravine, then mixed ruins. */
export const COURSE_PLATFORMS = [
  { id: 'meadow', center: vec3(0, 0, 14), width: 18, depth: 40 },
  { id: 'bridge-a', center: vec3(0, 0, 40.75), width: 9, depth: 8.5 },
  { id: 'bridge-b', center: vec3(1, 0, 51.75), width: 9, depth: 8.5 },
  { id: 'bridge-c', center: vec3(-1, 0, 62.75), width: 10, depth: 8.5 },
  { id: 'ravine-bank', center: vec3(0, 0, 80), width: 18, depth: 21 },
  { id: 'far-bank', center: vec3(0, 0.4, 126), width: 20, depth: 21 },
  { id: 'ruin-step', center: vec3(2, 0.7, 142.25), width: 10, depth: 6.5 },
  { id: 'ruin-island', center: vec3(3, 0.9, 153.25), width: 14, depth: 10.5 },
  { id: 'arch-island', center: vec3(0, 0.8, 193), width: 24, depth: 29 },
] as const satisfies readonly CoursePlatform[];

/** Links state the intended traversal, so reachability tests follow the actual authored route. */
export const COURSE_JUMPS = [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7]] as const;
export const COURSE_CHAINS = [
  { from: 4, to: 5, crystals: [0, 1, 2, 3] },
  { from: 7, to: 8, crystals: [4, 5, 6, 7] },
] as const;
export const COURSE_CRYSTALS: readonly Vec3[] = [
  vec3(0, 2.2, 95), vec3(0.5, 2.5, 101), vec3(-0.5, 2.6, 107), vec3(0, 2.5, 114),
  vec3(2.5, 3, 163), vec3(1.5, 3.2, 169), vec3(0.5, 3.1, 175), vec3(0, 2.8, 181),
];

/** Authored capsule centers; layout tests pin these against the presentation capsule dimensions. */
export const COURSE_GATES = [
  { label: '草坡起跑', center: vec3(0, 1, 0), halfWidth: 4, halfDepth: 3, spawn: vec3(0, 1.3, 0) },
  { label: '斷橋彼端', center: vec3(0, 1, 80), halfWidth: 5, halfDepth: 3, spawn: vec3(0, 1.3, 80) },
  { label: '渡谷成功', center: vec3(0, 1.4, 126.5), halfWidth: 5, halfDepth: 3, spawn: vec3(0, 1.7, 126.5) },
  { label: '遺跡終點', center: vec3(0, 1.8, 199), halfWidth: 4, halfDepth: 3, spawn: vec3(0, 2.1, 199) },
] as const satisfies readonly [CourseGate, ...CourseGate[]];
export const COURSE_SPAWN: Vec3 = COURSE_GATES[0].spawn;
export const COURSE_KILL_Y = -12;
