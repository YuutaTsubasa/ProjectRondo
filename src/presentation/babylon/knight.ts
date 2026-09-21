import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Shadows } from './shadows';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { createDashTrail, type DashTrail } from './dashTrail';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import type { PhysicsEngine as PhysicsEngineV2 } from '@babylonjs/core/Physics/v2/physicsEngine';
// Side-effect: registers the glTF loader plugin (with KHR_mesh_quantization / webp support).
import '@babylonjs/loaders/glTF';
import { CAPSULE_HALF } from './capsule';
import { measureSkinnedSole } from './skinnedSole';
import { PLAYER_MODEL } from './playerModel';
import { applyPlayerMaterials } from './playerMaterials';
import { attachPlayerBlink } from './playerBlink';
import type { GroundHeight } from './groundHeight';
import { moveToward } from '../../domain/math/scalar';
import { stepJumpPose, INITIAL_JUMP_POSE } from './jumpPose';

export interface KnightAnimations {
  readonly idle: AnimationGroup;
  readonly walk: AnimationGroup;
  readonly run: AnimationGroup;
  readonly jump: AnimationGroup;
  readonly kick: AnimationGroup;
}

/** What the animation layer needs to know about the player each frame. */
export interface KnightMotionSample {
  /** Horizontal speed, world units/s. */
  readonly planarSpeed: number;
  /**
   * Off the ground, as decided by `groundContact` — the one machine that owns that call for the
   * capsule. Deciding it a second time here is what let the pose and the physics disagree: an earlier
   * copy of the rule could latch on `air` forever if the probe never released, leaving the knight
   * floating and no jump ever animating again.
   *
   * The pose does not read this directly. `stepJumpPose` widens it with {@link homing} and
   * {@link bounced} rather than re-deciding it, because the probe genuinely finds floor during a dash
   * and under a low crystal — see that module.
   */
  readonly airborne: boolean;
  /** `player.motion.homing !== null` — non-null exactly while a homing dash is in flight. Drives the
   *  Flying Kick clip and the trail below. */
  readonly homing: boolean;
  /**
   * Expected duration of the CURRENT dash, in seconds, or `null` while none is locked —
   * `Player.homingEntrySeconds`: the straight-line offset length to the crystal at lock time, divided
   * by `homingSpeed`, held fixed for the dash's whole flight (see that field's doc for why it is not
   * recomputed every frame). Read exactly once, on the frame `homing` turns on, to retime the Flying
   * Kick clip onto the dash's real screen time — see {@link KICK_STRIKE_START}.
   */
  readonly homingEntrySeconds: number | null;
  /**
   * A homing dash arrived at its crystal on THIS frame, as opposed to timing out — `Player.homingBounced`,
   * decided there from the domain's own result. Not derived from a vertical velocity read here: by the
   * time this layer sees `motion.velocity`, collide-and-slide has already had it, so an arrival whose
   * upward velocity the solver cancelled would read as a timeout. Also true for a dash short enough to
   * arrive on its entry frame, which never sets {@link KnightMotionSample.homing} at all.
   */
  readonly bounced: boolean;
}

/** Movement numbers the animation layer has to match, read live so `window.moveConfig` tuning applies. */
export interface KnightTuning {
  /** Top walking speed, world units/s — the locomotion blend's "fully walking" point. */
  readonly walk: number;
  /** Top running speed, world units/s — the blend's "fully running" point. */
  readonly run: number;
  /** How long a flat-ground jump stays airborne, in seconds; the jump clip is retimed to fill it. */
  readonly airtime: number;
}

/** The loaded knight: its clips, plus the foot-planting seam {@link driveKnightAnimation} drives. */
export interface Knight {
  readonly animations: KnightAnimations;
  /**
   * How much the visual is pulled down onto the terrain: 1 = feet planted, 0 = riding the capsule.
   * Driven by {@link driveKnightAnimation} from the same off-ground signal as the jump clip (see
   * `stepJumpPose`, which is also why a dash does not briefly re-plant them), so the feet
   * and the pose can never disagree. Reading the raw support probe here instead would bob the knight
   * several centimetres, since it drops out for ~10% of frames while running.
   */
  planted: number;
  /** Blue dash trail, started when `homing` turns on and stopped at the bounce or the timeout — see
   *  {@link driveKnightAnimation}. Created once, hidden, in {@link loadKnight}. */
  readonly trail: DashTrail;
  /**
   * Unsubscribes the blink driver and {@link plantFeet} correction attached by {@link loadKnight}.
   *
   * Also disposes the trail meshes, materials and generator. The imported model and clips remain
   * scene-owned. Repeated release calls are harmless, including during level teardown.
   */
  release(): void;
}

/**
 * How far above the soles the ground probe starts, and how far below them it reaches.
 *
 * The capsule always rests a little ABOVE whatever it stands on (rounded bottom plus the
 * controller's keepDistance) — measured at 0.109–0.142 across jumps onto the pedestal from three
 * directions, open ground, and a pillar crown (design spec §9b, capsule bottom minus support-surface
 * height) — so the ray has to start above the soles to be sure it is above the surface, and reach far
 * enough below to still find the ground during the brief `planted` fade after takeoff.
 */
const GROUND_PROBE_ABOVE = 0.25;
const GROUND_PROBE_BELOW = 1;

/** Target on-screen height of the knight, in world units (roughly the physics capsule height; see capsule.ts). */
const TARGET_HEIGHT = PLAYER_MODEL.height;
/** Fraction of the idle animation's motion to keep (0 = frozen, 1 = full sway). Kills the side rock. */
const IDLE_SWAY_KEEP = 0.2;

/**
 * The knight's base orientation: the model faces +Z on import, so this turns its back to the
 * third-person camera (the hub is right-handed and third-person cameras trail the character, so the
 * model's front has to face away from the rig). Named rather than inlined at its one call site
 * (`root.rotationQuaternion = KNIGHT_FACING.clone()` in {@link loadKnight}) so that assignment reads as
 * "the import correction" instead of a bare `Quaternion.FromEulerAngles(0, PLAYER_MODEL.facingYaw, 0)` a reader would
 * have to re-derive the reason for.
 *
 * That call site assigns a `.clone()`: Babylon's `rotationQuaternion` is more often mutated via
 * `.copyFrom`/`.set` than reassigned, so handing out this module-level instance would let a later
 * reader rewrite the correction itself.
 */
const KNIGHT_FACING = Quaternion.FromEulerAngles(0, PLAYER_MODEL.facingYaw, 0);

/**
 * Builds "how high is the surface actually under the soles?", used by the foot-planting below.
 *
 * This exists because {@link GroundHeight} answers for the world's ground *surface*, not for the
 * height of whatever the player is standing on. Anything with its own collider — the hub's plaza
 * pedestal, a pillar, a rock, the tower's platforms — sits above that surface, and planting against
 * it drops the knight straight through. Measured in the HUB, on the plaza pedestal, before this probe
 * existed: the capsule bottom was correctly at 1.843 on a 1.717 top, while the knight's lowest
 * rendered vertex was at 1.167 — exactly the hub's height field at (-6, 32), i.e. the model rendered
 * through the pedestal and stood on the terrain. The numbers are that scene's; the failure is not.
 *
 * A physics raycast is used rather than the character controller's support probe because
 * `CharacterSurfaceInfo` in this Babylon version carries only normals and velocities — there is no
 * `averageSurfacePosition` to read a height off.
 *
 * The ray is NOT filtered against the player's own capsule, which is safe here and was checked
 * rather than assumed: `PhysicsCharacterController` registers no body the raycast can see (its
 * `collider` is undefined), and a ray started inside the capsule still reports the pedestal at
 * 1.717. If that ever changes, the fix is an `ignoreBody` in the query.
 *
 * On a miss it defers to the world's ground query — and that query may itself have no answer, in
 * which case this has none either. A miss means "nothing under this foot within the ray's reach",
 * which is not the same as "the ground is wherever this world's floor is": in a level of stacked
 * platforms the two differ by the whole height of the climb, and the ray misses at every platform's
 * *edge*, where the foot has stepped past the slab while the capsule is still supported by it.
 * Lengthening the ray does not close that — the miss is horizontal — it only reaches the floor
 * sooner. See {@link GroundHeight} for which worlds answer and why, and {@link plantFeet} for what
 * "no answer" does to the plant.
 */
function createGroundProbe(
  scene: Scene,
  groundHeight: GroundHeight,
): (x: number, footY: number, z: number) => number | null {
  // `raycastToRef` writes into these instead of allocating a result and two vectors every frame.
  // It lives on the v2 engine; `IPhysicsEngine` only declares the allocating `raycast`.
  const result = new PhysicsRaycastResult();
  const from = new Vector3();
  const to = new Vector3();
  return (x, footY, z) => {
    const engine = scene.getPhysicsEngine() as PhysicsEngineV2 | null;
    if (!engine) return groundHeight(x, z);
    from.set(x, footY + GROUND_PROBE_ABOVE, z);
    to.set(x, footY - GROUND_PROBE_BELOW, z);
    engine.raycastToRef(from, to, result);
    return result.hasHit ? result.hitPointWorld.y : groundHeight(x, z);
  };
}

/**
 * Registers the per-frame foot plant: drops the visual root by however far the capsule bottom sits
 * above the surface under it, faded out by `knight.planted`. Split out of {@link loadKnight} and
 * exported so a test can drive it against a bare scene — the seating this runs after needs the GLB,
 * the correction itself does not, and the rule worth pinning is about the correction.
 *
 * **What a frame does when the probe has no answer: nothing.** The probe answers `null` when nothing
 * is under the foot *and* the world cannot say where its ground is (see {@link createGroundProbe} and
 * {@link GroundHeight}), and this leaves the root exactly where the last answered frame put it. The
 * correction is small — the capsule rests 0.109-0.142 u above what it stands on, per
 * {@link GROUND_PROBE_ABOVE} — so the previous frame's is a good answer, and it is the only honest
 * one available: the alternative is the one this replaced, where a world's floor stood in for "the
 * surface under this foot" and a sole reaching past the edge of a platform drew the knight down at
 * the floor, tens of units below the capsule it is parented to.
 *
 * **Holding rather than clearing to `seatedLocalY`.** At a platform's edge the character is still
 * standing: `planted` is 1 and stays 1, so there is no fade to ride the correction out on, and
 * dropping it outright would step the knight by that tenth of a unit every time a sole crossed an
 * edge. Once the character does leave the ground, `planted` fades and the first branch below returns
 * the root to `seatedLocalY` on its own.
 *
 * Returns the unsubscribe for the observer it adds. Nothing needs it today — a level owns its whole
 * `Scene`, and disposing that clears the observable — but a subscription whose only way out is the
 * death of the object it hangs off is one that decides for every future caller, and the inline code
 * this was pulled out of had no way to hand one back. {@link Knight.release} is where it goes.
 */
export function plantFeet(
  scene: Scene,
  root: TransformNode,
  parent: TransformNode,
  knight: Pick<Knight, 'planted'>,
  seatedLocalY: number,
  groundHeight: GroundHeight,
): () => void {
  const groundUnder = createGroundProbe(scene, groundHeight);
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (knight.planted <= 0) {
      root.position.y = seatedLocalY;
      return;
    }
    const p = parent.getAbsolutePosition();
    const footY = p.y - CAPSULE_HALF;
    const surface = groundUnder(p.x, footY, p.z);
    if (surface === null) return;
    root.position.y = seatedLocalY - knight.planted * (footY - surface);
  });
  return () => { scene.onBeforeRenderObservable.remove(observer); };
}

/** Seats the trail origin against this imported character's rendered torso. */
export function anchorKnightTrail(
  generator: TransformNode,
  root: TransformNode,
  importedNodes: readonly TransformNode[],
): void {
  // The converted VRM receipt identifies the same transform animated by FlyingKick. Following it
  // preserves the origin when the pose raises or leans the body relative to the capsule.
  const chest = importedNodes.find((node) => node.name === PLAYER_MODEL.trailTorsoNode && node.isDescendantOf(root));
  generator.parent = chest ?? root;
  generator.position.set(0, chest ? 0 : (TARGET_HEIGHT / 2 - CAPSULE_HALF - root.position.y) / root.scaling.y, 0);
}
/**
 * Loads the knight GLB, parents it to `parent` (the physics-driven player root), scales it to
 * {@link TARGET_HEIGHT}, seats its feet at the capsule bottom, and returns the five animation
 * groups with Idle playing. The mesh inherits the parent's facing rotation. `motion` is polled each
 * frame to keep the feet planted only while the character is actually on the ground.
 *
 * Imported material metadata controls the toon adapter and body-only shadow reception.
 */
export async function loadKnight(
  scene: Scene,
  parent: TransformNode,
  shadows: Shadows,
  groundHeight: GroundHeight,
): Promise<Knight> {
  const result = await ImportMeshAsync(PLAYER_MODEL.url, scene);
  const root = result.meshes[0] as TransformNode;
  root.parent = parent;
  root.position.setAll(0);

  // Skinned-mesh bounding boxes track the bind pose, not the animated pose, so babylon frustum-culls
  // limbs at some camera angles (a foot vanishes, then reappears when you rotate). Force the knight
  // meshes to always render — it's one character, the cull savings don't matter.
  for (const mesh of result.meshes) mesh.alwaysSelectAsActiveMesh = true;

  // The whole knight casts — including the head, so its shadow lands on the ground and the
  // shoulders. Only the body receives; a shadow edge across the face reads badly.
  shadows.cast(...result.meshes);
  shadows.receive(...applyPlayerMaterials(result.meshes, scene));

  const raw = root.getHierarchyBoundingVectors(true);
  const rawHeight = raw.max.y - raw.min.y;
  if (rawHeight > 0) root.scaling.scaleInPlace(TARGET_HEIGHT / rawHeight);

  // The scene is right-handed (see hubScene), so the glTF loads natively with no handedness
  // reflection — skinning stays correct under any parent yaw. The model faces +Z on import;
  // rotate 180° so its back is to the third-person camera.
  root.rotationQuaternion = KNIGHT_FACING.clone();

  // Rough initial seating from the bind-pose bounds; refined below once the idle pose is evaluated.
  const bindBounds = root.getHierarchyBoundingVectors(true);
  root.position.y += parent.getAbsolutePosition().y - CAPSULE_HALF - bindBounds.min.y;

  const groups = result.animationGroups;
  const byName = (pattern: RegExp): AnimationGroup | undefined => groups.find((g) => pattern.test(g.name));
  const idle = byName(/idle/i);
  const walk = byName(/walk/i);
  const run = byName(/run/i);
  const jump = byName(/jump/i);
  const kick = byName(/kick/i);
  if (!idle || !walk || !run || !jump || !kick) {
    throw new Error(`${PLAYER_MODEL.url} must contain Idle, Walk, Run, Jump and Flying Kick animations; found: ${groups.map((g) => g.name).join(', ') || '(none)'}`);
  }
  // The mocap idle rocks the torso ~2cm side to side ("leans left then right"). Damp the whole idle
  // toward its average pose so the knight stands steady, keeping a little life. Idle only — damping a
  // run or a jump would flatten exactly the motion those clips exist for.
  dampenSwayTowardMean(idle, IDLE_SWAY_KEEP);
  for (const g of groups) g.stop();
  idle.play(true);

  // Attach to the animated torso after the known Idle seating is evaluated below.
  const trailGenerator = new TransformNode('knightTrailGenerator', scene);
  trailGenerator.parent = root;

  const trail = createDashTrail(scene, trailGenerator, PLAYER_MODEL.trailRadius);
  // Frame-loop subscriptions owned by this visual, drained by release before scene teardown.
  const attached: (() => void)[] = [];
  // Blink and foot planting each own their own scene subscription.
  const releaseBlink = attachPlayerBlink(scene, result.meshes);
  const knight: Knight = {
    animations: { idle, walk, run, jump, kick },
    planted: 1,
    trail,
    release: () => { releaseBlink(); trail.dispose(); trailGenerator.dispose(); for (const detach of attached.splice(0)) detach(); },
  };

  // Calibrate against a known Idle pose before the animation driver can switch to a spawn fall,
  // jump or locomotion. The first rendered frame is not a pose-readiness boundary: linked glTF
  // bones can still have a cached bind-pose palette, leaving the new model ~0.77u above the floor.
  // Explicitly evaluate frame zero and synchronize skin/world matrices; no render or timer needed.
  const skinnedMeshes = result.meshes.filter((m) => m.skeleton && m.getTotalVertices() > 0);
  if (skinnedMeshes.length > 0) {
    idle.goToFrame(idle.from);
    const sole = measureSkinnedSole(skinnedMeshes);
    root.position.y += parent.getAbsolutePosition().y - CAPSULE_HALF - sole;
    const seatedLocalY = root.position.y;
    // The capsule's keepDistance and slopes lift its bottom above support. Planting removes that
    // small gap while grounded, then fades out with the same airborne signal as the jump pose.
    attached.push(plantFeet(scene, root, parent, knight, seatedLocalY, groundHeight));
  }

  anchorKnightTrail(trailGenerator, root, result.transformNodes);
  return knight;
}

/**
 * Shrinks every position/rotation track in `group` toward its own average value, keeping only
 * `keep` of the original motion. Reduces the idle's whole-body sway without freezing it.
 */
function dampenSwayTowardMean(group: AnimationGroup, keep: number): void {
  for (const { animation } of group.targetedAnimations) {
    const keys = animation.getKeys();
    if (keys.length === 0) continue;
    if (animation.targetProperty === 'position') {
      let mx = 0, my = 0, mz = 0;
      for (const k of keys) { mx += k.value.x; my += k.value.y; mz += k.value.z; }
      mx /= keys.length; my /= keys.length; mz /= keys.length;
      for (const k of keys) {
        k.value.x = mx + (k.value.x - mx) * keep;
        k.value.y = my + (k.value.y - my) * keep;
        k.value.z = mz + (k.value.z - mz) * keep;
      }
    } else if (animation.targetProperty === 'rotationQuaternion') {
      // Approximate mean quaternion by the (hemisphere-aligned) component sum, then slerp toward it.
      let sx = 0, sy = 0, sz = 0, sw = 0;
      for (const k of keys) {
        const q = k.value as Quaternion;
        const s = q.w < 0 ? -1 : 1;
        sx += s * q.x; sy += s * q.y; sz += s * q.z; sw += s * q.w;
      }
      const n = Math.hypot(sx, sy, sz, sw) || 1;
      const mean = new Quaternion(sx / n, sy / n, sz / n, sw / n);
      for (const k of keys) {
        (k.value as Quaternion).copyFrom(Quaternion.Slerp(mean, k.value as Quaternion, keep));
      }
    }
  }
}

/** Planar speed above which the knight is at least walking (mirrors Godot's WalkAnimationThreshold). */
export const WALK_THRESHOLD = 0.6;
/** Locomotion cross-fade rate; one clip's worth of blend takes ~0.2s (mirrors Godot's AnimationBlend). */
const BLEND_PER_SECOND = 1 / 0.2;
/** Jump blends over the locomotion faster than clips blend into each other — a jump must read as immediate. */
const JUMP_BLEND_PER_SECOND = 1 / 0.1;
/** Rate at which the feet re-plant on landing / release on takeoff (see the seating pass). */
const PLANT_PER_SECOND = 1 / 0.1;
/** Weight below which a clip is treated as not contributing and is stopped outright. */
const WEIGHT_EPSILON = 0.001;
/** Floor for divisors taken from live-tunable config, so a degenerate tuning cannot divide by zero. */
const DIVISOR_FLOOR = 1e-3;

/**
 * Jump clip segments, in seconds into the 2.167s clip. The clip opens on a stand and an anticipation
 * crouch, and closes on a recovery that locomotion takes over, so only the middle is played. Measured
 * from the hip-height curve: standing 0.99 → crouch bottom 0.723 at 0.54s → back through standing at
 * 0.76s → apex 1.240 at 1.05s → touchdown ~1.30s → absorbed ~1.78s.
 *
 * The airborne segment deliberately starts at 0.72s, *past* most of the anticipation crouch: the
 * game's jump is instantaneous, so a crouch played after the capsule has already left the ground
 * reads as the knight hanging in mid-air still winding up (measured 0.2s of it). Starting here leaves
 * only ~0.08 of hip dip. The segment is then retimed to fill the real airtime, so it neither runs out
 * early (which would pop the pose back to idle before touchdown) nor cut off mid-rise.
 *
 * Touchdown ends the clip's involvement. The land-and-recover tail is *not* played: it is a
 * half-second of crouching and straightening back up to a stand, which a character still running at
 * 8 u/s plainly is not doing — it read as the knight stalling on landing. Blending straight back to
 * locomotion lets whatever the player is actually doing take over, and a stop still looks settled
 * because idle blends in the same way.
 */
const JUMP_LAUNCH_START = 0.72;
const JUMP_FALL_END = 1.3;

/**
 * Where a homing bounce restarts the jump clip: the same seam measured above — 0.76s, where the hip
 * curve passes back through standing and the rise begins — not {@link JUMP_LAUNCH_START}'s 0.72s.
 *
 * A bounce is the same problem `JUMP_LAUNCH_START` solves: the capsule is already moving (upward, at
 * `homingBounceSpeed`) before any clip plays, so starting at the clip's head would show the
 * anticipation crouch after the capsule has already left the ground — the knight winding up in
 * mid-air. `JUMP_LAUNCH_START` accepts ~0.08s of residual dip because a real jump departs from a
 * stand and the tiny crouch reads as part of that departure; a bounce has no stand to depart from, so
 * there is no residue worth keeping and this starts exactly at the seam where the rise begins instead.
 */
const BOUNCE_RESTART = 0.76;

/**
 * Flying Kick clip segment, in seconds into the imported clip's 1.500s range — measured the same way
 * as {@link JUMP_LAUNCH_START} above, but by parsing `tools/knight-feet/reference.glb`'s animation
 * samplers directly rather than eyeballing playback, since no browser pass has ever watched this clip
 * (see the note on `DASH_TRAIL_DIAMETER`). Read off the `Hips` translation and the right leg's
 * rotation tracks (`RightUpperLeg`, `RightLowerLeg`), the knee-fold angle being each frame's rotation
 * distance from frame 0's:
 *
 * | phase | time | hip height | knee-fold angle |
 * | --- | --- | --- | --- |
 * | stand | 0.00s | 0.824 | 0° |
 * | vertical leap, knee chambering | 0.00 - 0.37s | rises to apex **1.444** | rises to **80.1°** |
 * | knee snaps straight — the kick | 0.40 - 0.53s | 1.435 -> 1.294 | 74.9° -> **4.2°** |
 * | leg held out, sailing forward and down | 0.53 - 0.97s | 1.294 -> trough **0.763** | stays 4-22° |
 * | recovery, leg retracts | 0.97 - 1.50s | rises then settles at 0.846 | eases back up |
 *
 * `homingSpeed` already has the capsule travelling in the dash's own direction from the first frame of
 * the dash — same situation `JUMP_LAUNCH_START` exists for. Playing the clip's own 0.37s vertical leap
 * after that would read as the knight launching straight up mid-flight, on top of whatever direction
 * the dash actually points. `KICK_STRIKE_START` skips it, starting one sampled frame past the 80.1°
 * chamber peak (74.9°, 0.40s) — leg still cocked, about to snap straight — the same "leave a little
 * residual anticipation" call `JUMP_LAUNCH_START` makes, here reading as the wind-up for the kick
 * itself rather than a stray leap.
 *
 * `KICK_STRIKE_END` cuts at the measured trough (0.97s), the same way `JUMP_FALL_END` cuts at
 * touchdown rather than playing a landing: from there the leg visibly retracts toward a stand over the
 * next half-second, and by the time that retraction would be on screen the caller already knows
 * whether the dash ends in a bounce or a timeout (`KnightMotionSample.bounced`) and has its own
 * clip queued — the retraction would fight it rather than lead into it.
 *
 * The segment is therefore 0.57s of the 1.50s clip. See `driveKnightAnimation`'s use of
 * `KnightMotionSample.homingEntrySeconds` for how this gets retimed onto the dash's actual screen
 * time, the same way `JUMP_LAUNCH_START`/`JUMP_FALL_END` get retimed onto `airtime`.
 */
const KICK_STRIKE_START = 0.4;
const KICK_STRIKE_END = 0.97;

/** Frame number `seconds` into a clip, in whatever frame units the glTF loader gave this group. */
const frameAtSeconds = (group: AnimationGroup, seconds: number): number =>
  group.from + seconds * (group.targetedAnimations[0]?.animation.framePerSecond ?? 60);

/**
 * Plays `[fromSeconds, toSeconds]` of a clip, from the start of that range.
 *
 * The `stop()` is load-bearing. Babylon's `AnimationGroup.start()` returns early when the group is
 * already started, so asking a playing group to play anything — even the same range again — is
 * *silently ignored*. Hopping again before the previous segment has finished would otherwise leave
 * the new jump with no animation at all. (The same trap once made a landing show the jump clip's
 * tail only when the airborne segment happened to finish first; that landing segment is gone now.)
 */
const playSegment = (group: AnimationGroup, fromSeconds: number, toSeconds: number, speedRatio: number): void => {
  group.stop();
  group.start(false, speedRatio, frameAtSeconds(group, fromSeconds), frameAtSeconds(group, toSeconds));
};

/**
 * Pins a clip on one of its frames — a group that goes on playing that single pose, at whatever
 * weight it is given, instead of one that has stopped.
 *
 * The distinction is not cosmetic. **A stopped `AnimationGroup` writes nothing at all**, so its
 * targets keep whatever the last frame's *blend* left on them. That is the clip's own pose only when
 * the clip was the whole of that blend; when a second clip is fading over it, what the bones keep is
 * a mixture of two clips' frames in whatever proportion the fade had reached on the frame the group
 * happened to stop — a pose neither clip contains, and one that moves with the frame rate. A pose
 * that has to survive another clip fading out over it therefore has to come from a group that is
 * still playing, which is what this makes.
 *
 * The range is a single frame and the group *loops*, which is what keeps it playing: a one-shot over
 * an empty range ends on the frame it starts, and the caller below — which pins whenever it finds the
 * group stopped — would then stop and restart it once per frame for the length of a descent. Nothing
 * about the rendered pose would differ, which is why the test that separates the two counts starts
 * rather than looking at poses. `stop()` first is belt and braces, that caller having already checked:
 * `start()` is silently ignored on a group that is already playing, per {@link playSegment}.
 */
const holdFrame = (group: AnimationGroup, atSeconds: number): void => {
  const frame = frameAtSeconds(group, atSeconds);
  group.stop();
  group.start(true, 1, frame, frame);
};

/**
 * Drives the knight's pose from the player's motion each frame.
 *
 * **Locomotion** is one scalar `L`: 0 = idle, 1 = walk, 2 = run. It eases toward a target derived
 * from planar speed at {@link BLEND_PER_SECOND}, and the two clips bracketing `L` split the weight.
 * Crucially, a clip left playing at weight 0 still bleeds its motion into the pose (that made a
 * standing knight drift and look unsteady), so a clip that isn't contributing is fully stopped, not
 * just zero-weighted.
 *
 * **Jump** rides over the top as a one-shot: the launch→fall segment, started the moment the knight
 * leaves the ground and retimed to fill a jump's airtime, fading the locomotion blend out and back by
 * `jumpWeight`. **Touchdown, and only touchdown, ends it**: a descent the segment runs out under —
 * any fall the player did not launch — re-pins the segment's final frame as a held pose (see
 * {@link holdFrame}) instead of handing the pose back to locomotion in mid-air. No landing clip is
 * played (see {@link JUMP_FALL_END}).
 *
 * "Leaves the ground" is {@link stepJumpPose}'s `offGround`, not `airborne` itself, and everything
 * here that used to read `airborne` reads that instead: the support probe finds floor mid-dash and
 * under a low crystal, so `airborne` goes false for single frames in the middle of a flight. See that
 * module for the two things that went wrong when this layer trusted it.
 *
 * **Homing** layers on top of both, driven off `homing` rather than off that signal (which stays true
 * across the whole dash-plus-bounce, and so has no edge to fire on there): the
 * [{@link KICK_STRIKE_START}, {@link KICK_STRIKE_END}] slice of the Flying Kick clip plays once,
 * retimed onto `homingEntrySeconds` the same way the jump segment is retimed onto `airtime` — a dash
 * is bounded at `homingMaxDuration` (0.6s) and typically shorter, well under the clip's full 1.5s, so
 * playing it unretimed at natural rate would show only its wind-up and never the kick itself (see
 * {@link KICK_STRIKE_START}'s doc). The clip fades in and out by `kickWeight` the same way the jump
 * segment fades by `jumpWeight`; the trail does not fade with it, and has no alpha to fade — it is a
 * ribbon, switched on outright on `homing`'s rising edge and off on its falling one, so it simply
 * runs for exactly as long as the dash does. And, since a dash can only start while already airborne,
 * the jump segment can still be mid-fade when a dash starts, so `kickWeight` cuts into the jump's
 * *rendered* weight so the two one-shots do not fight over the same bones — and into locomotion's as
 * well, which a dash entered from a fall with no live jump segment needs, since nothing else would
 * hold the run clip down against `homingSpeed`. {@link KnightMotionSample.bounced} restarts the jump
 * clip from {@link BOUNCE_RESTART} — `stepJumpPose` is what holds that restart, so it rides the
 * existing `jumpWeight` blend back into locomotion; a timeout plays nothing — the domain already
 * zeroed the velocity, so the knight simply resumes falling under gravity next frame. Because
 * `offGround` is still true through the rest of that fall, "plays nothing" now also means locomotion
 * does not come back for it: the kick fades out over `JUMP_BLEND_PER_SECOND`'s 0.1 s into the held
 * jump segment, and the knight falls the rest of the way in the fall pose. That is the same pose an
 * ordinary fall, a ground-entered dash and a run-out bounce all end in — measured identical to the
 * last bit in `knightFallPose.test.ts`'s four cases.
 *
 * Three of those four have been watched on the real tower: walking off `towerPlatform_16`, jumping
 * off it, and dashing into `crystal_3` and riding the bounce down. All three ran the segment to its
 * end, pinned it at frame 78 — `JUMP_FALL_END` — at weight 1 with every locomotion group stopped for
 * the whole descent, and handed the pose back over 0.1 s at touchdown. The fourth, a dash that times
 * *out*, was not reachable there: `homingMaxDuration` 0.6 s is the time to cross `homingRange` at
 * `homingSpeed` plus margin, so a dash that locks a crystal arrives, and every crystal on the tower
 * is well inside that. It is measured on a `NullEngine` and nowhere else.
 */
export function driveKnightAnimation(
  scene: Scene,
  knight: Knight,
  motion: () => KnightMotionSample,
  tuning: () => KnightTuning,
): () => void {
  const { idle, walk, run, jump, kick } = knight.animations;
  const locomotion = [idle, walk, run];
  const playing = new Map<AnimationGroup, boolean>(locomotion.map((g) => [g, g.isPlaying]));

  let level = 0; // the locomotion scalar L
  let jumpWeight = 0;
  let kickWeight = 0;
  let jumpPose = INITIAL_JUMP_POSE;
  let wasHoming = false;

  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const { planarSpeed, airborne, homing, bounced, homingEntrySeconds } = motion();
    const { walk: walkSpeed, run: runSpeed, airtime } = tuning();

    // --- off the ground, and the jump clip's seam ------------------------------------------------
    // Nothing is re-decided here: `stepJumpPose` owns both the off-ground signal the rest of this
    // observable reads and which seam the jump clip starts from, so the launch edge and the bounce
    // restart cannot both claim the same arrival — which, on a low crystal, is exactly what they did.
    const pose = stepJumpPose(jumpPose, { airborne, homing, bounced });
    jumpPose = pose.state;
    const { offGround } = pose.state;
    if (pose.cue === 'launch') {
      // Stretch (or compress) the segment onto the actual airtime so the pose lands with the capsule.
      const ratio = (JUMP_FALL_END - JUMP_LAUNCH_START) / Math.max(airtime, DIVISOR_FLOOR);
      playSegment(jump, JUMP_LAUNCH_START, JUMP_FALL_END, ratio);
    } else if (pose.cue === 'bounce') {
      // Untuned, unlike `ratio` above: retiming this the same way would need a bounce-specific
      // airtime, and `KnightTuning` exposes none. Reusing the ordinary jump's `airtime` would
      // misrepresent the bounce — that value is derived from `jumpSpeed`, while a bounce rises at
      // `homingBounceSpeed`, a different speed with a different real duration. Plays at the clip's
      // natural rate for now; a later task tunes it by eye in the browser.
      const bounceRatio = 1;
      playSegment(jump, BOUNCE_RESTART, JUMP_FALL_END, bounceRatio);
    }
    // **The segment does not end while the character is still off the ground.** It is a one-shot
    // retimed onto a *jump's* airtime, so every descent the player did not launch outlives it, and
    // what should be on the bones for the rest of that descent is the frame it ended on: the fall.
    //
    // Letting the group simply stop delivers that only when the segment is the whole of the blend —
    // an ordinary fall, and a dash entered from the ground, whose kick is retimed onto a dash and so
    // runs out inside the longer jump. A dash entered in *mid-air* is the case that breaks: its kick
    // can outlive the segment, and then whichever of the two stopped last left the bones wherever
    // its cross-fade had reached. Measured on a `NullEngine` with the five clips writing one channel
    // (`knightFallPose.test.ts`'s rig, where the segment's last frame reads 159.99 and the kick 50):
    // three mid-air dashes, differing only in when they started and how long they were expected to
    // run, held 67.6, 50.8 and 92.4 for the rest of the fall — three different points between the
    // two poses, set by which frame each group happened to stop on and by nothing else.
    //
    // Re-pinning the segment's final frame as a *playing* single-frame loop makes the fall pose a
    // real contribution again, so the kick has something to fade back into and every off-ground hold
    // — ordinary fall, dash timed out from the ground or from mid-air, bounce run out — is that one
    // frame, 159.99 in all four. {@link holdFrame} has the mechanism.
    if (offGround && !jump.isPlaying) holdFrame(jump, JUMP_FALL_END);

    // --- homing dash pose and trail ---------------------------------------------------------------
    // `offGround` stays true across the whole dash and the bounce that ends it, so the block above
    // has no edge to fire on there — `homing`'s own edges are what drive the kick clip and the ribbon.
    if (homing && !wasHoming) {
      // Collapse the ribbon to the current position so it grows fresh from the dash's start, rather
      // than snapping in a straight line from wherever it last trailed off.
      knight.trail.start();
      // Retime [KICK_STRIKE_START, KICK_STRIKE_END] onto the dash's expected screen time, the same way
      // the jump segment above is retimed onto `airtime` — see KICK_STRIKE_START's doc for why playing
      // this clip unretimed would only ever show its wind-up. `homingEntrySeconds` should always be
      // set here (a dash cannot start without a freshly-locked crystal, which is what sets it — see
      // `Player.homingEntrySeconds`), but fall back to natural rate with a warning rather than divide
      // by a missing number if that invariant is ever wrong.
      if (homingEntrySeconds === null) {
        console.warn('[knight] homing dash started with no homingEntrySeconds — playing the kick at natural rate.');
      }
      const kickRatio = (KICK_STRIKE_END - KICK_STRIKE_START) / Math.max(homingEntrySeconds ?? (KICK_STRIKE_END - KICK_STRIKE_START), DIVISOR_FLOOR);
      // `playSegment` calls `stop()` first for the same reason its own doc gives: `AnimationGroup.start()`
      // silently no-ops on an already-playing group, which would leave a second dash mid-flight with no clip.
      playSegment(kick, KICK_STRIKE_START, KICK_STRIKE_END, kickRatio);
    }
    if (!homing && wasHoming) {
      knight.trail.stop();
    }
    wasHoming = homing;

    // **The airborne pose owns the blend for as long as the character is off the ground**, whether or
    // not the clip is still running its retimed segment — which is why the target is `offGround`
    // alone and not `offGround && jump.isPlaying`. Since the block above keeps the group playing for
    // exactly as long as `offGround` holds, the second half would now be redundant rather than wrong;
    // it is left out because this weight is a statement about the character and not about a group's
    // bookkeeping, and because it then stays right on its own if that block ever changes.
    //
    // The segment is a one-shot retimed onto `airtime`, and `airtime` is a *jump's*: up and back down
    // under the domain's gravity, 0.75s at `jumpSpeed` 9 and `gravity` 24. A jump therefore lands as
    // the clip ends, which is what the retime is for. An uncommanded fall has no such number — not
    // being able to say how long it will last is exactly what distinguishes it from a jump the player
    // asked for — and the tower's are far longer (spec §14.3 measured 1.250s off the summit). Ending
    // the clip's influence when the clip ends handed the rest of those falls back to locomotion, so
    // the knight ran in mid-air for half a second; with `FALL_GRACE_SECONDS`' 0.2s debounce ahead of
    // it, the fall read as playing no animation at all.
    //
    // Holding the weight at 1 holds the pose: locomotion's weights below all carry a `(1 -
    // jumpInfluence)` factor, so they stay at zero and their groups stay stopped, leaving the held
    // jump segment writing the bones by itself. Touchdown is what releases it, and the ease back down
    // is the same one a landing has always used — with the segment's own final frame on one side of
    // it, rather than whatever a stopped group had happened to leave behind.
    jumpWeight = moveToward(jumpWeight, offGround ? 1 : 0, JUMP_BLEND_PER_SECOND * dt);
    // Same fast ease as the jump: a dash pose has to read as immediate, not cross-fade in.
    kickWeight = moveToward(kickWeight, homing && kick.isPlaying ? 1 : 0, JUMP_BLEND_PER_SECOND * dt);
    if (kick.isPlaying) {
      kick.setWeightForAllAnimatables(kickWeight);
      if (!homing && kickWeight <= WEIGHT_EPSILON) kick.stop();
    }
    // A dash can only start off the ground, so the jump segment can still be live — and its weight
    // still ramping — on the frame a dash starts. Cut kick's share out of jump's *rendered* weight
    // (not `jumpWeight` itself, which still governs the stop-on-touchdown check below) so the two
    // one-shots don't compete for the same bones. Locomotion carries its own `(1 - kickWeight)` term
    // below, and keeps it: it is the only thing holding the run clip down against `homingSpeed` on a
    // frame where the kick pose is what should be on screen, and it does not depend on `jumpInfluence`
    // having any particular value — a dash's own entry raises `offGround`, so the two terms overlap
    // for most of a dash rather than each covering for the other.
    if (jump.isPlaying) {
      jump.setWeightForAllAnimatables(jumpWeight * (1 - kickWeight));
      if (!offGround && jumpWeight <= WEIGHT_EPSILON) jump.stop();
    }
    const jumpInfluence = jumpWeight;

    // The feet ride the capsule while off the ground and re-plant on touchdown, off the same flag as
    // the clip, so the two can never disagree.
    knight.planted = moveToward(knight.planted, offGround ? 0 : 1, PLANT_PER_SECOND * dt);

    // --- locomotion ---------------------------------------------------------------------------
    // Below the threshold the knight is idle; any real movement reads as at least a walk, and the
    // walk→run half of the range tracks how far past walking speed the player actually is.
    const targetLevel = planarSpeed <= WALK_THRESHOLD
      ? 0
      : 1 + Math.max(0, Math.min(1, (planarSpeed - walkSpeed) / Math.max(runSpeed - walkSpeed, DIVISOR_FLOOR)));
    level = moveToward(level, targetLevel, BLEND_PER_SECOND * dt);

    // Triangular weights around L: idle at 0, walk at 1, run at 2. They sum to 1.
    const weights = [
      Math.max(0, 1 - level),
      Math.max(0, 1 - Math.abs(level - 1)),
      Math.max(0, level - 1),
    ].map((w) => w * (1 - jumpInfluence) * (1 - kickWeight));

    for (const [i, group] of locomotion.entries()) {
      const want = weights[i] > WEIGHT_EPSILON;
      if (want && !playing.get(group)) { group.play(true); playing.set(group, true); }
      else if (!want && playing.get(group)) { group.stop(); playing.set(group, false); }
      if (want) group.setWeightForAllAnimatables(weights[i]);
    }
  });

  // Handed back for {@link plantFeet}'s reason: this observer is the only live reference to the
  // closure above, and nothing outside the scene can reach it. `characterRig` releases it beside the
  // input listeners and the character controller, and before the scene that owns the observable goes.
  return () => { scene.onBeforeRenderObservable.remove(observer); };
}
