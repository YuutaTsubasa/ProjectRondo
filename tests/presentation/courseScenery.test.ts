// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { createCourseScenery } from '../../src/presentation/babylon/courseScenery';

// This test exercises the real mesh/material graph. Physics is irrelevant to texture interpretation.
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate', () => ({ PhysicsAggregate: class {} }));

describe('course ground lighting', () => {
  it('uses packed meadow data as linear detail rather than darkening surface color with it', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    try {
      createCourseScenery(scene);
      const ground = scene.getMeshByName('courseGround_meadow')!;
      const material = ground.material as StandardMaterial;
      expect(material.diffuseTexture).toBeNull();
      expect(material.detailMap.isEnabled).toBe(true);
      expect(material.detailMap.texture!.gammaSpace).toBe(false);
      expect(material.detailMap.texture!.name).toContain('meadow-detail.png');
      const normals = ground.getVerticesData(VertexBuffer.NormalKind)!;
      for (let i = 1; i < normals.length; i += 3) expect(normals[i]).toBeGreaterThan(0.99);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
