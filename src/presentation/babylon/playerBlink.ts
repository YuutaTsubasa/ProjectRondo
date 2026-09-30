import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { MorphTarget } from '@babylonjs/core/Morph/morphTarget';
import { createBlinkClock } from './blinkTiming';

/** Drive the imported composite eye shape independently of all skeletal animation groups. */
export function attachPlayerBlink(
  scene: Scene, meshes: readonly AbstractMesh[], random: () => number = Math.random,
): () => void {
  const targets = new Set<MorphTarget>();
  const managers = new Set(meshes.flatMap(mesh => mesh.morphTargetManager ? [mesh.morphTargetManager] : []));
  for (const manager of managers) {
    for (let i = 0; i < manager.numTargets; i++) {
      const target = manager.getTarget(i);
      if (target.name === 'playerBlink') targets.add(target);
    }
  }
  if (!targets.size) throw new Error('Player model is missing its playerBlink morph target');
  // Keep the morph shader variant stable as the influence crosses zero in texture mode.
  for (const manager of managers) manager.numMaxInfluencers = manager.numTargets;
  const apply = (influence: number) => { for (const target of targets) target.influence = influence; };
  const clock = createBlinkClock(random);
  apply(0);
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    apply(clock.advance(Math.min(0.05, scene.getEngine().getDeltaTime() / 1000)));
  });
  let released = false;
  const onDispose = scene.onDisposeObservable.add(() => release());
  const release = () => {
    if (released) return;
    released = true;
    scene.onBeforeRenderObservable.remove(observer);
    scene.onDisposeObservable.remove(onDispose);
    apply(0);
  };
  return release;
}
