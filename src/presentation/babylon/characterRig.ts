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
  readonly follow: FollowCamera;
  readonly shadows: Shadows;
  readonly player: Player;
  readonly knight: Knight;
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
  /**
   * Releases everything the rig holds that is not the scene's — see {@link releaseRig}, which is
   * literally this function: a finished rig and a rig that threw halfway through being built are
   * torn down by the same call over the same bag.
   *
   * **The scene's physics engine has to still be alive when this runs** — the controller releases
   * its Havok handles through it. `levelTeardown.ts` is what holds both levels to that order.
   */
  dispose(): void;
}

/**
 * The pieces of a rig that the scene does not own, collected as the build makes them.
 *
 * Optional for the reason `levelTeardown.ts`'s `LevelParts` gives one level up: this is filled in
 * *during* a build, and the build can reject before it is full — {@link buildCharacterRig}'s
 * `await loadKnight` is a network fetch, and by the time it runs all three of these exist.
 */
interface RigPieces {
  input?: InputState;
  follow?: FollowCamera;
  player?: Player;
}

/**
 * Releases whatever of a rig has been made: the input listeners, the camera's, and the Havok
 * character controller (see {@link Player.dispose}, which is the one of the three `scene.dispose()`
 * cannot reach at all).
 *
 * One function for the finished rig and the half-built one both, for the reason `levelTeardown.ts`
 * gives one level up: an order written out twice is an order that drifts. It is called from
 * {@link CharacterRig.dispose} and from {@link createCharacterRig}'s `catch`.
 */
function releaseRig(pieces: RigPieces): void {
  pieces.input?.dispose();
  pieces.follow?.dispose();
  pieces.player?.dispose();
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
 *
 * **A rig that rejects releases what it had made, and it has to be this function that does it.** The
 * level's `parts.rig` (`levelTeardown.ts`) is assigned from this function's *return value*, so a
 * rejection reaches the level with that field still empty — `disposeLevel` would then dispose the
 * scene alone, and everything below would be left behind. It is not a hypothetical corner: the three
 * pieces are all made before `await loadKnight`, and for the tower the knight's GLB is the only
 * rejection left (`loadHavok` is cached page-wide by then), so the retryable failed entry the whole
 * teardown exists for is *exactly* this path. Left to the level it would leak six DOM listeners —
 * inert, since the rig is born suspended, but attached — and, unrecoverably, the
 * `PhysicsCharacterController`'s Havok handles, because by then the scene and its physics plugin are
 * gone and there is nothing left to release them through.
 */
export async function createCharacterRig(
  scene: Scene, options: CharacterRigOptions,
): Promise<CharacterRig> {
  const pieces: RigPieces = {};
  try {
    return await buildCharacterRig(scene, pieces, options);
  } catch (err) {
    // Before the level's own `catch` disposes the scene, which is what makes the controller's Havok
    // release possible at all — see `releaseRig` above and `levelTeardown.ts` for that ordering.
    releaseRig(pieces);
    throw err;
  }
}

/** The rig's actual construction, split off only so {@link createCharacterRig} can wrap it in the
 *  release above without indenting the whole body inside a `try` — the same shape, and for the same
 *  reason, as the two scene builders. `pieces` is filled in as the build goes, so the failure path
 *  releases exactly what exists. */
async function buildCharacterRig(
  scene: Scene, pieces: RigPieces, options: CharacterRigOptions,
): Promise<CharacterRig> {
  const root = new TransformNode('player', scene);
  const follow = createFollowCamera(
    scene, root, options.canvas, options.groundHeight, options.descentFollow);
  pieces.follow = follow;
  scene.activeCamera = follow.camera;
  const shadows = options.makeShadows(follow.camera);

  const input = createInput();
  pieces.input = input;
  // Suspended from here, not from the `return` below: everything after this line can await — the
  // knight's GLB alone is most of a second — and the listeners are already bound by now. See this
  // function's doc for what would be live during that wait. The camera half is not here to release
  // pointer lock -- on a swap the outgoing level released it before `build()` was even called, and
  // on the first build there is none -- it is here to stop the mouse-move steering and the click.
  input.setEnabled(false);
  follow.setEnabled(false);
  const player = createPlayer(scene, root, follow, input, options.crystals, options.spawn);
  pieces.player = player;
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
    follow, shadows, player, knight, readMotion,
    suspendInput: (on: boolean) => { input.setEnabled(!on); follow.setEnabled(!on); },
    // The same call the `catch` above makes, over the same `pieces` — a finished rig and a rejected
    // one cannot be released in two different orders, for `levelTeardown.ts`'s reason.
    dispose: () => releaseRig(pieces),
  };
}
