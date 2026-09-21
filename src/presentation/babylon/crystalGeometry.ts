import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/** Flat, disconnected facets keep the cut edges crisp rather than smoothing the jewel into a pebble. */
export function crystalGeometry(extent: number): VertexData {
  const data = new VertexData();
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const half = extent / 2;
  const rings = [[0.045, 0.8], [-0.045, 0.8]].map(([y, radius]) =>
    Array.from({ length: 8 }, (_, i) => {
      const angle = i * Math.PI / 4;
      return new Vector3(Math.cos(angle) * radius * half, y * half, Math.sin(angle) * radius * half);
    }));
  // Long uninterrupted cuts meet at a narrow bevel. A uniform material lets actual
  // lighting describe these planes without painting a checkerboard across the jewel.
  const face = (points: Vector3[]) => {
    const normal = Vector3.Cross(points[2].subtract(points[0]), points[1].subtract(points[0])).normalize();
    const centre = points.reduce((sum, p) => sum.add(p), Vector3.Zero()).scale(1 / points.length);
    if (Vector3.Dot(normal, centre) < 0) { points.reverse(); normal.scaleInPlace(-1); }
    const offset = positions.length / 3;
    for (const p of points) {
      positions.push(p.x, p.y, p.z);
      normals.push(normal.x, normal.y, normal.z);
    }
    for (let i = 1; i < points.length - 1; i++) indices.push(offset, offset + i, offset + i + 1);
  };
  for (let side = 0; side < 8; side++) {
    const next = (side + 1) % 8;
    face([new Vector3(0, half, 0), rings[0][side], rings[0][next]]);
    for (let ring = 0; ring < rings.length - 1; ring++) {
      face([rings[ring][side], rings[ring + 1][side], rings[ring + 1][next], rings[ring][next]]);
    }
    face([new Vector3(0, -half, 0), rings[1][next], rings[1][side]]);
  }
  data.positions = positions; data.normals = normals; data.indices = indices;
  return data;
}

/** One camera-facing mesh holds the ring and six small diamond glints; no particles are allocated. */
export function crystalHitGeometry(extent: number): VertexData {
  const data = new VertexData();
  const positions: number[] = [], indices: number[] = [];
  const quad = (points: number[][]) => {
    const start = positions.length / 3;
    for (const [x, y] of points) positions.push(x, y, 0);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  const radial = (angle: number, radius: number) => [Math.cos(angle) * radius, Math.sin(angle) * radius];
  const radius = extent * 0.49, width = extent * 0.009;
  for (let i = 0; i < 48; i++) {
    const a = i * Math.PI / 24, b = (i + 1) * Math.PI / 24;
    quad([radial(a, radius - width), radial(a, radius + width), radial(b, radius + width), radial(b, radius - width)]);
  }
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3 + 0.2;
    const [x, y] = radial(angle, extent * (i % 2 ? 0.7 : 0.8));
    const length = extent * 0.065, breadth = extent * 0.015;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    quad([[x + dx * length, y + dy * length], [x - dy * breadth, y + dx * breadth],
      [x - dx * length, y - dy * length], [x + dy * breadth, y - dx * breadth]]);
  }
  data.positions = positions; data.indices = indices;
  data.normals = [];
  VertexData.ComputeNormals(positions, indices, data.normals);
  return data;
}
