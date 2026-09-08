import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

import { createFollowCamera, type FollowCamera } from './followCamera';
import type { GroundHeight } from './groundHeight';
import { createInput, type InputState } from './input';
import { createPlayer, type Player } from './playerController';
import { loadKnight, driveKnightAnimation, type Knight, type KnightMotionSample } from './knight';
import type { Shadows } from './shadows';
import type { Crystals } from './crystals';

export interface CharacterRigOptions {
  readonly canvas: HTMLCanvasElement;
  readonly sun: DirectionalLight;
  readonly makeShadows: (camera: Camera) => Shadows;
  readonly groundHeight: GroundHeight;
  readonly spawn: Vector3;
  readonly crystals: Crystals;
}

export interface CharacterRig {
  readonly root: TransformNode;
  readonly follow: FollowCamera;
  readonly shadows: Shadows;
  readonly player: Player;
  readonly knight: Knight;
  readonly input: InputState;
  readonly readMotion: () => KnightMotionSample;
  suspendInput(on: boolean): void;
  dispose(): void;
}

/**
 * The character both scenes need, in the order Babylon requires it built.
 *
 * `makeShadows` is a callback rather than a ready-made `Shadows` because of a constraint
 * `hubScene.ts` documented first: Babylon 9 keys shadow generators by camera, so the generator has
 * to be created after this camera exists and before the level registers a single caster. Handing the
 * rig a `Shadows` would mean the caller had already made a camera, and there is only one camera.
 * Handing the level the callback's result keeps the whole ordering rule in one file instead of in
 * two files' memories.
 *
 * `crystals` is the one piece of level content that has to exist first, because `createPlayer` takes
 * it. That is affordable only because `crystals.ts` registers no shadow casters — see its own doc —
 * so the level can place crystals before any shadows exist.
 */
export async function createCharacterRig(scene: Scene, options: CharacterRigOptions): Promise<CharacterRig> {
  const root = new TransformNode('player', scene);
  const follow = createFollowCamera(scene, root, options.canvas, options.groundHeight);
  scene.activeCamera = follow.camera;
  const shadows = options.makeShadows(follow.camera);

  const input = createInput();
  const player = createPlayer(scene, root, follow, input, options.crystals, options.spawn);
  const readMotion = (): KnightMotionSample => {
    const v = player.motion.velocity;
    return {
      planarSpeed: Math.hypot(v.x, v.z),
      airborne: player.airborne,
      homing: player.motion.homing !== null,
      homingEntrySeconds: player.homingEntrySeconds,
      bounced: player.homingBounced,
    };
  };
  const knight = await loadKnight(scene, root, shadows, options.groundHeight);
  driveKnightAnimation(scene, knight, readMotion, () => ({
    walk: player.config.maxSpeed,
    run: player.config.runSpeed,
    // Up and back down under the domain's own gravity — the flat-ground airtime the jump clip fills.
    airtime: (2 * player.config.jumpSpeed) / player.config.gravity,
  }));

  return {
    root, follow, shadows, player, knight, input, readMotion,
    suspendInput: (on: boolean) => { input.setEnabled(!on); follow.setEnabled(!on); },
    dispose: () => { input.dispose(); follow.dispose(); },
  };
}
