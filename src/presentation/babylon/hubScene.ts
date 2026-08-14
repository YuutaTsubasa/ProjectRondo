import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { createFollowCamera, type FollowCamera } from './followCamera';

export interface HubScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly follow: FollowCamera;
  readonly cameraTarget: TransformNode;
}

export function createHubScene(canvas: HTMLCanvasElement): HubScene {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);

  new HemisphericLight('light', new Vector3(0, 1, 0), scene);
  CreateGround('ground', { width: 50, height: 50 }, scene);

  const cameraTarget = new TransformNode('camTarget', scene);
  const follow = createFollowCamera(scene, cameraTarget, canvas);
  scene.activeCamera = follow.camera;

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());
  return { engine, scene, follow, cameraTarget };
}
