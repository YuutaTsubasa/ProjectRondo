// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { createDashTrail } from '../../src/presentation/babylon/dashTrail';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const release of cleanup.splice(0)) release(); });
function mount() {
  const engine = new NullEngine();
  engine.getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  scene.activeCamera = new TargetCamera('camera', new Vector3(0, 3, -10), scene);
  const generator = new TransformNode('generator', scene);
  const trail = createDashTrail(scene, generator);
  cleanup.push(() => { scene.dispose(); engine.dispose(); });
  return { scene, generator, trail };
}

describe('dash trail rendering lifecycle', () => {
  it('renders a tapered core and sheath, leaves a fading tail after stop, then hides', () => {
    const { scene, generator, trail } = mount();
    trail.start();
    for (let i = 0; i < 12; i++) { generator.position.x += 0.3; scene.render(); }
    expect(scene.meshes.filter((m) => m.isEnabled())).toHaveLength(2);
    for (const mesh of scene.meshes) {
      expect(mesh.getVerticesData(VertexBuffer.PositionKind)!.every(Number.isFinite)).toBe(true);
      const alpha = mesh.getVerticesData(VertexBuffer.ColorKind)!.filter((_, i) => i % 4 === 3);
      expect(Math.min(...alpha)).toBe(0);
      expect(Math.max(...alpha)).toBeGreaterThan(0);
    }
    trail.stop();
    scene.render();
    expect(scene.meshes.some((m) => m.isEnabled())).toBe(true);
    for (let i = 0; i < 13; i++) scene.render();
    expect(scene.meshes.every((m) => !m.isEnabled())).toBe(true);
  });

  it('reset hides immediately and disposal releases geometry, materials and subscriptions', () => {
    const { scene, generator, trail } = mount();
    trail.start();
    generator.position.x = 1;
    scene.render();
    expect(scene.meshes.some((m) => m.isEnabled())).toBe(true);
    trail.reset();
    expect(scene.meshes.every((m) => !m.isEnabled())).toBe(true);
    trail.dispose();
    trail.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials.filter((m) => m.name.startsWith('knightTrail'))).toHaveLength(0);
    expect(scene.onBeforeActiveMeshesEvaluationObservable.hasObservers()).toBe(false);
    scene.render();
  });
});
