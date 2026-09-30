import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { vec3 } from '../../src/domain/math/vec3';
import { createCrystals, CRYSTAL_EXTENT } from '../../src/presentation/babylon/crystals';
import { HOMING_RED_RGB } from '../../src/presentation/babylon/homingColors';

const releases: (() => void)[] = [];
afterEach(() => { releases.splice(0).forEach((release) => release()); vi.restoreAllMocks(); });
function build() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  releases.push(() => { scene.dispose(); engine.dispose(); });
  const spots = [vec3(1, 2, 3), vec3(-4, 6, 8)];
  const crystals = createCrystals(scene, spots);
  const advance = (seconds: number) => {
    vi.spyOn(engine, 'getDeltaTime').mockReturnValue(seconds * 1000);
    scene.onBeforeRenderObservable.notifyObservers(scene);
  };
  return { engine, scene, spots, crystals, advance };
}

describe('cut crystals', () => {
  it('keeps static ordered targets and the established outer extent with finite outward facet normals', () => {
    const { scene, spots, crystals, advance } = build();
    expect(CRYSTAL_EXTENT).toBe(0.45 * 2 * Math.SQRT2);
    expect(crystals.positions).toEqual(spots);
    const mesh = scene.getMeshByName('crystal_0')!;
    const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
    expect(mesh.getTotalIndices()).toBeGreaterThan(24); // A cut surface beyond the old eight triangles.
    expect(p.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < p.length; i += 3) {
      expect(Math.hypot(n[i], n[i + 1], n[i + 2])).toBeCloseTo(1, 5);
      expect(p[i] * n[i] + p[i + 1] * n[i + 1] + p[i + 2] * n[i + 2]).toBeGreaterThan(0);
      expect(Math.max(Math.abs(p[i]), Math.abs(p[i + 1]), Math.abs(p[i + 2]))).toBeLessThanOrEqual(CRYSTAL_EXTENT / 2 + 1e-6);
    }
    const ys = p.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(CRYSTAL_EXTENT, 6);
    crystals.flash(0);
    advance(0.2);
    expect(mesh.position.asArray()).toEqual([spots[0].x, spots[0].y, spots[0].z]);
    expect(crystals.positions).toEqual(spots);
    expect(mesh.isPickable).toBe(false);
  });

  it('isolates hits, expands a brief effect, then restores the resting material and hides the effect', () => {
    const { scene, crystals, advance } = build();
    const material = scene.getMaterialByName('crystalMat_0') as StandardMaterial;
    const neighbour = scene.getMaterialByName('crystalMat_1') as StandardMaterial;
    const resting = material.emissiveColor.clone();
    const neighbourResting = neighbour.emissiveColor.clone();
    const effect = scene.getMeshByName('crystalHit_0')!;
    expect(effect).toBeTruthy();
    expect(effect.isEnabled()).toBe(false);
    crystals.flash(0);
    expect(material.emissiveColor.asArray()).toEqual([...HOMING_RED_RGB]);
    expect(neighbour.emissiveColor.equals(neighbourResting)).toBe(true);
    expect(effect.isEnabled()).toBe(true);
    const initialScale = effect.scaling.x;
    advance(0.1);
    expect(effect.scaling.x).toBeGreaterThan(initialScale);
    expect(effect.visibility).toBeLessThan(1);
    advance(1);
    expect(material.emissiveColor.equals(resting)).toBe(true);
    expect(effect.isEnabled()).toBe(false);
  });

  it('restarts the existing bounded effect on repeated hits without retaining the old fade', () => {
    const { scene, crystals, advance } = build();
    const effect = scene.getMeshByName('crystalHit_0')!;
    expect(effect).toBeTruthy();
    const resourceCounts = [scene.meshes.length, scene.materials.length, scene.geometries.length];
    crystals.flash(0);
    const startScale = effect.scaling.clone();
    advance(0.2);
    for (let i = 0; i < 40; i++) crystals.flash(0);
    expect(effect.scaling.equals(startScale)).toBe(true);
    expect(effect.visibility).toBe(1);
    expect([scene.meshes.length, scene.materials.length, scene.geometries.length]).toEqual(resourceCounts);
    advance(1);
    expect(effect.isEnabled()).toBe(false);
  });

  it('ignores all invalid indices including fractional and nonfinite values', () => {
    const { scene, crystals } = build();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const material = scene.getMaterialByName('crystalMat_0') as StandardMaterial;
    const resting = material.emissiveColor.clone();
    for (const index of [-1, 2, 0.5, NaN, Infinity]) expect(() => crystals.flash(index)).not.toThrow();
    expect(material.emissiveColor.equals(resting)).toBe(true);
  });

  it('releases scene-owned meshes, materials and observer, and ignores stale hits after disposal', () => {
    const { scene, crystals } = build();
    crystals.flash(0);
    scene.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    expect(scene.geometries).toHaveLength(0);
    expect(scene.onBeforeRenderObservable.observers).toHaveLength(0);
    expect(() => crystals.flash(0)).not.toThrow();
  });
});
