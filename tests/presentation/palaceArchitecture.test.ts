import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import * as architecture from '../../src/presentation/palace/palaceArchitecture';

let engine: NullEngine;
let scene: Scene;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); scene.useRightHandedSystem = true; });
afterEach(() => { scene.dispose(); engine.dispose(); });

function assertClosed(mesh: Mesh) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const indices = mesh.getIndices()!;
  expect(positions.length).toBeGreaterThan(0);
  expect(normals.length).toBe(positions.length);
  expect([...positions, ...normals].every(Number.isFinite)).toBe(true);
  const point = (index: number) => Vector3.FromArray(positions, index * 3);
  const key = (index: number) => point(index).asArray().map(v => Math.round(v * 1e6)).join(',');
  const edges = new Map<string, { count: number; direction: number }>();
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const ids = [indices[i], indices[i + 1], indices[i + 2]];
    const [a, b, c] = ids.map(point);
    const faceNormal = Vector3.Cross(c.subtract(a), b.subtract(a));
    expect(faceNormal.length()).toBeGreaterThan(1e-9);
    volume += Vector3.Dot(a, Vector3.Cross(c, b)) / 6;
    for (const id of ids) {
      const normal = Vector3.FromArray(normals, id * 3);
      expect(normal.length()).toBeCloseTo(1, 5);
      expect(Vector3.Dot(faceNormal, normal)).toBeGreaterThan(0);
    }
    for (let side = 0; side < 3; side++) {
      const from = key(ids[side]), to = key(ids[(side + 1) % 3]);
      const edgeKey = [from, to].sort().join('|');
      const edge = edges.get(edgeKey) ?? { count: 0, direction: 0 };
      edge.count++; edge.direction += from < to ? 1 : -1;
      edges.set(edgeKey, edge);
    }
  }
  expect([...edges.values()].filter(edge => edge.count !== 2 || edge.direction !== 0)).toEqual([]);
  expect(volume).toBeGreaterThan(0);
  expect(mesh.material).toBeNull();
  expect(mesh.receiveShadows).toBe(false);
}
function bounds(mesh: Mesh, min: number[], max: number[]) {
  mesh.refreshBoundingInfo();
  const box = mesh.getBoundingInfo().boundingBox;
  min.forEach((v, i) => expect(box.minimum.asArray()[i]).toBeCloseTo(v, 5));
  max.forEach((v, i) => expect(box.maximum.asArray()[i]).toBeCloseTo(v, 5));
}

describe('palace architectural solids', () => {
  it.each([undefined, 0, 0.2, 100])('closes bevel corners and preserves exact box dimensions with bevel %s', bevel => {
    const mesh = architecture.createBeveledBox('stone', { width: 4, height: 2, depth: 3, bevel }, scene);
    bounds(mesh, [-2, -1, -1.5], [2, 1, 1.5]);
    assertClosed(mesh);
    const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
    for (let i = 0; i < p.length; i += 3) expect(p[i] * n[i] + p[i + 1] * n[i + 1] + p[i + 2] * n[i + 2]).toBeGreaterThan(0);
  });

  it('creates a closed elliptical arch with an unobstructed opening and flat spring ends', () => {
    const mesh = architecture.createArch('arch', { width: 6, rise: 4, thickness: 0.5, depth: 1.2, segments: 23 }, scene);
    bounds(mesh, [-3.5, 0, -0.6], [3.5, 4.5, 0.6]);
    assertClosed(mesh);
    const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < p.length; i += 3) expect((p[i] / 3) ** 2 + (p[i + 1] / 4) ** 2).toBeGreaterThanOrEqual(1 - 1e-6);
  });

  it('caps the dome without degenerate pole triangles and shades its curved surface smoothly', () => {
    const mesh = architecture.createDome('dome', { radius: 3, height: 2, segments: 23 }, scene);
    bounds(mesh, [-3, 0, -3], [3, 2, 3]);
    assertClosed(mesh);
    const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
    for (let i = 0; i < p.length; i += 3) {
      if (n[i + 1] < -0.9) { expect(p[i + 1]).toBe(0); continue; }
      const expected = new Vector3(p[i] / 9, p[i + 1] / 4, p[i + 2] / 9).normalize();
      expect(Vector3.Distance(expected, Vector3.FromArray(n, i))).toBeLessThan(1e-5);
    }
  });


  it('fills the arch haunches to a flat deck with one closed spandrel and smooth opening normals', () => {
    const mesh = architecture.createArchSpandrel('spandrel', { width: 6, rise: 4, thickness: 0.5, depth: 1.2, segments: 23 }, scene);
    bounds(mesh, [-3.5, 0, -0.6], [3.5, 4.5, 0.6]);
    assertClosed(mesh);
    const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
    let topVertices = 0, openingVertices = 0;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1];
      if (n[i + 1] > 0.9) { expect(y).toBeCloseTo(4.5); topVertices++; }
      if (Math.abs((x / 3) ** 2 + (y / 4) ** 2 - 1) < 1e-5 && Math.abs(n[i + 2]) < 0.1 && y > 0) {
        const expected = new Vector3(-x / 9, -y / 16, 0).normalize();
        expect(Vector3.Distance(expected, Vector3.FromArray(n, i))).toBeLessThan(1e-5);
        openingVertices++;
      }
    }
    expect(topVertices).toBeGreaterThan(8);
    expect(openingVertices).toBeGreaterThan(8);
    // No hidden subdivision walls: vertices live only on the top or opening/bottom boundary.
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1];
      expect(Math.abs(y - 4.5) < 1e-5 || y === 0 || Math.abs((x / 3) ** 2 + (y / 4) ** 2 - 1) < 1e-5).toBe(true);
    }
  });
  it('merges a column shaft, plinth and capital into one material-free mesh anchored at its base', () => {
    const mesh = architecture.createColumn('column', { height: 7, radius: 0.4 }, scene);
    bounds(mesh, [-0.58, 0, -0.58], [0.58, 7, 0.58]);
    assertClosed(mesh);
    expect(scene.meshes).toEqual([mesh]);
  });

  it('rejects invalid dimensions before allocating meshes', () => {
    expect(() => architecture.createArch('bad', { width: 0, rise: 2, thickness: 1, depth: 1 }, scene)).toThrow(RangeError);
    expect(() => architecture.createDome('bad', { radius: NaN, height: 1 }, scene)).toThrow(RangeError);
    expect(() => architecture.createColumn('bad', { radius: 1, height: -1 }, scene)).toThrow(RangeError);
    expect(() => architecture.createBeveledBox('bad', { width: 1, height: 1, depth: Infinity }, scene)).toThrow(RangeError);
    expect(scene.meshes).toHaveLength(0);
  });
});
