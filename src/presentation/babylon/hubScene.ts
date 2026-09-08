import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
// Side-effect: registers the StandardMaterial shader. Required with tree-shaken deep
// imports, otherwise meshes without an explicit material silently render nothing.
import '@babylonjs/core/Materials/standardMaterial';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
// Side-effect: registers Scene.prototype.enablePhysics / getPhysicsEngine (patched by
// RegisterJoinedPhysicsEngineComponent). Without this, enablePhysics is a no-op and
// PhysicsAggregate throws "No Physics Engine available".
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import HavokPhysics from '@babylonjs/havok';

import { createCharacterRig } from './characterRig';
import type { FollowCamera } from './followCamera';
import type { Player } from './playerController';
import type { Knight } from './knight';
import { createEnvironment } from './environment';
import { createShadows } from './shadows';
import { createAtmosphere } from './postProcessing';
import { createTerrain } from './terrain';
import { terrainHeight } from './terrainHeight';
import { CAPSULE_HEIGHT } from './capsule';
import { loadTrees } from './trees';
import { createGroundScatter } from './scatter';
import { createWind } from './wind';
import { createWater } from './water';
import { createClouds } from './clouds';
import { createLandmark } from './landmark';
import { createCrystals } from './crystals';
import { createHubAudio, type HubAudio } from '../audio/hubAudio';

/**
 * Test crystals for the homing attack, placed by hand near spawn so the move can be exercised without
 * hunting for one. A rising diagonal line plus a cluster: the line is for chaining, the cluster is for
 * checking that the camera cone actually picks between neighbours rather than grabbing the nearest.
 *
 * These are a playground, not level design. The tower spec owns real placement.
 */
const TEST_CRYSTALS = [
  { x: 0, y: 3, z: -8 },
  { x: 0, y: 5.5, z: -13 },
  { x: 0, y: 8, z: -18 },
  { x: 3, y: 4, z: -10 },
  { x: -3, y: 4, z: -10 },
] as const;

export interface HubScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly follow: FollowCamera;
  readonly player: Player;
  readonly knight: Knight;
  /** Music and character sound. `App.svelte` drives the music scene through this. */
  readonly audio: HubAudio;
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

  const { sun } = createEnvironment(scene);

  // Physics: Havok. The domain owns all gravity and the character controller is passed zero
  // gravity, so the world gravity stays zero too — no second, contradictory source of gravity.
  // (Set a real value here if/when dynamic rigid bodies are introduced.)
  const havok = await HavokPhysics();
  scene.enablePhysics(Vector3.Zero(), new HavokPlugin(true, havok));

  const crystals = createCrystals(scene, TEST_CRYSTALS);
  // Spawn the capsule's base ON the terrain surface (+ a small lift so it settles down onto it rather
  // than starting embedded — an embedded capsule pops through the one-sided MESH collider and falls).
  const spawn = new Vector3(0, terrainHeight(0, 0) + CAPSULE_HEIGHT / 2 + 0.3, 0);
  // The hub's answer to "how high is the ground here" — its analytic height field. The character rig
  // takes it as an argument rather than importing it, so the same rig works in a scene that has none.
  const rig = await createCharacterRig(scene, {
    canvas,
    sun,
    makeShadows: (camera) => createShadows(sun, camera),
    groundHeight: terrainHeight,
    spawn,
    crystals,
  });
  const { follow, shadows, player, knight, readMotion } = rig;
  // Babylon 9 keys shadow generators by camera, so the console's usual
  // `scene.lights.find(...).getShadowGenerator()` (no-arg) returns null. Expose a stable handle
  // instead, the same way playerController exposes moveConfig/charController.
  if (import.meta.env.DEV) (window as unknown as { shadows: unknown }).shadows = shadows;

  const terrain = createTerrain(scene);
  shadows.receive(terrain);
  createWind(scene);
  createGroundScatter(scene, shadows);
  createWater(scene);
  createClouds(scene);
  createLandmark(scene, shadows);

  createAtmosphere(scene, follow.camera);

  await loadTrees(scene, shadows);
  // Not awaited, and `createHubAudio` is not async: audio must never be able to hold up first render.
  // See its doc comment — a streaming music cue whose media element never fires `canplaythrough`
  // would otherwise leave this line pending for good, and with it the render loop below.
  // `readMotion` again, not a second function built beside it: the footsteps and the locomotion blend
  // they have to land on answer "how fast, and airborne?" from one source. Each layer's observer calls
  // it for itself, so the sample is built twice a frame — one *source*, not one sample.
  const audio = createHubAudio(scene, readMotion, knight);

  engine.runRenderLoop(() => scene.render());
  // Size the drawing buffer to the canvas now; the resize event only fires on later changes.
  engine.resize();
  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);

  const dispose = () => {
    window.removeEventListener('resize', onResize);
    rig.dispose();
    audio.dispose();
    // engine.dispose() tears down the scene, physics, meshes, observers and the render loop.
    engine.dispose();
  };

  const suspendInput = (on: boolean) => rig.suspendInput(on);

  return { engine, scene, follow, player, knight, audio, suspendInput, dispose };
}
