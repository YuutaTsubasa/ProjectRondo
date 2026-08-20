import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
// Side-effect: registers the StandardMaterial shader. Required with tree-shaken deep
// imports, otherwise meshes without an explicit material silently render nothing.
import '@babylonjs/core/Materials/standardMaterial';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
// Side-effect: registers Scene.prototype.enablePhysics / getPhysicsEngine (patched by
// RegisterJoinedPhysicsEngineComponent). Without this, enablePhysics is a no-op and
// PhysicsAggregate throws "No Physics Engine available".
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import HavokPhysics from '@babylonjs/havok';

import { createFollowCamera, type FollowCamera } from './followCamera';
import { createInput } from './input';
import { createPlayer, type Player } from './playerController';
import { loadKnight, driveKnightAnimation, type Knight, type KnightMotionSample } from './knight';
import { createEnvironment } from './environment';
import { createTerrain } from './terrain';
import { loadTrees } from './trees';
import { createGroundScatter } from './scatter';

export interface HubScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly follow: FollowCamera;
  readonly player: Player;
  readonly knight: Knight;
  /** Suspends (on=true) or resumes (on=false) gameplay input and camera look, e.g. during an AVG overlay. */
  suspendInput(on: boolean): void;
  /** Tears the scene down: stops the render loop, removes DOM listeners, disposes the engine. */
  dispose(): void;
}

export async function createHubScene(canvas: HTMLCanvasElement): Promise<HubScene> {
  // preserveDrawingBuffer (dev only) lets tooling screenshot the WebGL canvas.
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: import.meta.env.DEV, stencil: true });
  const scene = new Scene(engine);
  // Right-handed so glTF (a right-handed format) imports natively — no handedness reflection on
  // skinned characters, which otherwise collapses them to the floor when the parent yaws.
  scene.useRightHandedSystem = true;

  const { shadowGenerator } = createEnvironment(scene);

  // Physics: Havok. The domain owns all gravity and the character controller is passed zero
  // gravity, so the world gravity stays zero too — no second, contradictory source of gravity.
  // (Set a real value here if/when dynamic rigid bodies are introduced.)
  const havok = await HavokPhysics();
  scene.enablePhysics(Vector3.Zero(), new HavokPlugin(true, havok));
  createTerrain(scene);
  createGroundScatter(scene);

  const playerRoot = new TransformNode('player', scene);
  const follow = createFollowCamera(scene, playerRoot, canvas);
  scene.activeCamera = follow.camera;

  const input = createInput();
  const player = createPlayer(scene, playerRoot, follow, input);
  const readMotion = (): KnightMotionSample => {
    const v = player.motion.velocity;
    // isSupported, not motion.isGrounded — see the Player interface for why the domain's flag reads
    // false for most of an uphill walk and would flicker the jump clip on and off.
    return { planarSpeed: Math.hypot(v.x, v.z), isGrounded: player.isSupported, justJumped: player.justJumped };
  };
  const knight = await loadKnight(scene, playerRoot, shadowGenerator);
  driveKnightAnimation(scene, knight, readMotion, () => ({
    walk: player.config.maxSpeed,
    run: player.config.runSpeed,
    // Up and back down under the domain's own gravity — the flat-ground airtime the jump clip fills.
    airtime: (2 * player.config.jumpSpeed) / player.config.gravity,
  }));
  await loadTrees(scene, shadowGenerator);

  engine.runRenderLoop(() => scene.render());
  // Size the drawing buffer to the canvas now; the resize event only fires on later changes.
  engine.resize();
  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);

  const dispose = () => {
    window.removeEventListener('resize', onResize);
    input.dispose();
    follow.dispose();
    // engine.dispose() tears down the scene, physics, meshes, observers and the render loop.
    engine.dispose();
  };

  const suspendInput = (on: boolean) => {
    input.setEnabled(!on);
    follow.setEnabled(!on);
  };

  return { engine, scene, follow, player, knight, suspendInput, dispose };
}
