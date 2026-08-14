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

  // The glTF importer expresses the RH→LH handedness as a negative-Z scale (a reflection).
  // A negative-determinant transform breaks skeletal skinning the moment the parent yaws — the
  // knight flips onto its side toward the floor. Replace the reflection with a plain positive
  // scale and counter the lost orientation with a 180° yaw so the knight faces away from the
  // camera. (Side effect: a left-right mirror, imperceptible on the symmetric armour.)
  const scale = root.scaling;
  scale.set(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
  root.rotationQuaternion = Quaternion.FromEulerAngles(0, Math.PI, 0);

  // Seat the lowest vertex at the capsule bottom (parent centre − CAPSULE_HALF).
  const seated = root.getHierarchyBoundingVectors(true);
  root.position.y += parent.getAbsolutePosition().y - CAPSULE_HALF - seated.min.y;

  const groups = result.animationGroups;
  const idle = groups.find((g) => /idle/i.test(g.name)) ?? groups[0];
  const walk = groups.find((g) => /walk/i.test(g.name)) ?? groups[1];
  for (const g of groups) g.stop();
  idle.play(true);

  return { idle, walk };
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
