import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import {
  PhysicsCharacterController,
  CharacterSupportedState,
} from '@babylonjs/core/Physics/v2/characterController';

import { step, isHomingFrame } from '../../domain/hub/character/characterMovement';
import { DEFAULT_CONFIG, type MovementConfig } from '../../domain/hub/character/movementConfig';
import { IDLE, type CharacterMotion } from '../../domain/hub/character/characterMotion';
import type { MovementInput } from '../../domain/hub/character/movementInput';
import { planarDirectionFromInput } from './cameraRelativeDirection';
import { toBabylon, toVec3 } from './vectorConversions';
import { CAPSULE_RADIUS, CAPSULE_HEIGHT } from './capsule';
import { terrainHeight } from './terrainHeight';
import type { FollowCamera } from './followCamera';
import type { InputState } from './input';
import type { Crystals } from './crystals';
import { createHomingReticle } from './homingReticle';
import { stepGroundContact, INITIAL_GROUND_CONTACT } from './groundContact';
import { stepHomingLock, NO_HOMING_LOCK } from './homingLock';
import { alignToSurface } from './slopeMotion';

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
  /**
   * Off the ground, debounced, as decided by `groundContact`. Visuals read this rather than the raw
   * support probe (which chatters) or `motion.isGrounded` (which also encodes the takeoff guard), so
   * that the pose and the physics are answering the same question.
   */
  airborne: boolean;
  /** The live movement config — the same object `window.moveConfig` mutates, so readers track dev tuning. */
  readonly config: MovementConfig;
  /**
   * Expected duration of the CURRENT homing dash, in seconds, or `null` while none is locked — see
   * `HomingLock.entrySeconds`, which decides it. `knight.ts` reads this to retime the Flying Kick clip
   * onto the dash's real screen time, the same way `KnightTuning.airtime` retimes the jump segment
   * onto the jump's actual airtime.
   */
  homingEntrySeconds: number | null;
  /**
   * A homing dash ARRIVED at its crystal on this frame, as opposed to timing out. The two ends of a
   * dash are otherwise indistinguishable downstream — `motion.homing` goes null either way — and the
   * difference cannot be recovered later from `motion.velocity`, which by then holds Havok's
   * POST-SOLVE velocity: collide-and-slide can cancel or project the bounce away (a crystal under an
   * overhang, an arrival frame the support probe called SUPPORTED). Decided once here, from the
   * domain's own result, so the crystal flash and the knight's jump-clip restart cannot disagree
   * about whether a bounce happened.
   */
  homingBounced: boolean;
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
  crystals: Crystals,
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
  // A mutable copy of the movement config, exposed on `window.moveConfig` in dev so speed/accel can be
  // tuned live (e.g. `moveConfig.maxSpeed = 3.5`) to match the walk animation without a rebuild.
  const config = { ...DEFAULT_CONFIG };
  if (import.meta.env.DEV) (window as unknown as { moveConfig: typeof config }).moveConfig = config;
  // The Havok controller itself, for probing its solver settings live in dev.
  if (import.meta.env.DEV) (window as unknown as { charController: unknown }).charController = controller;

  const player: Player = {
    root, motion: IDLE, airborne: false, config, homingEntrySeconds: null, homingBounced: false,
  };
  // Coyote time, jump buffering and the takeoff guard all live in this pure state — see groundContact.
  let contact = INITIAL_GROUND_CONTACT;
  // Which crystal a dash is committed to, its entry estimate, and the reticle's separate selection —
  // all decided by one tested machine rather than inline here. See homingLock.
  let homingLock = NO_HOMING_LOCK;

  // The red target ring the owner asked for, fed `preview` rather than the committed lock — see
  // `HomingLockResult.preview`.
  const reticle = createHomingReticle(scene);

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, MAX_DT);
    if (dt <= 0) return;

    // The jump key is edge-triggered and consumed once, then offered to BOTH the ground-contact
    // machine below and the homing lock; each decides for itself whether this press is for it. At most
    // one can act on it, because their gates are disjoint: `groundContact.canJump` is false for the
    // whole `rising`/`jumpSpent` window that its own `airborne` — the homing lock's precondition —
    // covers.
    //
    // Acting on it is not the same as consuming it, though. `stepGroundContact` arms its
    // `JUMP_BUFFER_SECONDS` buffer from every press it is handed, including one spent on a dash or on
    // nothing, and that buffered press can only be spent if the character becomes jumpable inside the
    // window — which after a dash it does not. So a chain press made a few frames early is dropped,
    // where the identical press aimed at an ordinary jump would have been remembered. Feeding the
    // homing lock from that buffer instead is a feel decision on a mechanic nobody has played yet
    // (see `MovementConstants`' homing block), so it is left as it is rather than guessed at.
    const pressed = input.consumeJump();
    const support = controller.checkSupport(dt, DOWN);
    const contactResult = stepGroundContact(contact, {
      supported: support.supportedState === CharacterSupportedState.SUPPORTED,
      jumpPressed: pressed,
      verticalSpeed: player.motion.velocity.y,
      delta: dt,
    });
    contact = contactResult.state;
    const { grounded, jumpRequested } = contactResult;
    player.airborne = contactResult.airborne;

    const cam = follow.camera;
    const lockResult = stepHomingLock(homingLock, {
      dashInFlight: player.motion.homing !== null,
      jumpPressed: pressed,
      airborne: player.airborne,
      from: toVec3(root.getAbsolutePosition()),
      cameraForward: toVec3(cam.getTarget().subtract(cam.position)),
      candidates: crystals.positions,
    }, config);
    homingLock = lockResult.lock;
    player.homingEntrySeconds = homingLock.entrySeconds;
    if (lockResult.preview === null) reticle.hide();
    else reticle.showAt(crystals.positions[lockResult.preview]);

    const { right, forward } = follow.planarBasis();
    const domainMotion = { ...player.motion, isGrounded: grounded };
    const movementInput: MovementInput = {
      direction: planarDirectionFromInput(input.axis(), right, forward),
      jumpRequested,
      runRequested: input.isRunHeld(),
      homingTarget: lockResult.target,
    };
    // Asked of the domain before the step, not read back off the result: a dash whose crystal is
    // within `homingSpeed * dt` at entry arrives on its own entry frame, so `motion.homing` is never
    // once non-null for it. Deriving "a dash ran" from the motion would make that dash — a specified
    // behaviour the domain pins with its own test — invisible to the flash, the trail and the pose,
    // while the player still receives the full `homingBounceSpeed`. It is reachable: the threshold is
    // `homingSpeed * MAX_DT` = 0.8 units, and a crystal's own extent is 1.273.
    const dashRan = isHomingFrame(domainMotion, movementInput);
    const next = step(domainMotion, movementInput, config, dt);

    // A crystal flashes on the BOUNCE, not on the dash simply ending: `stepHoming` clears `homing` on
    // both an arrival and a timeout (design spec §4-5), and only the arrival hit something. The
    // domain's own `next.velocity.y` is what separates them — arrival sets `homingBounceSpeed`, a
    // timeout zeroes it — and it is read HERE, before `player.motion` below replaces it with Havok's
    // post-solve velocity. See `Player.homingBounced`.
    player.homingBounced = dashRan && next.homing === null && next.velocity.y > 0;
    if (player.homingBounced) {
      if (homingLock.crystal !== null) crystals.flash(homingLock.crystal);
      else console.warn('[playerController] a homing dash bounced with no locked crystal to flash — this should be unreachable.');
    }

    // Following the ground means adding the climb the surface demands — see slopeMotion. A jump is
    // the one grounded frame that must keep its own vertical velocity, so it skips this.
    const solverVelocity = grounded && !jumpRequested
      ? alignToSurface(next.velocity, toVec3(support.averageSurfaceNormal))
      : next.velocity;
    controller.setVelocity(toBabylon(solverVelocity));
    controller.integrate(dt, support, NO_GRAVITY);
    const solved = controller.getPosition();
    root.position.x = solved.x;
    root.position.z = solved.z;
    visualY += (solved.y - visualY) * (1 - Math.exp(-VISUAL_Y_SMOOTHING * dt));
    root.position.y = visualY;
    // Feed the controller's *post-solve* velocity back into the domain (mirrors Godot reading
    // Velocity after MoveAndSlide) — collide-and-slide reduces and redirects it against walls, and
    // storing the pre-integrate target instead would keep full speed into a wall and ping the
    // character off on release.
    player.motion = { ...next, velocity: toVec3(controller.getVelocity()) };

    faceRoot(root, next.facing.x, next.facing.y);
  });

  return player;
}

/**
 * Points `root` along the domain's facing. No smoothing here on purpose: the domain already swings the
 * heading at `turnRate`, and easing it a second time would let the model and the body disagree — which
 * is exactly the mismatch that made running turns look wrong (model round in 0.2s, velocity in 0.6s).
 */
function faceRoot(root: TransformNode, facingX: number, facingY: number): void {
  root.rotation.y = Math.atan2(-facingX, -facingY);
}

