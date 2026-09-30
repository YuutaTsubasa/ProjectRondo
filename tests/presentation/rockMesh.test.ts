import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { rockMesh } from '../../src/presentation/babylon/scatter';

// Shading/UV seams may duplicate vertices; physical triangle edges must still meet.
// Count by world position rather than buffer index so an exploded mesh cannot pass.
describe('meadow rock surface', () => {
  it('forms one closed surface with two adjoining triangles at every geometric edge', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const rock = rockMesh(scene);
      const p = rock.getVerticesData(VertexBuffer.PositionKind)!;
      const indices = rock.getIndices()!;
      const vertex = (index: number) => [0, 1, 2].map(axis => Math.round(p[index * 3 + axis] * 1e6)).join(',');
      const edges = new Map<string, number>();
      for (let i = 0; i < indices.length; i += 3) {
        const corners = [vertex(indices[i]), vertex(indices[i + 1]), vertex(indices[i + 2])];
        expect(new Set(corners).size).toBe(3);
        for (let side = 0; side < 3; side++) {
          const key = [corners[side], corners[(side + 1) % 3]].sort().join('|');
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      expect([...edges.values()].filter(count => count !== 2)).toEqual([]);
      const normals = rock.getVerticesData(VertexBuffer.NormalKind)!;
      for (let i = 0; i < p.length; i += 3) {
        expect(Math.hypot(normals[i], normals[i + 1], normals[i + 2])).toBeCloseTo(1, 5);
        expect(p[i] * normals[i] + p[i + 1] * normals[i + 1] + p[i + 2] * normals[i + 2]).toBeGreaterThan(0);
      }
    } finally { scene.dispose(); engine.dispose(); }
  });
});
