import { describe, expect, it } from 'vitest';
import { TrailHistory } from '../../src/presentation/babylon/trailHistory';

const point = (x: number) => ({ x, y: 1, z: 0 });
function flight(fps: number) {
  const history = new TrailHistory();
  history.start(point(0));
  for (let frame = 1; frame <= fps; frame++) history.advance(1 / fps, point(20 * frame / fps));
  return history;
}

describe('dash trail history', () => {
  it('retains the same 0.2 seconds of flight at 30, 60 and 120 fps', () => {
    for (const fps of [30, 60, 120]) {
      const samples = flight(fps).samples();
      expect(samples.length).toBeGreaterThan(2);
      expect(samples[0].position.x).toBeCloseTo(16, 6);
      expect(samples.at(-1)!.position.x).toBeCloseTo(20, 6);
      expect(samples[0].strength).toBeCloseTo(0, 6);
      expect(samples.at(-1)!.strength).toBeCloseTo(1, 6);
      expect(samples.length).toBeLessThanOrEqual(27);
    }
  });

  it('leaves the stopped tail in place while it fades, then expires', () => {
    const history = flight(60);
    history.stop();
    history.advance(0.1, point(50));
    expect(history.samples().at(-1)!.position.x).toBeCloseTo(20);
    expect(history.samples().at(-1)!.strength).toBeCloseTo(0.5);
    history.advance(0.1, point(60));
    expect(history.samples()).toEqual([]);
  });

  it('starts a fresh dash at its new position without connecting old history', () => {
    const history = flight(60);
    history.stop();
    history.start(point(100));
    history.advance(0.05, point(101));
    expect(history.samples().length).toBeGreaterThan(0);
    expect(history.samples().every((s) => s.position.x >= 100)).toBe(true);
    history.reset();
    expect(history.samples()).toEqual([]);
  });

  it('breaks a teleport during an active dash instead of drawing a long bridge', () => {
    const history = flight(60);
    history.advance(1 / 60, point(100));
    expect(history.samples().length).toBeGreaterThan(0);
    expect(history.samples().every((s) => s.position.x >= 100)).toBe(true);
  });

  it('bounds history even at high frame rates or after a stalled frame', () => {
    const history = flight(1000);
    expect(history.samples().length).toBeGreaterThan(0);
    expect(history.samples().length).toBeLessThanOrEqual(27);
    history.advance(20, point(20));
    expect(history.samples().length).toBeGreaterThan(0);
    expect(history.samples().length).toBeLessThanOrEqual(27);
    expect(history.samples().every((s) => Number.isFinite(s.strength))).toBe(true);
  });
});
