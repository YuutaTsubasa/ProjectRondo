// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { COURSE_PLATFORMS } from '../../src/domain/course/courseLayout';
import { createCourseScenery } from '../../src/presentation/babylon/courseScenery';

vi.mock('@babylonjs/core/Physics/v2/physicsAggregate', () => ({ PhysicsAggregate: class {} }));
let engine: NullEngine;
let scene: Scene;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); scene.useRightHandedSystem = true; });
afterEach(() => { scene.dispose(); engine.dispose(); });

describe('white palace course scenery', () => {
  it('preserves every collision envelope and exact walkable stone top', () => {
    const scenery = createCourseScenery(scene);
    for (const p of COURSE_PLATFORMS) {
      const support = scene.getMeshByName(`courseSupport_${p.id}`)!;
      const top = scene.getMeshByName(`courseGround_${p.id}`)!;
      expect(support.isVisible).toBe(false);
      for (const mesh of [support, top]) {
        mesh.computeWorldMatrix(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        expect(bounds.minimumWorld.x).toBeCloseTo(p.center.x - p.width / 2);
        expect(bounds.maximumWorld.x).toBeCloseTo(p.center.x + p.width / 2);
        expect(bounds.minimumWorld.z).toBeCloseTo(p.center.z - p.depth / 2);
        expect(bounds.maximumWorld.z).toBeCloseTo(p.center.z + p.depth / 2);
        expect(bounds.maximumWorld.y).toBeCloseTo(p.center.y);
      }
      expect(scenery.receivers).toContain(top);
      expect(top.material).toBeInstanceOf(PBRMaterial);
      const material = top.material as PBRMaterial;
      expect(material.albedoTexture?.name).toBe('palaceStoneAlbedo');
      expect(material.bumpTexture?.gammaSpace).toBe(false);
      const positions = top.getVerticesData(VertexBuffer.PositionKind)!;
      const normals = top.getVerticesData(VertexBuffer.NormalKind)!;
      for (let i = 0; i < positions.length; i += 3) {
        if (positions[i + 1] > .13) expect(normals[i + 1]).toBeGreaterThanOrEqual(0);
      }
    }
    expect(scene.meshes.filter(m => m.name.startsWith('courseSupport_'))).toHaveLength(COURSE_PLATFORMS.length);
  });

  it('uses spatial stone batches and keeps the central jumping corridor free of raised masonry', () => {
    const scenery = createCourseScenery(scene);
    expect(scene.meshes.some(m => /courseCliff|courseTree|courseGrass|courseValleyMist/.test(m.name))).toBe(false);
    expect(scene.meshes.some(m => m.name.startsWith('coursePalaceTower_'))).toBe(true);
    expect(scene.getMaterialByName('palaceBanner')).not.toBeNull();
    expect(scenery.casters.length).toBeLessThan(90);
    expect(scene.meshes.length).toBeLessThan(170);
    for (const mesh of scenery.casters) {
      expect(mesh.isDisposed()).toBe(false);
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
      expect([...positions, ...normals].every(Number.isFinite)).toBe(true);
      if (!mesh.name.startsWith('courseTerrace_')) continue;
      const platform = COURSE_PLATFORMS.find(p => mesh.name.startsWith(`courseTerrace_${p.id}:`))!;
      const world = mesh.computeWorldMatrix(true);
      for (let i = 0; i < positions.length; i += 3) {
        const v = Vector3.TransformCoordinates(Vector3.FromArray(positions, i), world);
        if (Math.abs(v.x - platform.center.x) < 3 && v.y > platform.center.y + .08) {
          expect(v.y).toBeGreaterThan(platform.center.y + 3.5);
        }
      }
    }
  });

  it('retains outward triangle winding and finite metre-scale UVs after merging masonry', () => {
    createCourseScenery(scene);
    let minimumAlignment = 1;
    let triangles = 0;
    for (const mesh of scene.meshes) {
      if (!(mesh.material instanceof PBRMaterial)) continue;
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
      const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
      const indices = mesh.getIndices()!;
      if (mesh.material.bumpTexture) {
        const uvs = mesh.getVerticesData(VertexBuffer.UVKind)!;
        expect(uvs.length).toBe(positions.length / 3 * 2);
        expect(uvs.every(Number.isFinite)).toBe(true);
      }
      for (let i = 0; i < indices.length; i += 3) {
        const a = Vector3.FromArray(positions, indices[i] * 3);
        const b = Vector3.FromArray(positions, indices[i + 1] * 3);
        const c = Vector3.FromArray(positions, indices[i + 2] * 3);
        const face = Vector3.Cross(c.subtract(a), b.subtract(a)).normalize();
        for (let j = 0; j < 3; j++) {
          minimumAlignment = Math.min(minimumAlignment, Vector3.Dot(face, Vector3.FromArray(normals, indices[i + j] * 3)));
        }
        triangles++;
      }
    }
    expect(minimumAlignment).toBeGreaterThan(.1);
    expect(triangles).toBeLessThan(180_000);
  });

  it('places a nonphysical, billowing cloud sea below the route with no flat valley floor', () => {
    const scenery = createCourseScenery(scene);
    const clouds = scene.getMeshByName('courseCloudSea')!;
    expect(clouds).not.toBeNull();
    expect(clouds.isPickable).toBe(false);
    expect(clouds.physicsBody).toBeFalsy();
    expect(scenery.casters).not.toContain(clouds);
    clouds.computeWorldMatrix(true);
    const bounds = clouds.getBoundingInfo().boundingBox;
    expect(bounds.maximumWorld.y).toBeLessThan(-8);
    expect(bounds.maximumWorld.y - bounds.minimumWorld.y).toBeGreaterThan(1);
  });
});
