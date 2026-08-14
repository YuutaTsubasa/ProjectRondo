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
 * Loads the knight GLB, parents it to `parent` (the physics-driven player root), scales it to
 * {@link TARGET_HEIGHT}, seats its feet at the capsule bottom, and returns the Idle/Walk
 * animation groups with Idle playing. The mesh inherits the parent's facing rotation.
 */
export async function loadKnight(scene: Scene, parent: TransformNode): Promise<KnightAnimations> {
  const result = await ImportMeshAsync('/models/knight_web.glb', scene);
  const root = result.meshes[0] as TransformNode;
  root.parent = parent;
  root.position.setAll(0);

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
  // Both clips carry a root-bone reorientation from the retarget (a big ~96° pitch on Walk, a small
  // forward lean on Idle); neutralise both so the knight stands straight rather than tipping over.
  neutralizeRootBoneRotation(idle);
  neutralizeRootBoneRotation(walk);
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
      root.position.y += parent.getAbsolutePosition().y - CAPSULE_HALF - lowest;
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

/** Planar speed above which the knight is fully walking (mirrors Godot's WalkAnimationThreshold). */
const WALK_THRESHOLD = 0.6;
/** Idle↔Walk cross-fade rate; reaches full weight in ~0.2s (mirrors Godot's AnimationBlend). */
const BLEND_PER_SECOND = 1 / 0.2;

/**
 * Cross-fades Idle↔Walk by weight each frame based on `planarSpeed()`. Both groups loop; the walk
 * weight eases toward 1 above {@link WALK_THRESHOLD} and toward 0 below it, idle taking the remainder.
 */
export function driveKnightAnimation(
  scene: Scene,
  knight: KnightAnimations,
  planarSpeed: () => number,
): void {
  knight.idle.play(true);
  knight.walk.play(true);
  let walkWeight = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const target = planarSpeed() > WALK_THRESHOLD ? 1 : 0;
    const maxStep = BLEND_PER_SECOND * dt;
    walkWeight += Math.max(-maxStep, Math.min(maxStep, target - walkWeight));
    knight.walk.setWeightForAllAnimatables(walkWeight);
    knight.idle.setWeightForAllAnimatables(1 - walkWeight);
  });
}
