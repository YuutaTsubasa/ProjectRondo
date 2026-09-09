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
import { exposeDevHandle } from './devHandles';
import { toBabylon, toVec3 } from './vectorConversions';
import { CAPSULE_RADIUS, CAPSULE_HEIGHT } from './capsule';
import type { FollowCamera } from './followCamera';
import type { InputState } from './input';
import type { Crystals } from './crystals';
import { createHomingReticle } from './homingReticle';
import { stepGroundContact, spendBufferedJump, INITIAL_GROUND_CONTACT } from './groundContact';
import { stepHomingLock, NO_HOMING_LOCK } from './homingLock';
import { respawned } from './respawn';
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
  /**
   * The physics capsule's CENTRE this frame — the character's real position, and the one any rule
   * that decides something must read.
   *
   * `root.position` is not it. Its x and z are the capsule's, copied straight across, but its y is
   * `visualY`: the exponentially smoothed *rendered* height (see {@link VISUAL_Y_SMOOTHING}), which
   * trails the capsule by `v / 14` — 2.2 u at the end of a 20 u fall, measured 1.80 at touchdown
   * (design spec §13.2). A checkpoint decided from that activates late on the way up and, on the way
   * down, lets the player fall 2 u further than `fallMargin` says before the respawn fires. The same
   * confusion cost PR #39 a homing dash aimed 1.5 u behind the truth; see the `from:` argument below.
   *
   * A fresh `Vector3` per call, deliberately: `PhysicsCharacterController.getPosition()` returns the
   * controller's LIVE internal vector, not a copy (design spec §13.1), so handing it out would let a
   * caller move the character by writing to what looks like a reading.
   */
  capsulePosition(): Vector3;
  /**
   * Puts the character at `to` as a cut, not as a move — for a checkpoint respawn.
   *
   * Four things hold the old POSITION, and a teleport that misses any one of them reads as a swoop
   * rather than a respawn; all four were measured (design spec §13.1), not reasoned about:
   *
   * 1. The controller's position. `setPosition` moves the capsule exactly and immediately.
   * 2. The controller's velocity — necessary but nowhere near sufficient. It survives less than one
   *    frame, because the observer below rewrites it from `motion.velocity` before every `integrate`.
   * 3. `motion.velocity`, therefore. Without it a fall's speed is restored on the very next frame and
   *    the character drops off the checkpoint again at the speed it arrived with.
   * 4. `visualY`, the smoothed *rendered* height, **and `root` itself**. `visualY` is closure state
   *    with no other way in, so a teleport up 53 units left the knight rendered at the old height,
   *    gliding up over ~0.33 s. `root` is written from `visualY` in the observer below, which for a
   *    respawn decided in a LATER observer means it would keep the old position for the rest of the
   *    frame — the frame that respawn is drawn on. Writing it here is not cosmetic: the camera reads
   *    the character only through `root`, so a stale one is a stale re-seed: measured on a real
   *    tower respawn, the camera passed the checkpoint frame 3.6 u below where it belonged and took
   *    0.40 s to climb back, which is a glide where `FollowCamera.snap()` promises a cut.
   *
   * A fifth holds the old INTENT, and it is not a matter of how the arrival looks: a homing dash in
   * flight. `respawn.ts` owns that rule and says why the dash would otherwise resume from the
   * checkpoint on the very next frame.
   *
   * The camera holds a sixth — `smoothY` — which is not this function's to reset. Call
   * `FollowCamera.snap()` alongside this one, and after it: `snap` re-seeds from `root`, which is
   * only the destination once this function has run.
   *
   * Teleport into open air above the destination surface, never onto it: the ground collider is
   * one-sided, and a capsule placed below a surface falls out of the world rather than landing on it.
   */
  teleport(to: Vector3): void;
  /**
   * Releases what the character holds outside the scene, and stops its per-frame observer.
   *
   * `scene.dispose()` is not enough and never was. It reaches the controller's `CCTransformNode` and
   * its `PhysicsBody` through the physics-body dispose observer, but it has no way to reach the
   * `PhysicsCharacterController` itself — nothing in the scene graph points at it — so its
   * `PhysicsShapeCapsule` and its two `HP_QueryCollector_Create(16)` handles stay in the Havok WASM
   * heap. That was harmless while one scene lived for the whole page; with a hub ⇄ tower swap it is
   * the one thing in the level that grows without bound, because `havokModule.ts` caches the module
   * — and with it the heap — for the life of the page by design (spec §6).
   *
   * **Call this while the scene's physics engine is still alive.** The controller's own `dispose()`
   * looks up `scene.getPhysicsEngine().getPhysicsPlugin()` to release those collectors, so after
   * `scene.dispose()` there is no plugin left to release them through — see `levelTeardown.ts`,
   * which is what fixes that order for both levels.
   */
  dispose(): void;
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
  spawn: Vector3,
): Player {
  // Where the capsule's CENTRE starts. The caller owns it, because only the caller knows what the
  // ground under it is — see the hub's call site for how it places the capsule's base on the terrain.
  let visualY = spawn.y; // smoothed visual Y (see VISUAL_Y_SMOOTHING)
  const controller = new PhysicsCharacterController(
    spawn,
    { capsuleRadius: CAPSULE_RADIUS, capsuleHeight: CAPSULE_HEIGHT },
    scene,
  );
  // A mutable copy of the movement config, exposed on `window.moveConfig` in dev so speed/accel can be
  // tuned live (e.g. `moveConfig.maxSpeed = 3.5`) to match the walk animation without a rebuild.
  const config = { ...DEFAULT_CONFIG };
  exposeDevHandle(scene, 'moveConfig', config);
  // The Havok controller itself, for probing its solver settings live in dev.
  exposeDevHandle(scene, 'charController', controller);

  // Coyote time, jump buffering and the takeoff guard all live in this pure state — see groundContact.
  let contact = INITIAL_GROUND_CONTACT;
  // Which crystal a dash is committed to, its entry estimate, and the reticle's separate selection —
  // all decided by one tested machine rather than inline here. See homingLock. Declared above the
  // player rather than beside `contact` because `teleport` clears it.
  let homingLock = NO_HOMING_LOCK;

  const player: Player = {
    root, motion: IDLE, airborne: false, config, homingEntrySeconds: null, homingBounced: false,
    capsulePosition: () => controller.getPosition().clone(),
    teleport(to: Vector3): void {
      controller.setPosition(to);
      // Both velocities, in that order of importance: the domain's is the one that survives, since
      // the observer below copies it onto the controller before the next `integrate`. The controller's
      // is zeroed anyway so that nothing reads a stale fall speed off it in between.
      controller.setVelocity(Vector3.Zero());
      // The domain velocity and the dash together, from one tested rule — see `respawn.ts` for why a
      // dash left in flight across a teleport resumes from the checkpoint on the next frame.
      const cut = respawned(player.motion);
      player.motion = cut.motion;
      homingLock = cut.lock;
      // Follows the lock: the observer below recomputes it from `homingLock` every frame, and this
      // keeps the two from disagreeing on the frames between the cut and the next one.
      player.homingEntrySeconds = null;
      // Re-seed the render smoothing at the destination, so the knight is drawn there on the very
      // next frame instead of easing up to it from wherever it was standing.
      visualY = to.y;
      // And the transform the smoothing feeds, in the same breath. The observer below writes `root`
      // once a frame from the solved capsule, so a respawn decided after it leaves `root` a frame
      // behind — and `root` is the only thing that can be read for where the character *is* being
      // drawn. `FollowCamera.snap()` re-seeds from exactly this, and seeded a frame late it re-seeded
      // at the height of the fall (see this method's doc, point 4).
      root.position.copyFrom(to);
    },
    dispose(): void {
      // The observer first: `onFrame` calls `checkSupport` and `integrate` on the controller, and a
      // released controller integrated on a later frame is a use-after-free in the WASM heap. Today
      // nothing renders a level being torn down (`App.svelte` swaps the render loop off it first),
      // but that is the caller's ordering and not this file's to assume.
      scene.onBeforeRenderObservable.removeCallback(onFrame);
      controller.dispose();
    },
  };

  // The red target ring the owner asked for, fed `preview` rather than the committed lock — see
  // `HomingLockResult.preview`.
  const reticle = createHomingReticle(scene);

  // Named rather than inline, so `player.dispose` above can take it off the observable again.
  const onFrame = () => {
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
      // visual height. While the capsule climbs steadily at `homingSpeed` 24, the smoothing at the
      // foot of this observer leaves the rendered root standing behind the capsule, at the same
      // instant, by `homingSpeed * dt * (1 - a) / a` for that line's own `a` — 1.52 u at 60 fps,
      // 1.35 u at the MAX_DT clamp. A longer frame shrinks that gap rather than widening it (larger
      // `dt`, larger `a`), so the clamp is the mild end and the worst case is the short-frame limit
      // `homingSpeed / VISUAL_Y_SMOOTHING` = 1.71 u. Everything `stepHoming` derives from this offset
      // — the dash direction, `remaining`, and so both the arrival test and the timeout — would then
      // be measured from a point the capsule is not at, and a lag that never shrinks floors
      // `remaining` at 1.35 u or more while the arrival test needs it under `homingSpeed * dt`
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
      // The character runs by default; holding Shift asks it to walk instead (`isWalkHeld`), so
      // `runRequested` — the domain's "run this frame" flag — is the negation of that.
      runRequested: !input.isWalkHeld(),
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
  };
  scene.onBeforeRenderObservable.add(onFrame);

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
