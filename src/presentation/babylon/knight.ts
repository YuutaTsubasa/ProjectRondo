import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
// Side-effect: registers the glTF loader plugin (with KHR_mesh_quantization / webp support).
import '@babylonjs/loaders/glTF';

export interface KnightAnimations {
  readonly idle: AnimationGroup;
  readonly walk: AnimationGroup;
}

/** Target on-screen height of the knight, in world units (capsule total height is 2). */
const TARGET_HEIGHT = 1.9;
/** Capsule centre sits this far above its feet (radius 0.5 + cylinder half-height 0.5). */
const CAPSULE_HALF = 1.0;
/**
 * Lift applied when seating so the shoe soles rest on the floor. The sole mesh extends well below
 * the foot bones we measure against, so without this the feet sink into the ground (and the ground
 * plane then occludes them from side angles). Tuned visually.
 */
const FOOT_CLEARANCE = 0.14;
/** Fraction of the idle animation's motion to keep (0 = frozen, 1 = full sway). Kills the side rock. */
const IDLE_SWAY_KEEP = 0.2;

/**
 * Loads the knight GLB, parents it to `parent` (the physics-driven player root), scales it to
 * {@link TARGET_HEIGHT}, seats its feet at the capsule bottom, and returns the Idle/Walk
 * animation groups with Idle playing. The mesh inherits the parent's facing rotation.
 */
export async function loadKnight(scene: Scene, parent: TransformNode): Promise<KnightAnimations> {
  // ?v bust: the browser aggressively caches the GLB, so a plain reload keeps serving an old copy.
  // Bump this whenever knight_web.glb is rebuilt so clients refetch it.
  const result = await ImportMeshAsync('/models/knight_web.glb?v=3', scene);
  const root = result.meshes[0] as TransformNode;
  root.parent = parent;
  root.position.setAll(0);

  // Skinned-mesh bounding boxes track the bind pose, not the animated pose, so babylon frustum-culls
  // limbs at some camera angles (a foot vanishes, then reappears when you rotate). Force the knight
  // meshes to always render — it's one character, the cull savings don't matter.
  for (const mesh of result.meshes) mesh.alwaysSelectAsActiveMesh = true;

  const raw = root.getHierarchyBoundingVectors(true);
  const rawHeight = raw.max.y - raw.min.y;
  if (rawHeight > 0) root.scaling.scaleInPlace(TARGET_HEIGHT / rawHeight);

  // The scene is right-handed (see hubScene), so the glTF loads natively with no handedness
  // reflection — skinning stays correct under any parent yaw. The model faces +Z on import;
  // rotate 180° so its back is to the third-person camera.
  root.rotationQuaternion = Quaternion.FromEulerAngles(0, Math.PI, 0);

  // Rough initial seating from the bind-pose bounds; refined below once the idle pose is evaluated.
  const bindBounds = root.getHierarchyBoundingVectors(true);
  root.position.y += parent.getAbsolutePosition().y - CAPSULE_HALF - bindBounds.min.y;

  const groups = result.animationGroups;
  const idle = groups.find((g) => /idle/i.test(g.name)) ?? groups[0];
  const walk = groups.find((g) => /walk/i.test(g.name)) ?? groups[1];
  if (!idle || !walk) {
    throw new Error(`knight_web.glb must contain Idle and Walk animations; found: ${groups.map((g) => g.name).join(', ') || '(none)'}`);
  }
  // Both clips carry a root-bone reorientation from the retarget (a big ~96° pitch on Walk, a small
  // forward lean on Idle); neutralise both so the knight stands straight rather than tipping over.
  neutralizeRootBoneRotation(idle);
  neutralizeRootBoneRotation(walk);
  // The mocap idle rocks the torso ~2cm side to side ("leans left then right"). Damp the whole idle
  // toward its average pose so the knight stands steady, keeping a little life.
  dampenSwayTowardMean(idle, IDLE_SWAY_KEEP);
  for (const g of groups) g.stop();
  idle.play(true);

  // Bind-pose bounds don't match the animated idle pose (the knight floated ~0.8u above the floor),
  // so re-seat once on the actual posed foot bones after the first rendered frame.
  const skeleton = result.skeletons[0];
  const skinned = result.meshes.find((m) => m.skeleton === skeleton);
  const footBones = skeleton?.bones.filter((b) => /toe|foot/i.test(b.name)) ?? [];
  if (skeleton && skinned && footBones.length > 0) {
    const observer = scene.onAfterRenderObservable.add(() => {
      const lowest = Math.min(...footBones.map((b) => b.getAbsolutePosition(skinned).y));
      root.position.y += parent.getAbsolutePosition().y - CAPSULE_HALF + FOOT_CLEARANCE - lowest;
      scene.onAfterRenderObservable.remove(observer);
    });
  }

  return { idle, walk };
}

/**
 * The Mixamo→Character-Creator retarget baked a root-bone (`RL_BoneRoot`) reorientation into each
 * clip — a ~96° X pitch on Walk and a small forward lean on Idle (a Z-up↔Y-up correction that is
 * wrong once the model is displayed Y-up), which tips the whole knight over. Reset that one track
 * to identity; world placement/orientation comes from the player root anyway.
 */
function neutralizeRootBoneRotation(group: AnimationGroup): void {
  for (const targeted of group.targetedAnimations) {
    const targetName = (targeted.target as { name?: string } | null)?.name ?? '';
    if (/RL_BoneRoot/i.test(targetName) && targeted.animation.targetProperty === 'rotationQuaternion') {
      for (const key of targeted.animation.getKeys()) {
        (key.value as Quaternion).set(0, 0, 0, 1);
      }
    }
  }
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

/** Planar speed above which the knight is fully walking (mirrors Godot's WalkAnimationThreshold). */
const WALK_THRESHOLD = 0.6;
/** Idle↔Walk cross-fade rate; reaches full weight in ~0.2s (mirrors Godot's AnimationBlend). */
const BLEND_PER_SECOND = 1 / 0.2;
/** Weight below/above which a clip is treated as fully idle/fully walking and the other is stopped. */
const WEIGHT_EPSILON = 0.001;

/**
 * Cross-fades Idle↔Walk by weight each frame based on `planarSpeed()`: the walk weight eases toward
 * 1 above {@link WALK_THRESHOLD} and toward 0 below it, idle taking the remainder. Crucially, a clip
 * left playing at weight 0 still bleeds its motion into the pose (that made a standing knight drift
 * and look unsteady), so the clip that isn't contributing is fully stopped, not just zero-weighted;
 * both play only during the brief blend.
 */
export function driveKnightAnimation(
  scene: Scene,
  knight: KnightAnimations,
  planarSpeed: () => number,
): void {
  let walkWeight = 0;
  let idlePlaying = knight.idle.isPlaying;
  let walkPlaying = knight.walk.isPlaying;
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const target = planarSpeed() > WALK_THRESHOLD ? 1 : 0;
    const maxStep = BLEND_PER_SECOND * dt;
    walkWeight += Math.max(-maxStep, Math.min(maxStep, target - walkWeight));

    const wantWalk = walkWeight > WEIGHT_EPSILON;
    const wantIdle = walkWeight < 1 - WEIGHT_EPSILON;
    if (wantWalk && !walkPlaying) { knight.walk.play(true); walkPlaying = true; }
    else if (!wantWalk && walkPlaying) { knight.walk.stop(); walkPlaying = false; }
    if (wantIdle && !idlePlaying) { knight.idle.play(true); idlePlaying = true; }
    else if (!wantIdle && idlePlaying) { knight.idle.stop(); idlePlaying = false; }

    if (walkPlaying) knight.walk.setWeightForAllAnimatables(walkWeight);
    if (idlePlaying) knight.idle.setWeightForAllAnimatables(1 - walkWeight);
  });
}
