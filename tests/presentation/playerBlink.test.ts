// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MorphTarget } from '@babylonjs/core/Morph/morphTarget';
import { MorphTargetManager } from '@babylonjs/core/Morph/morphTargetManager';
import { attachPlayerBlink } from '../../src/presentation/babylon/playerBlink';
let engine: NullEngine, scene: Scene;
beforeEach(() => {
  engine = new NullEngine(); scene = new Scene(engine);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(engine, 'getDeltaTime').mockReturnValue(50);
});
afterEach(() => { scene.dispose(); engine.dispose(); vi.restoreAllMocks(); });
function piece(name: string) {
  const mesh = new Mesh(name, scene), manager = new MorphTargetManager(scene);
  const blink = new MorphTarget('playerBlink', 0, scene), other = new MorphTarget('smile', 0.3, scene);
  manager.addTarget(blink); manager.addTarget(other); mesh.morphTargetManager = manager;
  return { mesh, manager, blink, other };
}
const tick = (count = 1) => { for (let i = 0; i < count; i++) scene.onBeforeRenderObservable.notifyObservers(scene); };
it('drives all eye pieces together, leaves other expressions alone, and stops on release', () => {
  const face = piece('face'), iris = piece('iris');
  const release = attachPlayerBlink(scene, [face.mesh, iris.mesh], () => 0);
  tick(60); vi.mocked(engine.getDeltaTime).mockReturnValue(40); tick();
  expect(face.blink.influence).toBeCloseTo(0.5);
  expect(iris.blink.influence).toBe(face.blink.influence);
  expect(face.other.influence).toBe(0.3);
  release(); release();
  expect(face.blink.influence).toBe(0);
  expect(scene.onBeforeRenderObservable.hasObservers()).toBe(false);
  tick(200); expect(face.blink.influence).toBe(0);
});
it('pauses blink time while hidden and caps a long resumed frame', () => {
  const face = piece('face'); attachPlayerBlink(scene, [face.mesh], () => 0);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); tick(1000);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.mocked(engine.getDeltaTime).mockReturnValue(60000); tick();
  expect(face.blink.influence).toBe(0);
  vi.mocked(engine.getDeltaTime).mockReturnValue(50); tick(59);
  vi.mocked(engine.getDeltaTime).mockReturnValue(40); tick();
  expect(face.blink.influence).toBeCloseTo(0.5);
});
it('detaches when the scene is disposed even without an explicit character release', () => {
  const face = piece('face'); attachPlayerBlink(scene, [face.mesh], () => 0);
  scene.dispose(); expect(scene.onBeforeRenderObservable.hasObservers()).toBe(false);
});
it('rejects a player asset without the contracted blink target', () => {
  expect(() => attachPlayerBlink(scene, [new Mesh('no blink', scene)])).toThrow(/playerBlink/);
});
