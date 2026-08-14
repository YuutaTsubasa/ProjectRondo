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
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
// Side-effect: registers Scene.prototype.enablePhysics / getPhysicsEngine (patched by
// RegisterJoinedPhysicsEngineComponent). Without this, enablePhysics is a no-op and
// PhysicsAggregate throws "No Physics Engine available".
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import HavokPhysics from '@babylonjs/havok';

import { createFollowCamera, type FollowCamera } from './followCamera';
import { createInput } from './input';
import { createPlayer, type Player } from './playerController';
import { loadKnight, driveKnightAnimation, type KnightAnimations } from './knight';

export interface HubScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly follow: FollowCamera;
  readonly player: Player;
  readonly knight: KnightAnimations;
}

export async function createHubScene(canvas: HTMLCanvasElement): Promise<HubScene> {
  // preserveDrawingBuffer (dev only) lets tooling screenshot the WebGL canvas.
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: import.meta.env.DEV, stencil: true });
  const scene = new Scene(engine);

  new HemisphericLight('light', new Vector3(0, 1, 0), scene);

  const ground = CreateGround('ground', { width: 50, height: 50 }, scene);
  const groundMaterial = new StandardMaterial('groundMat', scene);
  groundMaterial.diffuseColor = new Color3(0.45, 0.5, 0.55);
  ground.material = groundMaterial;

  // Physics: Havok. The domain owns gravity, so the world gravity is only used by
  // dynamic bodies (there are none here); the character controller is passed zero gravity.
  const havok = await HavokPhysics();
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene); // static floor collider

  const playerRoot = new TransformNode('player', scene);
  const follow = createFollowCamera(scene, playerRoot, canvas);
  scene.activeCamera = follow.camera;

  const input = createInput();
  const player = createPlayer(scene, playerRoot, follow, input);
  const knight = await loadKnight(scene, playerRoot);
  driveKnightAnimation(scene, knight, () => {
    const v = player.motion.velocity;
    return Math.hypot(v.x, v.z);
  });

  engine.runRenderLoop(() => scene.render());
  // Size the drawing buffer to the canvas now; the resize event only fires on later changes.
  engine.resize();
  window.addEventListener('resize', () => engine.resize());
  return { engine, scene, follow, player, knight };
}
