import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader. Required with tree-shaken deep
// imports, otherwise meshes without an explicit material silently render nothing.
import '@babylonjs/core/Materials/standardMaterial';
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

  const ground = CreateGround('ground', { width: 50, height: 50 }, scene);
  const groundMaterial = new StandardMaterial('groundMat', scene);
  groundMaterial.diffuseColor = new Color3(0.45, 0.5, 0.55);
  ground.material = groundMaterial;

  const cameraTarget = new TransformNode('camTarget', scene);
  const follow = createFollowCamera(scene, cameraTarget, canvas);
  scene.activeCamera = follow.camera;

  engine.runRenderLoop(() => scene.render());
  // Size the drawing buffer to the canvas now; the resize event only fires on later changes.
  engine.resize();
  window.addEventListener('resize', () => engine.resize());
  return { engine, scene, follow, cameraTarget };
}
