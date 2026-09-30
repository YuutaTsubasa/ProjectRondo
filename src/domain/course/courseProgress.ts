import type { Vec3 } from '../math/vec3';
import type { CourseGate } from './courseLayout';

export interface CourseRun {
  readonly checkpoint: number;
  readonly elapsed: number;
  readonly falls: number;
  readonly finished: boolean;
}
export const createCourseRun = (): CourseRun => ({ checkpoint: 0, elapsed: 0, falls: 0, finished: false });
interface CourseFrame { position: Vec3; grounded: boolean; dt: number; active: boolean }

/** Progress depends on a grounded arrival, so flying past or beneath a gate cannot skip a section. */
export function stepCourseRun(run: CourseRun, frame: CourseFrame, gates: readonly CourseGate[], killY: number): { run: CourseRun; respawn: Vec3 | null } {
  if (!frame.active || run.finished) return { run, respawn: null };
  const dt = Number.isFinite(frame.dt) ? Math.max(0, Math.min(.1, frame.dt)) : 0;
  const elapsed = run.elapsed + dt;
  if (frame.position.y < killY) {
    return { run: { ...run, elapsed, falls: run.falls + 1 }, respawn: gates[run.checkpoint]!.spawn };
  }
  const next = gates[run.checkpoint + 1];
  const p = frame.position;
  const arrived = next && frame.grounded && Math.abs(p.x - next.center.x) <= next.halfWidth
    && Math.abs(p.z - next.center.z) <= next.halfDepth && Math.abs(p.y - next.center.y) <= .65;
  const checkpoint = run.checkpoint + (arrived ? 1 : 0);
  return { run: { ...run, elapsed, checkpoint, finished: checkpoint === gates.length - 1 }, respawn: null };
}
