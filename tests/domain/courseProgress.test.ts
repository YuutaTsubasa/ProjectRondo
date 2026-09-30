import { describe, expect, it } from 'vitest';
import { createCourseRun, stepCourseRun } from '../../src/domain/course/courseProgress';
const gates = [0, 10, 20].map(z => ({ label: `gate ${z}`, center: { x: 0, y: 1, z }, halfWidth: 2, halfDepth: 2, spawn: { x: 0, y: 1.2, z } }));
const input = (z: number, grounded = true, y = 1) => ({ position: { x: 0, y, z }, grounded, dt: .05, active: true });
describe('course progress', () => {
  it('requires ordered grounded arrivals within the actual gate, not just forward distance', () => {
    const start = createCourseRun();
    expect(stepCourseRun(start, input(20), gates, -10).run.finished).toBe(false);
    expect(stepCourseRun(start, input(10, false), gates, -10).run.checkpoint).toBe(0);
    expect(stepCourseRun(start, { ...input(10), position: { x: 4, y: 1, z: 10 } }, gates, -10).run.checkpoint).toBe(0);
    expect(stepCourseRun(start, input(10, true, 5), gates, -10).run.checkpoint).toBe(0);
    const arrived = stepCourseRun(start, input(10), gates, -10).run;
    expect(arrived.checkpoint).toBe(1);
    expect(stepCourseRun(arrived, input(0), gates, -10).run.checkpoint).toBe(1);
  });
  it('respawns at the last checkpoint with elapsed time and fall count preserved', () => {
    const arrived = stepCourseRun(createCourseRun(), input(10), gates, -10).run;
    const fell = stepCourseRun(arrived, input(16, false, -11), gates, -10);
    expect(fell.respawn).toEqual(gates[1]!.spawn);
    expect(fell.run).toMatchObject({ checkpoint: 1, falls: 1, elapsed: .1, finished: false });
    expect(stepCourseRun(fell.run, input(10), gates, -10).run.falls).toBe(1);
  });
  it('latches completion and stops timer, falls and gates after finishing', () => {
    const middle = stepCourseRun(createCourseRun(), input(10), gates, -10).run;
    const done = stepCourseRun(middle, input(20), gates, -10).run;
    expect(done.finished).toBe(true);
    expect(done.elapsed).toBe(.1);
    expect(stepCourseRun(done, input(0, false, -20), gates, -10)).toEqual({ run: done, respawn: null });
    expect(createCourseRun()).toEqual({ checkpoint: 0, elapsed: 0, falls: 0, finished: false });
  });
  it('freezes while paused and rejects invalid or stalled frame times', () => {
    const start = createCourseRun();
    expect(stepCourseRun(start, { ...input(10), active: false }, gates, -10).run).toBe(start);
    expect(stepCourseRun(start, { ...input(0), dt: 30 }, gates, -10).run.elapsed).toBe(.1);
    expect(stepCourseRun(start, { ...input(0), dt: NaN }, gates, -10).run.elapsed).toBe(0);
  });
});
