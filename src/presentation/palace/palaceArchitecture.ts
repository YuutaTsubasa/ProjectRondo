import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';

type Point = [number, number, number];

function positiveDimensions(...values: number[]): void {
  if (values.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Architectural dimensions must be positive finite numbers.');
  }
}

/** Facets share positions geometrically, but retain independent normals at stone edges. */
class Solid {
  private positions: number[] = [];
  private normals: number[] = [];
  private indices: number[] = [];

  face(points: Point[], outward: Point, smooth?: (point: Point) => Vector3): void {
    const vertices = points.map(point => Vector3.FromArray(point));
    const normal = Vector3.Cross(vertices[2].subtract(vertices[0]), vertices[1].subtract(vertices[0])).normalize();
    // Babylon's default left-handed front faces use the reverse cross product.
    if (Vector3.Dot(normal, Vector3.FromArray(outward)) < 0) {
      points = [...points].reverse();
      normal.scaleInPlace(-1);
    }
    const start = this.positions.length / 3;
    for (const point of points) {
      this.positions.push(...point);
      const n = smooth ? smooth(point) : normal;
      this.normals.push(n.x, n.y, n.z);
    }
    for (let i = 1; i < points.length - 1; i++) this.indices.push(start, start + i, start + i + 1);
  }

  mesh(name: string, scene: Scene): Mesh {
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = this.positions;
    data.normals = this.normals;
    data.indices = this.indices;
    data.applyToMesh(mesh);
    return mesh;
  }
}

/** Centred stone block with six faces, twelve bevels and eight sealed corner facets. */
export function createBeveledBox(
  name: string,
  options: { width: number; height: number; depth: number; bevel?: number },
  scene: Scene,
): Mesh {
  const { width, height, depth } = options;
  positiveDimensions(width, height, depth);
  const half = [width / 2, height / 2, depth / 2];
  const requested = options.bevel ?? Math.min(width, height, depth) * 0.045;
  if (!Number.isFinite(requested)) throw new RangeError('Bevel must be finite.');
  // Leave positive centre faces even when a caller requests an oversized bevel.
  const bevel = Math.max(0, Math.min(requested, Math.min(...half) * 0.49));
  const inset = half.map(value => value - bevel);
  const solid = new Solid();
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const sign of [-1, 1]) {
      const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
        const p: Point = [0, 0, 0];
        p[axis] = sign * half[axis]; p[u] = su * inset[u]; p[v] = sv * inset[v];
        return p;
      });
      const normal: Point = [0, 0, 0]; normal[axis] = sign;
      solid.face(points, normal);
    }
  }
  if (bevel > 0) {
    for (let along = 0; along < 3; along++) {
      const a = (along + 1) % 3, b = (along + 2) % 3;
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
        const points = [[-1, true], [1, true], [1, false], [-1, false]].map(([end, onA]) => {
          const p: Point = [0, 0, 0];
          p[along] = Number(end) * inset[along];
          p[a] = sa * (onA ? half[a] : inset[a]);
          p[b] = sb * (onA ? inset[b] : half[b]);
          return p;
        });
        const normal: Point = [0, 0, 0]; normal[a] = sa; normal[b] = sb;
        solid.face(points, normal);
      }
    }
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const signs = [x, y, z];
      const points = [0, 1, 2].map(axis => signs.map((sign, i) => sign * (i === axis ? half[i] : inset[i])) as Point);
      solid.face(points, [x, y, z]);
    }
  }
  return solid.mesh(name, scene);
}

function segmentCount(requested: number | undefined, fallback: number, multiple: number, min: number, max: number): number {
  if (requested !== undefined && !Number.isFinite(requested)) throw new RangeError('Segment count must be finite.');
  return Math.min(max, Math.max(min, Math.ceil((requested ?? fallback) / multiple) * multiple));
}

/** Closed extruded half-ellipse; width/rise measure the inner opening, spring line is y=0. */
export function createArch(
  name: string,
  options: { width: number; rise: number; thickness: number; depth: number; segments?: number },
  scene: Scene,
): Mesh {
  const { width, rise, thickness, depth } = options;
  positiveDimensions(width, rise, thickness, depth);
  const count = segmentCount(options.segments, 32, 2, 8, 128);
  const innerX = width / 2, outerX = innerX + thickness, outerY = rise + thickness;
  const solid = new Solid();
  const point = (i: number, outer: boolean, z: number): Point => {
    const angle = i / count * Math.PI;
    return [Math.cos(angle) * (outer ? outerX : innerX), i === 0 || i === count ? 0 : Math.sin(angle) * (outer ? outerY : rise), z];
  };
  const front = depth / 2, back = -front;
  for (let i = 0; i < count; i++) {
    const angle = (i + 0.5) / count * Math.PI;
    for (const z of [back, front]) {
      solid.face([point(i, false, z), point(i, true, z), point(i + 1, true, z), point(i + 1, false, z)], [0, 0, z]);
    }
    solid.face([point(i, true, back), point(i, true, front), point(i + 1, true, front), point(i + 1, true, back)], [Math.cos(angle) / outerX, Math.sin(angle) / outerY, 0]);
    solid.face([point(i, false, back), point(i, false, front), point(i + 1, false, front), point(i + 1, false, back)], [-Math.cos(angle) / innerX, -Math.sin(angle) / rise, 0]);
  }
  for (const i of [0, count]) {
    solid.face([point(i, false, back), point(i, true, back), point(i, true, front), point(i, false, front)], [0, -1, 0]);
  }
  return solid.mesh(name, scene);
}

/** Smooth half-ellipsoid with a separate flat bottom; no collapsed quads at its pole. */
export function createDome(
  name: string,
  options: { radius: number; height: number; segments?: number },
  scene: Scene,
): Mesh {
  const { radius, height } = options;
  positiveDimensions(radius, height);
  const count = segmentCount(options.segments, 48, 4, 12, 96);
  const rings = count / 4;
  const solid = new Solid();
  const smooth = ([x, y, z]: Point) => new Vector3(x / (radius * radius), y / (height * height), z / (radius * radius)).normalize();
  const point = (ring: number, side: number): Point => {
    if (ring === rings) return [0, height, 0];
    const latitude = ring / rings * Math.PI / 2, longitude = (side % count) / count * Math.PI * 2;
    return [radius * Math.cos(latitude) * Math.cos(longitude), height * Math.sin(latitude), radius * Math.cos(latitude) * Math.sin(longitude)];
  };
  for (let side = 0; side < count; side++) {
    for (let ring = 0; ring < rings; ring++) {
      const points = ring === rings - 1
        ? [point(ring, side), point(ring, side + 1), point(rings, side)]
        : [point(ring, side), point(ring, side + 1), point(ring + 1, side + 1), point(ring + 1, side)];
      const normal = smooth(points[0]).add(smooth(points[2]));
      solid.face(points, [normal.x, normal.y, normal.z], smooth);
    }
    solid.face([[0, 0, 0], point(0, side), point(0, side + 1)], [0, -1, 0]);
  }
  return solid.mesh(name, scene);
}

/** One merged mesh; radius is the shaft radius, square plinth/capital extend to 1.45× radius. */
export function createColumn(name: string, options: { height: number; radius: number }, scene: Scene): Mesh {
  const { height, radius } = options;
  positiveDimensions(height, radius);
  const plinth = createBeveledBox(`${name}-plinth`, { width: radius * 2.9, height: height * 0.1, depth: radius * 2.9 }, scene);
  plinth.position.y = height * 0.05;
  const capital = createBeveledBox(`${name}-capital`, { width: radius * 2.9, height: height * 0.08, depth: radius * 2.9 }, scene);
  capital.position.y = height * 0.96;
  // A restrained turned profile gives collars and a slight shaft taper. Ends overlap
  // the closed plinth and capital, avoiding cracks without coplanar exterior faces.
  const profile = [[0.075, 1.18], [0.12, 1.18], [0.15, 1], [0.22, 1], [0.78, 0.87], [0.85, 0.87], [0.88, 1.2], [0.94, 1.2]];
  const solid = new Solid(), count = 32;
  const point = (ring: number, side: number): Point => {
    const angle = (side % count) / count * Math.PI * 2;
    return [Math.cos(angle) * profile[ring][1] * radius, profile[ring][0] * height, Math.sin(angle) * profile[ring][1] * radius];
  };
  for (let side = 0; side < count; side++) {
    for (let ring = 0; ring < profile.length - 1; ring++) {
      const slope = (profile[ring + 1][1] - profile[ring][1]) * radius / ((profile[ring + 1][0] - profile[ring][0]) * height);
      const smooth = ([x, , z]: Point) => new Vector3(x / Math.hypot(x, z), -slope, z / Math.hypot(x, z)).normalize();
      const a = point(ring, side);
      solid.face([a, point(ring, side + 1), point(ring + 1, side + 1), point(ring + 1, side)], [a[0], -slope, a[2]], smooth);
    }
    for (const ring of [0, profile.length - 1]) {
      solid.face([[0, profile[ring][0] * height, 0], point(ring, side), point(ring, side + 1)], [0, ring === 0 ? -1 : 1, 0]);
    }
  }
  const shaft = solid.mesh(`${name}-shaft`, scene);
  const merged = Mesh.MergeMeshes([plinth, shaft, capital], true, true)!;
  merged.name = name;
  return merged;
}

/** Rectangular wall above a half-ellipse opening; one closed shell with a flat deck-facing top. */
export function createArchSpandrel(
  name: string,
  options: { width: number; rise: number; thickness: number; depth: number; segments?: number },
  scene: Scene,
): Mesh {
  const { width, rise, thickness, depth } = options;
  positiveDimensions(width, rise, thickness, depth);
  const count = segmentCount(options.segments, 32, 2, 8, 128);
  const innerX = width / 2, outerX = innerX + thickness, top = rise + thickness;
  const front = depth / 2, back = -front;
  const solid = new Solid();
  // Walk right-to-left along the opening. Matching subdivisions of the flat top
  // keep every boundary edge paired without introducing interior partition faces.
  const bottom: [number, number][] = [[outerX, 0]];
  for (let i = 0; i <= count; i++) {
    const angle = i / count * Math.PI;
    bottom.push([Math.cos(angle) * innerX, i === 0 || i === count ? 0 : Math.sin(angle) * rise]);
  }
  bottom.push([-outerX, 0]);
  const smooth = ([x, y]: Point) => new Vector3(-x / (innerX * innerX), -y / (rise * rise), 0).normalize();
  for (let i = 0; i < bottom.length - 1; i++) {
    const [ax, ay] = bottom[i], [bx, by] = bottom[i + 1];
    for (const z of [back, front]) {
      solid.face([[ax, ay, z], [bx, by, z], [bx, top, z], [ax, top, z]], [0, 0, z]);
    }
    solid.face([[ax, top, back], [bx, top, back], [bx, top, front], [ax, top, front]], [0, 1, 0]);
    const underside: Point[] = [[ax, ay, back], [bx, by, back], [bx, by, front], [ax, ay, front]];
    if (i === 0 || i === bottom.length - 2) {
      solid.face(underside, [0, -1, 0]);
    } else {
      const normal = smooth([(ax + bx) / 2, (ay + by) / 2, 0]);
      solid.face(underside, [normal.x, normal.y, 0], smooth);
    }
  }
  for (const x of [-outerX, outerX]) {
    solid.face([[x, 0, back], [x, top, back], [x, top, front], [x, 0, front]], [x, 0, 0]);
  }
  return solid.mesh(name, scene);
}
