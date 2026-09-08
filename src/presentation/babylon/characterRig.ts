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
  /**
   * Whether this level's camera tightens its vertical follow through a fast descent — see
   * `FollowCameraConfig.descentFollow`, which has the arithmetic. Stated by every level rather
   * than defaulted, because the answer is a fact about the level's drops and its crystals, and a
   * level that inherits it silently is a level nobody decided it for.
   */
  readonly descentFollow: boolean;
}

export interface CharacterRig {
  readonly root: TransformNode;
  readonly follow: FollowCamera;
  readonly shadows: Shadows;
  readonly player: Player;
  readonly knight: Knight;
  readonly input: InputState;
  readonly readMotion: () => KnightMotionSample;
  /**
   * Suspends (on=true) or resumes (on=false) gameplay input and camera look.
   *
   * A rig is born SUSPENDED — see {@link createCharacterRig} — so whoever owns the level has to
   * resume it once that level is the one on screen. Resuming restores the keyboard and the camera's
   * look, but not pointer lock, which cannot be re-taken from code; `followCamera.setEnabled` has
   * the reason and what the player does instead.
   */
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
 *
 * **The rig comes back suspended, and the level's owner resumes it.** `App.svelte` builds the
 * incoming level while the outgoing one is still the scene being rendered, so for the length of a
 * load two rigs exist at once, and both bind their listeners to the same window and the same canvas.
 * The new level's *scene* cannot act in that window — nothing renders it, so none of its observers
 * run — but its DOM listeners can, and enabled from birth they would: a click on the canvas would
 * hand pointer lock to a camera nobody can see, mouse movement would steer it, and a key held when
 * the swap commits would already be down in a level the player has not been shown yet. Starting
 * suspended closes that window, and it closes it for a build that never finishes too, whose
 * listeners outlive the failure.
 */
export async function createCharacterRig(scene: Scene, options: CharacterRigOptions): Promise<CharacterRig> {
  const root = new TransformNode('player', scene);
  const follow = createFollowCamera(
    scene, root, options.canvas, options.groundHeight, options.descentFollow);
  scene.activeCamera = follow.camera;
  const shadows = options.makeShadows(follow.camera);

  const input = createInput();
  // Suspended from here, not from the `return` below: everything after this line can await — the
  // knight's GLB alone is most of a second — and the listeners are already bound by now. See this
  // function's doc for what would be live during that wait. The camera half is not here to release
  // pointer lock -- on a swap the outgoing level released it before `build()` was even called, and
  // on the first build there is none -- it is here to stop the mouse-move steering and the click.
  input.setEnabled(false);
  follow.setEnabled(false);
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
