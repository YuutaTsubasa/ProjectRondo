export interface TrailPosition { readonly x: number; readonly y: number; readonly z: number }
export interface TrailSample { readonly position: TrailPosition; readonly strength: number }
interface TimedPoint { readonly position: TrailPosition; readonly time: number }

const LIFETIME = 0.2;
const INTERVAL = 1 / 120;
const EPSILON = 1e-8;
const interpolate = (a: TrailPosition, b: TrailPosition, t: number): TrailPosition => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
});

/** Fixed-time samples keep the same visible path at different render rates. Positions are world-space. */
export class TrailHistory {
  private clock = 0;
  private nextSample = 0;
  private recording = false;
  private points: TimedPoint[] = [];
  private latest: TimedPoint | null = null;

  start(position: TrailPosition): void {
    this.reset();
    this.recording = true;
    this.latest = { position: { x: position.x, y: position.y, z: position.z }, time: this.clock };
    this.points.push(this.latest);
    this.nextSample = this.clock + INTERVAL;
  }

  stop(): void { this.recording = false; }

  reset(): void {
    this.recording = false;
    this.points.length = 0;
    this.latest = null;
  }

  advance(dt: number, position: TrailPosition): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.clock += dt;
    if (this.recording && this.latest) {
      const previous = this.latest;
      const distance = Math.hypot(position.x - previous.position.x, position.y - previous.position.y, position.z - previous.position.z);
      // A paused tab or a warp must never stitch two distant locations together. Normal homing
      // motion is well below 80 units/s; the floor also tolerates very short presentation frames.
      if (dt > LIFETIME || distance > Math.max(4, 80 * dt)) {
        this.start(position);
        return;
      }
      while (this.nextSample <= this.clock + EPSILON) {
        const t = Math.min(1, (this.nextSample - previous.time) / dt);
        this.points.push({ position: interpolate(previous.position, position, t), time: this.nextSample });
        this.nextSample += INTERVAL;
      }
      this.latest = { position: { x: position.x, y: position.y, z: position.z }, time: this.clock };
    }
    const cutoff = this.clock - LIFETIME;
    // Retain one point across the lifetime boundary, so the tail can be clipped at an exact time.
    while (this.points.length > 1 && this.points[1].time <= cutoff + EPSILON) this.points.shift();
    if (this.latest && this.latest.time <= cutoff + EPSILON) this.reset();
  }

  samples(): readonly TrailSample[] {
    if (!this.latest) return [];
    const points = this.points.slice();
    if (this.latest.time > (points.at(-1)?.time ?? -Infinity) + EPSILON) points.push(this.latest);
    const cutoff = this.clock - LIFETIME;
    if (points.length > 1 && points[0].time < cutoff) {
      const [a, b] = points;
      points[0] = { time: cutoff, position: interpolate(a.position, b.position, (cutoff - a.time) / (b.time - a.time)) };
    }
    return points.map(({ position, time }) => ({
      position,
      strength: Math.max(0, Math.min(1, 1 - (this.clock - time) / LIFETIME)),
    }));
  }
}
