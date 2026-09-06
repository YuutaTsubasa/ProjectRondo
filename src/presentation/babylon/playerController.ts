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
import { stepGroundContact, spendBufferedJump, INITIAL_GROUND_CONTACT } from './groundContact';
import { stepHomingLock, NO_HOMING_LOCK } from './homingLock';
import { solverVelocity } from './slopeMotion';

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
   * Off the ground for the CAPSULE, debounced, as decided by `groundContact` — preferred to the raw
   * support probe (which chatters) and to `motion.isGrounded` (which also encodes the takeoff guard).
   *
   * It is not the signal visuals read, and must not be treated as one. It answers only for the
   * capsule, and the probe genuinely finds floor mid-dash and under a low crystal, where the knight
   * is visibly in flight. Everything above the capsule therefore reads `jumpPose.isOffGround`, which
   * widens this with `homing` and `bounced`; this field is one of that rule's three inputs, not its
   * answer. See `jumpPose.ts` for the frames that separate them.
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
   * POST-SOLVE velocity: collide-and-slide can cancel or project the bounce away, as a ceiling over a
   * crystal under an overhang does. Decided once here, from the domain's own result, so the crystal
   * flash and the knight's jump-clip restart cannot disagree about whether a bounce happened.
   *
   * Also fed back into `stepGroundContact` on the following frame, so that ground found under the
   * crystal cannot cancel the rise this flash promises — see `GroundContactInput.bounced`.
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
    // machine below and the homing lock. The two gates are one boolean and its complement — the lock
    // is handed `!jumpAvailable`, precisely the presses the ground machine will not spend — so every
    // press goes to exactly one of them and none can fall between. That partition is the fix for a
    // window in which one did: the lock used to be gated on `player.airborne`, the
    // FALL_GRACE_SECONDS animation debounce, which lags COYOTE_SECONDS by 0.05 s, and a press inside
    // that lag was consumed, refused as a jump and never offered as a dash. See
    // `HomingLockInput.pressWouldDash`, which also says why the gate is not `!grounded`.
    //
    // Being grounded is not the only way the domain can decline a press, though: on a dash frame it
    // takes the homing branch and never reads `jumpRequested` at all. So the ground machine is told
    // when a dash owns the frame — `dashInFlight` below, and `bounced` for the frame the arrival's
    // climb starts — and declines the press rather than spending it, which keeps it in the
    // `JUMP_BUFFER_SECONDS` buffer and keeps `grounded` false through a bounce, so the chain press
    // reaches the lock as a dash instead of coming back as an ordinary jump. See `groundContact`'s
    // problem 5.
    //
    // Declining a press is not the same as routing it, though. The buffer holds every press the
    // ground machine refuses, the one the lock goes on to commit as a dash included, and the order
    // cannot be swapped to find out first — the lock is gated on `jumpAvailable`, which only the
    // ground machine can answer. So the press the lock takes is retracted from the buffer below, and
    // only the ones it declined stay in it; see `spendBufferedJump` for what the second spend was.
    // What the buffer still cannot do is *hand* an older press to the lock: the lock is
    // fed the frame's edge, so a chain press made before the arrival frame is remembered as a jump
    // and not as a dash. Feeding the lock from the buffer too is a feel decision on a mechanic nobody
    // has played yet (see `MovementConstants`' homing block), so it is left rather than guessed at.
    const pressed = input.consumeJump();
    const support = controller.checkSupport(dt, DOWN);
    // Last frame's dash state, read once and handed to both machines, so they cannot disagree about
    // whether a dash is under way — which of the two the press belongs to turns on exactly this.
    const dashInFlight = player.motion.homing !== null;
    const contactResult = stepGroundContact(contact, {
      supported: support.supportedState === CharacterSupportedState.SUPPORTED,
      jumpPressed: pressed,
      dashInFlight,
      verticalSpeed: player.motion.velocity.y,
      // Still last frame's value: it is only reassigned further down, after the domain step that
      // decides it. That is the frame the bounce was emitted on, and this is the first frame the
      // ground machine can protect the climb from a probe that has found floor under the crystal.
      bounced: player.homingBounced,
      delta: dt,
    });
    contact = contactResult.state;
    const { grounded, jumpRequested, jumpAvailable } = contactResult;
    player.airborne = contactResult.airborne;

    const cam = follow.camera;
    const lockResult = stepHomingLock(homingLock, {
      dashInFlight,
      jumpPressed: pressed,
      pressWouldDash: !jumpAvailable,
      // The physics capsule's position, NOT `root`'s: `root.position.y` is `visualY`, the smoothed
      // visual height, and the filter's steady-state lag while the capsule climbs at `homingSpeed` 24
      // is 1.92 u at 60 fps (2.14 u at the MAX_DT clamp). Everything `stepHoming` derives from this
      // offset — the dash direction, `remaining`, and so both the arrival test and the timeout —
      // would then be measured from a point the capsule is not at, and a lag that never shrinks
      // floors `remaining` at ~1.9 u while the arrival test needs it under `homingSpeed * dt`
      // (0.4–0.8 u), so a steep dash would never be seen arriving and would always time out instead.
      // Read before this frame's `integrate`, which is the position the frame's velocity starts from.
      from: toVec3(controller.getPosition()),
      cameraForward: toVec3(cam.getTarget().subtract(cam.position)),
      candidates: crystals.positions,
    }, config);
    homingLock = lockResult.lock;
    if (lockResult.consumedPress) contact = spendBufferedJump(contact);
    player.homingEntrySeconds = homingLock.kind === 'locked' ? homingLock.entrySeconds : null;
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
    // once non-null for it — and it is reachable, since the threshold is `homingSpeed * MAX_DT` = 0.8
    // units against a crystal's own extent of 1.273. The player receives the full `homingBounceSpeed`
    // for it either way, so the two things that must not miss it are the flash, which says a crystal
    // was hit, and the solver routing below, which is what lets the bounce leave the ground.
    //
    // It reaches those two and nothing else. The trail and the Flying Kick pose come from
    // `hubScene`'s `homing: player.motion.homing !== null`, which such a dash never raises — a
    // one-frame ribbon and a clip retimed onto ~0.02s would be a flicker rather than feedback, so
    // giving them a separate entry-frame path is a feel decision, on a move nobody has played yet.
    const dashRan = isHomingFrame(domainMotion, movementInput);
    const next = step(domainMotion, movementInput, config, dt);

    // A crystal flashes on the BOUNCE, not on the dash simply ending: `stepHoming` clears `homing` on
    // both an arrival and a timeout (design spec §4-5), and only the arrival hit something. The
    // domain's own `next.velocity.y` is what separates them — arrival sets `homingBounceSpeed`, a
    // timeout zeroes it — and it is read HERE, before `player.motion` below replaces it with Havok's
    // post-solve velocity. See `Player.homingBounced`.
    player.homingBounced = dashRan && next.homing === null && next.velocity.y > 0;
    if (player.homingBounced) {
      if (homingLock.kind === 'locked') crystals.flash(homingLock.crystal);
      else console.warn('[playerController] a homing dash bounced with no locked crystal to flash — this should be unreachable.');
    }

    // Following the ground means adding the climb the surface demands — see slopeMotion, which also
    // says why a jump and a dash have to be kept away from it.
    const forSolver = solverVelocity(next.velocity, toVec3(support.averageSurfaceNormal), {
      grounded,
      ownsClimb: jumpRequested || dashRan,
    });
    controller.setVelocity(toBabylon(forSolver));
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
