/** Decorative trails and planting fields. Shared by ground colour and vegetation placement. */
export const MEADOW_PATHS: readonly (readonly (readonly [number, number])[])[] = [
  [[1, -36], [2, -28], [3, -20], [1, -12], [0, -5], [0, 0], [-1, 7], [-3, 14], [-5, 20], [-6, 25]],
  [[0, 0], [-3, -2], [-5, -5], [-6, -9], [-9, -13], [-15, -16]],
];

export function meadowPathDistance(x: number, z: number): number {
  let closest = Infinity;
  for (const path of MEADOW_PATHS) {
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1], [bx, bz] = path[i];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      closest = Math.min(closest, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
  }
  return closest;
}

/** Open spawn and the existing colonnade, measured from their world-space centres. */
export function meadowClearing(x: number, z: number): boolean {
  return Math.hypot(x, z) < 3.2 || Math.hypot(x + 6, z - 32) < 9.2;
}

/** Smooth repeatable 0..1 planting density: broad patches, not individual random specks. */
export function meadowPatch(x: number, z: number): number {
  return (Math.sin(x * 0.24 + Math.sin(z * 0.13) * 1.6) * Math.cos(z * 0.19 - x * 0.07) + 1) / 2;
}
