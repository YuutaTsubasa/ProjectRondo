import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import {
  PhysicsCharacterController,
  CharacterSupportedState,
} from '@babylonjs/core/Physics/v2/characterController';

import { step } from '../../domain/hub/character/characterMovement';
import { DEFAULT_CONFIG } from '../../domain/hub/character/movementConfig';
import { IDLE, type CharacterMotion } from '../../domain/hub/character/characterMotion';
import { planarDirectionFromInput } from './cameraRelativeDirection';
import { toBabylon, toVec3 } from './vectorConversions';
import { CAPSULE_RADIUS, CAPSULE_HEIGHT } from './capsule';
import { terrainHeight } from './terrainHeight';
import type { FollowCamera } from './followCamera';
import type { InputState } from './input';

const TURN_SPEED = 12;
/**
 * Frame-time clamp. A backgrounded tab stalls the render loop; on return the first frame's
 * getDeltaTime() can be many seconds, and one domain step with a huge dt (gravity*dt, a single
 * integrate move of hundreds of units) tunnels the capsule through the floor. Cap dt to ~2 frames.
 */
const MAX_DT = 1 / 30;
const DOWN = new Vector3(0, -1, 0);
const NO_GRAVITY = Vector3.Zero(); // gravity lives in the domain; Havok must not add its own
/**
 * Rate the *visual* root Y eases toward the physics capsule's Y. The Havok character controller
 * micro-oscillates on slopes (never fully settles) and steps across the terrain collider's triangles,
 * so its Y judders frame to frame; the camera and knight read the root, so they judder too. Easing the
 * visual Y (physics still uses the controller's own position) smooths both without affecting movement.
 * NB this is load-bearing, not redundant with the knight's terrain re-anchor: that re-anchor reads a
 * one-frame-stale getAbsolutePosition, so it cancels the root Y only imperfectly — bypassing this
 * smoothing brings the knight's descent judder back (~27 direction reversals vs 1, measured).
 */
const VISUAL_Y_SMOOTHING = 14;

export interface Player {
  readonly root: TransformNode;
  motion: CharacterMotion;
}

/**
 * Drives `root` with a Havok character controller whose motion is computed by the pure domain.
 * Each frame: read ground support → domain step (owns gravity/jump) → apply the resulting velocity
 * to the controller for collide-and-slide → copy the resolved position back to `root`.
 */
export function createPlayer(
  scene: Scene,
  root: TransformNode,
  follow: FollowCamera,
  input: InputState,
): Player {
  // Spawn the capsule's base ON the terrain surface (+ a small lift so it settles down onto it rather
  // than starting embedded — an embedded capsule pops through the one-sided MESH collider and falls).
  const start = new Vector3(0, terrainHeight(0, 0) + CAPSULE_HEIGHT / 2 + 0.3, 0);
  let visualY = start.y; // smoothed visual Y (see VISUAL_Y_SMOOTHING)
  const controller = new PhysicsCharacterController(
    start,
    { capsuleRadius: CAPSULE_RADIUS, capsuleHeight: CAPSULE_HEIGHT },
    scene,
  );
  const player: Player = { root, motion: IDLE };

  // A mutable copy of the movement config, exposed on `window.moveConfig` in dev so speed/accel can be
  // tuned live (e.g. `moveConfig.maxSpeed = 3.5`) to match the walk animation without a rebuild.
  const config = { ...DEFAULT_CONFIG };
  if (import.meta.env.DEV) (window as unknown as { moveConfig: typeof config }).moveConfig = config;

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, MAX_DT);
    if (dt <= 0) return;

    const support = controller.checkSupport(dt, DOWN);
    // Grounded only when supported AND not ascending. Right after a jump the capsule
    // hasn't cleared the ground yet, so the support probe still reports SUPPORTED; without
    // the ascending guard the domain would re-ground and cancel the jump's upward velocity.
    const ascending = player.motion.velocity.y > 0;
    const grounded = support.supportedState === CharacterSupportedState.SUPPORTED && !ascending;

    const { right, forward } = follow.planarBasis();
    const direction = planarDirectionFromInput(input.axis(), right, forward);
    const next = step(
      { ...player.motion, isGrounded: grounded },
      { direction, jumpRequested: input.consumeJump() },
      config,
      dt,
    );

    controller.setVelocity(toBabylon(next.velocity));
    controller.integrate(dt, support, NO_GRAVITY);
    const solved = controller.getPosition();
    root.position.x = solved.x;
    root.position.z = solved.z;
    visualY += (solved.y - visualY) * (1 - Math.exp(-VISUAL_Y_SMOOTHING * dt));
    root.position.y = visualY;
    // Feed the controller's *post-solve* velocity back into the domain (mirrors Godot reading
    // Velocity after MoveAndSlide). Today the hub is a bare plane so this equals `next.velocity`,
    // but once there are walls, collide-and-slide reduces/redirects it — storing the pre-integrate
    // target instead would keep full speed into a wall and ping the character off on release.
    player.motion = { ...next, velocity: toVec3(controller.getVelocity()) };

    faceMovement(root, next.facing.x, next.facing.y, dt);
  });

  return player;
}

/** Rotates `root` toward the planar facing direction with a framerate-independent lerp. */
function faceMovement(root: TransformNode, facingX: number, facingY: number, dt: number): void {
  const targetYaw = Math.atan2(-facingX, -facingY);
  const current = root.rotation.y;
  const shortest = Math.atan2(Math.sin(targetYaw - current), Math.cos(targetYaw - current));
  root.rotation.y = current + shortest * Math.min(1, TURN_SPEED * dt);
}
