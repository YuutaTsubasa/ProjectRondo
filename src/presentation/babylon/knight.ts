import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Shadows } from './shadows';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import type { PhysicsEngine as PhysicsEngineV2 } from '@babylonjs/core/Physics/v2/physicsEngine';
// Side-effect: registers the glTF loader plugin (with KHR_mesh_quantization / webp support).
import '@babylonjs/loaders/glTF';
import { CAPSULE_HALF } from './capsule';
import { HEAD_MESHES, knightReceivesShadow } from './shadowPolicy';
import { terrainHeight } from './terrainHeight';
import { moveToward } from '../../domain/math/scalar';
import { emissiveFactorOf, type GltfPbrMaterial } from './gltfMaterial';

export interface KnightAnimations {
  readonly idle: AnimationGroup;
  readonly walk: AnimationGroup;
  readonly run: AnimationGroup;
  readonly jump: AnimationGroup;
}

/** What the animation layer needs to know about the player each frame. */
export interface KnightMotionSample {
  /** Horizontal speed, world units/s. */
  readonly planarSpeed: number;
  /**
   * Off the ground, as decided by `groundContact` — the one machine that owns that call. Deciding it
   * a second time here is what let the pose and the physics disagree: an earlier copy of the rule
   * could latch on `air` forever if the probe never released, leaving the knight floating and no jump
   * ever animating again.
   */
  readonly airborne: boolean;
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
   * Driven by {@link driveKnightAnimation} from the same `airborne` flag as the jump clip, so the feet
   * and the pose can never disagree. Reading the raw support probe here instead would bob the knight
   * several centimetres, since it drops out for ~10% of frames while running.
   */
  planted: number;
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
const TARGET_HEIGHT = 1.9;
/** Fraction of the idle animation's motion to keep (0 = frozen, 1 = full sway). Kills the side rock. */
const IDLE_SWAY_KEEP = 0.2;

/**
 * How much of the albedo to add back as unlit light on the face.
 *
 * An anime face is not supposed to track scene lighting the way a surface does — it stays bright and
 * flat, and the light/shade terminator across it reads as dirt rather than form. Adding the albedo as
 * emissive decouples the face from the sun without touching the armour, which is meant to catch light.
 *
 * This works because **PBR adds emissive**; StandardMaterial folds it in before multiplying by the
 * diffuse texture, so the same trick there scales to nothing on a dark texel (see `trees.ts`).
 *
 * Measured head-on with the idle animation **paused at frame 0** and the camera tracking the `Head`
 * bone live, over the head region located by which pixels the change itself touches (158k px, ~20 % of
 * the frame) rather than by a hand-placed box — so it covers face, hair and neck, and the rest of the
 * frame serves as a control:
 *
 * | emissive | head region mean luma | control (rest of frame) |
 * | --- | --- | --- |
 * | 0    | 35.6 | 114.3 |
 * | 0.25 | 57.1 | 114.3 |
 * | 0.45 | 68.8 | 114.3 |
 *
 * The control is flat to one decimal, which is what says the armour is untouched. 0.25 is the more
 * conservative option if 0.45 reads too hot in motion.
 *
 * Reproduce it exactly that way. Two earlier figures for this constant (99 -> 175 and 70 -> 146)
 * disagreed because each used a differently hand-placed box with the idle animation *running*, so the
 * head sat at a different angle in each; both are superseded by the table above.
 *
 * Known and accepted: `Mesh_0` carries the hair too, so the hair lifts from near-black to a warm brown.
 * Isolating the skin would need a mask texture or a Blender split, and the lift reads as an improvement.
 */
const FACE_EMISSIVE = 0.45;

/** Cache-buster for the packed metallic/roughness map; bump when the map is rebuilt. */
const BODY_MR_URL = '/models/knight_mr.webp?v=1';

/**
 * How metallic the armour is allowed to read, deliberately below the physically-correct 1.
 *
 * A metal has no diffuse — its albedo becomes the specular F0 — so it can only show what it reflects.
 * This scene has no environment texture (`scene.environmentTexture` is null; nothing in `src/` ever
 * sets one), so at `metallic = 1` the ~36% of texels the packed map flags as metal had nothing to
 * reflect but the sun's specular lobe and rendered near-black. Measured over the armour's pixels:
 * mean luma 32.4/255 with 49.9% of them below 30.
 *
 * Holding some diffuse back is the concession that buys the plate its shape without an IBL. Measured
 * at the same framing, frozen scene, zero reproducibility control: 0.8 -> 29.0, **0.6 -> 36.0**,
 * 0.4 -> 42.3. 0.4 is brighter still but the steel starts reading as plastic, losing the dark-to-light
 * contrast that makes it look like metal. If an environment texture is ever added, raise this back
 * toward 1 and re-measure — the correct fix is the IBL, not this number.
 */
const BODY_METALLIC = 0.6;

/**
 * Direct-light multiplier for the armour, compensating for the same missing IBL.
 *
 * `directIntensity` scales only this material's response to the scene's lights, so it lifts the
 * armour without touching the terrain, foliage or the toon face (which is its own material). Measured
 * at `BODY_METALLIC`: 1.0 -> 36.0, 1.3 -> 42.6, **1.6 -> 48.6**, 2.0 -> 55.8. 1.6 lands the armour at
 * roughly half the frame's own mean luma, which reads as lit steel rather than a silhouette.
 */
const BODY_DIRECT_INTENSITY = 1.6;

/**
 * Gives the armour a metallic/roughness map so the plate catches light as metal instead of reading as
 * flat matte. The map is packed glTF-style (roughness in G, metallic in B) from the source PBR set.
 * Runs *after* {@link applyFaceMaterial}, so the head's toon clone — cloned before this — keeps a
 * non-metallic, unlit face. The whole body shares one material, so setting it once covers every mesh.
 */
function applyBodyPbr(meshes: readonly AbstractMesh[], scene: Scene): void {
  const mat = meshes.find((m) => !HEAD_MESHES.includes(m.name) && m.material)?.material as PBRMaterial | undefined;
  if (!mat) {
    console.warn('[knight] no body material found — PBR skipped, armour stays matte.');
    return;
  }
  const mr = new Texture(BODY_MR_URL, scene, false, false);
  mat.metallicTexture = mr;
  mat.useRoughnessFromMetallicTextureGreen = true;
  mat.useMetallnessFromMetallicTextureBlue = true;
  // Babylon reads roughness from the metallic texture's ALPHA channel by default, and alpha takes
  // precedence over green — so setting Green alone does nothing. The packed map is fully opaque
  // (alpha 255 everywhere, verified by reading it back), which pinned roughness at 1.0 and discarded
  // the 0.25-0.6 the G channel actually carries. Turning this off is what lets the packing take effect.
  mat.useRoughnessFromMetallicTextureAlpha = false;
  mat.metallic = BODY_METALLIC;
  mat.roughness = 1;
  mat.directIntensity = BODY_DIRECT_INTENSITY;
}

/** Ceiling on waiting for the face shader. `Material.forceCompilation`'s `checkReady` re-arms itself
 *  every 16 ms and only exits on ready-or-compile-error, so a blocking albedo texture that never
 *  becomes ready — a stalled fetch, a lost context — leaves the promise pending forever. That would
 *  hang `loadKnight`, and with it `createHubScene`: no render loop, no trees, no input, nothing
 *  logged. Ten seconds is far past a real compile and still bounded.
 *
 *  This is the budget for the whole head, not per mesh — bounding each call separately would make the
 *  real worst case `HEAD_MESHES.length` times this number, which is not what a reader budgeting hub
 *  load time off this constant would assume. */
const FACE_COMPILE_TIMEOUT_MS = 10_000;

/**
 * Gives the head its own material so the face can be lit differently from the armour.
 *
 * Every one of the knight's 34 meshes ships sharing a single glTF material, so the head needs a clone
 * before anything can be changed about it in isolation.
 *
 * `forceCompilationAsync` is not optional: swapping the material on a 101-bone skinned mesh triggers an
 * async shader rebuild, and the mesh renders as *nothing at all* until it finishes — long enough to
 * look like a bug and to poison any measurement taken in the meantime.
 *
 * Every failure here is warn-and-skip rather than throw. This runs inside `loadKnight`, which
 * `hubScene` awaits *before* `loadTrees` and `runRenderLoop` — so anything thrown takes down the whole
 * hub over a face tweak. The armour keeps the original material either way, so skipping costs one
 * cosmetic effect and nothing else.
 */
async function applyFaceMaterial(meshes: readonly AbstractMesh[]): Promise<void> {
  // The warn-and-skip guarantee has to cover the whole body, not just the compile await:
  // `SerializationHelper.Clone` walks each serialized texture slot calling `.clone()` and
  // `_clonePlugins` re-parses the plugin set, either of which can throw on a material exotic enough to
  // have got this far. `createHubScene` does not guard `loadKnight`, and `App.svelte` calls it with
  // `.then()` and no `.catch`, so anything escaping here is an unhandled rejection and a blank canvas.
  try {
    await swapHeadMaterial(meshes);
  } catch (err) {
    console.warn('[knight] face lighting failed; the head keeps the shared material:', err);
  }
}

/**
 * Guards, clones, puts the clone on the three head meshes, awaits its compile, and rolls the meshes
 * back if that fails. Split out from {@link applyFaceMaterial} so the try/catch there covers all of it.
 */
async function swapHeadMaterial(meshes: readonly AbstractMesh[]): Promise<void> {
  const head = meshes.filter((m) => HEAD_MESHES.includes(m.name));
  // Each expected name must appear exactly once. Counting `head.length` would not establish that:
  // glTF does not require unique node names and the loader does not dedupe them, so a GLB with two
  // `Mesh_0`s and no `Mesh_33` still totals three — and the face would be applied to part of the head
  // with an eyeball left on the dark shared material.
  const wrongCount = HEAD_MESHES.map((name) => ({ name, n: meshes.filter((m) => m.name === name).length })).filter(
    (x) => x.n !== 1,
  );
  if (wrongCount.length) {
    // Mesh names come from the GLB, so a re-export can rename or duplicate them out from under this.
    const detail = wrongCount.map((x) => `${x.name} x${x.n}`).join(', ');
    console.warn(
      `[knight] expected each of ${HEAD_MESHES.join(', ')} exactly once; got ${detail} — face lighting skipped.`,
    );
    return;
  }

  const source = head[0].material;
  if (!source) {
    console.warn(`[knight] '${head[0].name}' has no material — face lighting skipped.`);
    return;
  }
  // "Clone the head's material" only means anything while the head actually shares one. Splitting the
  // eyes onto their own material is an ordinary thing for a re-export to do, and would otherwise paint
  // the eye material across the face, the hair and the neck with every name check still passing.
  if (head.some((m) => m.material !== source)) {
    const names = [...new Set(head.map((m) => m.material?.name ?? 'none'))].join(', ');
    console.warn(
      `[knight] head meshes no longer share one material (${names}) — face lighting skipped rather than painting one of them across the rest.`,
    );
    return;
  }

  const pbr = source as GltfPbrMaterial;
  const albedo = pbr.albedoTexture;
  if (!albedo) {
    // With no texture to modulate it, FACE_EMISSIVE would be added as a flat grey wash over the head.
    console.warn(`[knight] '${source.name}' has no albedoTexture — face lighting skipped.`);
    return;
  }

  // The loader puts glTF's emissiveFactor straight into emissiveColor, which FACE_EMISSIVE overwrites.
  // Today's GLB ships none; say so if one appears, as `trees.ts` does for the same drop.
  const discardedEmissive = emissiveFactorOf(pbr);
  if (discardedEmissive) {
    console.warn(
      `[knight] '${source.name}' has a non-zero emissiveFactor (${discardedEmissive.toHexString()}). It is discarded: face lighting owns emissiveColor.`,
    );
  }

  // glTF permits an emissiveTexture with emissiveFactor left at [0,0,0], so the check above does not
  // cover this one. The clone inherits it and the assignment below replaces it.
  if (pbr.emissiveTexture) {
    console.warn(
      `[knight] '${source.name}' ships an emissiveTexture. It is discarded: face lighting puts the albedo there instead.`,
    );
  }

  const face = source.clone('knightFace');
  if (!face) {
    // `Material.clone()` returns null on the base class (`material.pure.js:1189`); only subclasses
    // that override it return anything. NOT a NodeMaterial, despite HANDOFF §5 proposing one for cel
    // banding: it overrides `clone(name, shareEffect)`, and it exposes no `albedoTexture`, so a
    // NodeMaterial head is already turned away by the guard above with a different message.
    console.warn(
      `[knight] '${source.name}' (${source.getClassName()}) did not clone — face lighting skipped.`,
    );
    return;
  }
  // `Material.clone()` runs every texture slot through `SerializationHelper.Clone`, which calls
  // `sourceProperty.clone()`, so `face` owns its own `Texture` *wrappers* (verified: new uniqueIds).
  // What it does not own is its own pixels — those wrappers share the source's `InternalTexture`,
  // i.e. one GPU upload for both materials (verified: identical `_texture.uniqueId`).
  //
  // So the emissive slot takes the clone's OWN albedo wrapper, not the source's. Both point at the
  // same upload, so nothing is saved by aliasing the source's — but aliasing it would couple the two
  // materials at the wrapper level, where the mutable per-wrapper state lives (`level`, `uScale`,
  // `coordinatesIndex`, `wrapU`). `trees.ts` sets `.level` on exactly such a carried-over wrapper, so
  // that is a live pattern in this codebase, not a hypothetical.
  //
  // The shared upload IS reference-counted, and the clone already took a reference: `Texture.clone()`
  // resolves through `BaseTexture._getFromCache`, which calls `incrementReferences()` on a hit — which
  // is the only way the identical `_texture.uniqueId` above can arise. Measured live: `_references` is
  // 2, cloning a wrapper takes it to 3 and disposing that wrapper returns it to 2 with the upload
  // intact. (The counter is `_references`; there is no public `references`, so reading that proves
  // nothing.) Disposing the clone's own wrappers would therefore be safe.
  //
  // It is still not done on the failure path, for an unrelated reason — Babylon's compile poll can
  // outlive the material; see the catch below. The cost is that a failed compile leaves the clone's
  // wrappers in `scene.textures` until teardown.
  //
  // This is NOT the HANDOFF §7 trap, which is the opposite shape: there a probe was handed the same
  // wrapper *object* by assignment, so nothing ever incremented, and `dispose(_, true)` took the count
  // from 1 to 0 and freed pixels the real material was still sampling.
  const facePbr = face as GltfPbrMaterial;
  if (!facePbr.albedoTexture) {
    // Falling back to the source's wrapper here would silently give up the decoupling argued for
    // above, and would leave the face with no albedo at all — flat albedoColor with the source's
    // image in the emissive slot. That is worse than skipping, so skip and say so.
    face.dispose(false, false);
    console.warn(
      `[knight] the clone of '${source.name}' came back without an albedoTexture — face lighting skipped.`,
    );
    return;
  }
  facePbr.emissiveTexture = facePbr.albedoTexture;
  facePbr.emissiveColor = new Color3(FACE_EMISSIVE, FACE_EMISSIVE, FACE_EMISSIVE);
  // The clone also inherits `emissiveIntensity`, which the shader folds into the emissive term as
  // `vLightingIntensity.y` — so an asset shipping KHR_materials_emissive_strength would multiply
  // FACE_EMISSIVE by it and the measured table above would stop describing what renders. Pin it to 1
  // so the constant means what it says, and report the discard like the other two channels.
  if (pbr.emissiveIntensity !== undefined && pbr.emissiveIntensity !== 1) {
    console.warn(
      `[knight] '${source.name}' has emissiveIntensity ${pbr.emissiveIntensity}. It is reset to 1: FACE_EMISSIVE is calibrated against unscaled emissive.`,
    );
  }
  facePbr.emissiveIntensity = 1;
  for (const mesh of head) mesh.material = face;

  let abandoned = false;
  try {
    // Sequentially, NOT Promise.all: `forceCompilation` saves `allowShaderHotSwapping` into a per-call
    // local and writes false for the duration, so concurrent calls on one material race — the later
    // ones capture the false an earlier one wrote, and the last restore leaves it permanently off.
    // Hot-swapping off is what makes a mesh vanish while a new variant compiles (HANDOFF §7), so the
    // race would arm that trap for every later define change on the head.
    await withTimeout(
      (async () => {
        for (const mesh of head) {
          // Once the wait has been abandoned, stop feeding the loop: each call arms its own poll.
          if (abandoned) return;
          await face.forceCompilationAsync(mesh);
        }
      })(),
      FACE_COMPILE_TIMEOUT_MS,
      'face shader compile',
    );
  } catch (err) {
    // The clone adds an EMISSIVE define on top of a 101-bone skinned variant already near the
    // vertex-uniform ceiling, so this can fail where its parent succeeded. Put the head back on the
    // material that already compiles rather than letting the rejection escape into hubScene.
    abandoned = true;
    for (const mesh of head) mesh.material = source;
    // `face` is deliberately NOT disposed. On the timeout branch Babylon's compile poll may still be
    // live against it — `checkReady` re-arms every 16 ms and its only bail-out is a missing scene
    // (`material.pure.js:1243`), which `Material.dispose` never clears — so disposing here would
    // leave that poll calling `isReadyForSubMesh` on a destroyed material, with a disposed uniform
    // buffer, for the life of the page. One orphaned material is the cheaper failure.
    console.warn('[knight] face material failed to compile; head reverted to the shared material:', err);
  }
}

/**
 * Builds "how high is the surface actually under the soles?", used by the foot-planting below.
 *
 * This exists because {@link terrainHeight} is the height *field*, not the height of whatever the
 * player is standing on. Anything with its own collider — the plaza pedestal, a pillar, a rock, and
 * whatever P4 adds — sits above the field, and planting against the field drops the knight straight
 * through it. Measured on the pedestal before this probe existed: the capsule bottom was correctly at
 * 1.843 on a 1.717 top, while the knight's lowest rendered vertex was at 1.167 — exactly
 * `terrainHeight(-6, 32)`, i.e. the model rendered through the pedestal and stood on the ground.
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
 * On a miss it returns the height field, so the worst case is exactly today's behaviour rather than
 * snapping the knight somewhere worse.
 */
function createGroundProbe(scene: Scene): (x: number, footY: number, z: number) => number {
  // `raycastToRef` writes into these instead of allocating a result and two vectors every frame.
  // It lives on the v2 engine; `IPhysicsEngine` only declares the allocating `raycast`.
  const result = new PhysicsRaycastResult();
  const from = new Vector3();
  const to = new Vector3();
  return (x, footY, z) => {
    const engine = scene.getPhysicsEngine() as PhysicsEngineV2 | null;
    if (!engine) return terrainHeight(x, z);
    from.set(x, footY + GROUND_PROBE_ABOVE, z);
    to.set(x, footY - GROUND_PROBE_BELOW, z);
    engine.raycastToRef(from, to, result);
    return result.hasHit ? result.hitPointWorld.y : terrainHeight(x, z);
  };
}

/** Rejects if `promise` has not settled within `ms`. The underlying work is not cancellable — Babylon's
 *  compile poll keeps running — so this bounds the *wait*, not the work. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

/**
 * Loads the knight GLB, parents it to `parent` (the physics-driven player root), scales it to
 * {@link TARGET_HEIGHT}, seats its feet at the capsule bottom, and returns the four animation
 * groups with Idle playing. The mesh inherits the parent's facing rotation. `motion` is polled each
 * frame to keep the feet planted only while the character is actually on the ground.
 *
 * Also gives the head its own material and **awaits its shader compile** — see
 * {@link applyFaceMaterial}. That await is what callers feel: `hubScene` awaits this before
 * `loadTrees` and `runRenderLoop`, so hub startup is gated on it for up to
 * {@link FACE_COMPILE_TIMEOUT_MS}. Face lighting never throws; every failure warns and leaves the
 * head on the material the rest of the character uses.
 */
export async function loadKnight(
  scene: Scene,
  parent: TransformNode,
  shadows: Shadows,
): Promise<Knight> {
  // ?v bust: the browser aggressively caches the GLB, so a plain reload keeps serving an old copy.
  // Bump this whenever knight_web.glb is rebuilt so clients refetch it.
  const result = await ImportMeshAsync('/models/knight_web.glb?v=5', scene);
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
  shadows.receive(...result.meshes.filter((m) => knightReceivesShadow(m.name)));

  await applyFaceMaterial(result.meshes);
  applyBodyPbr(result.meshes, scene);

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
  const byName = (pattern: RegExp): AnimationGroup | undefined => groups.find((g) => pattern.test(g.name));
  const idle = byName(/idle/i);
  const walk = byName(/walk/i);
  const run = byName(/run/i);
  const jump = byName(/jump/i);
  if (!idle || !walk || !run || !jump) {
    throw new Error(`knight_web.glb must contain Idle, Walk, Run and Jump animations; found: ${groups.map((g) => g.name).join(', ') || '(none)'}`);
  }
  // Every clip carries a root-bone reorientation from the retarget (a big ~96° pitch on Walk, a small
  // forward lean on Idle); neutralise them all so the knight stands straight rather than tipping over.
  for (const g of groups) neutralizeRootBoneRotation(g);
  // The mocap idle rocks the torso ~2cm side to side ("leans left then right"). Damp the whole idle
  // toward its average pose so the knight stands steady, keeping a little life. Idle only — damping a
  // run or a jump would flatten exactly the motion those clips exist for.
  dampenSwayTowardMean(idle, IDLE_SWAY_KEEP);
  for (const g of groups) g.stop();
  idle.play(true);

  const knight: Knight = { animations: { idle, walk, run, jump }, planted: 1 };

  // Bind-pose bounds don't match the animated idle pose (the knight floated ~0.8u above the floor),
  // so re-seat once on the actual posed mesh after the first rendered frame.
  const skinnedMeshes = result.meshes.filter((m) => m.skeleton && m.getTotalVertices() > 0);
  if (skinnedMeshes.length > 0) {
    const observer = scene.onAfterRenderObservable.add(() => {
      // Seat on the lowest *skinned vertex*, not the foot bones: the shoe sole extends well below the
      // bones, and the old fixed clearance that compensated for it was hand-tuned, which is what left
      // the knight slightly floating on flat ground. refreshBoundingInfo(applySkeleton) is expensive,
      // but this runs exactly once.
      for (const m of skinnedMeshes) m.refreshBoundingInfo({ applySkeleton: true, applyMorph: false });
      const sole = Math.min(...skinnedMeshes.map((m) => m.getBoundingInfo().boundingBox.minimumWorld.y));
      root.position.y += parent.getAbsolutePosition().y - CAPSULE_HALF - sole;
      const seatedLocalY = root.position.y; // feet grounded when the capsule bottom sits on the surface
      scene.onAfterRenderObservable.remove(observer);

      // On rolling terrain the physics capsule rests ABOVE the ground (its rounded bottom rides
      // slopes/bumps, plus the controller's keepDistance), so a rigidly-parented knight floats. Each
      // frame, drop the visual by however far the capsule bottom sits above the surface under the
      // player, so the feet stay planted.
      //
      // That surface is whatever the player is actually standing on, not the height field — see
      // {@link createGroundProbe}, which is what lets the knight stand ON the plaza pedestal instead
      // of rendering through it.
      //
      // Airborne that correction is exactly wrong — the gap to the ground IS the jump height, so
      // applying it would pin the knight to the ground while the capsule flies. `knight.planted`
      // fades it out, which also keeps takeoff and landing from popping. The probe is skipped
      // entirely once the correction is fading to nothing, so a jump costs no raycast.
      const groundUnder = createGroundProbe(scene);
      scene.onBeforeRenderObservable.add(() => {
        if (knight.planted <= 0) {
          root.position.y = seatedLocalY;
          return;
        }
        const p = parent.getAbsolutePosition();
        const footY = p.y - CAPSULE_HALF;
        root.position.y = seatedLocalY - knight.planted * (footY - groundUnder(p.x, footY, p.z));
      });
    });
  }

  return knight;
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

/** Planar speed above which the knight is at least walking (mirrors Godot's WalkAnimationThreshold). */
const WALK_THRESHOLD = 0.6;
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
 * Drives the knight's pose from the player's motion each frame.
 *
 * **Locomotion** is one scalar `L`: 0 = idle, 1 = walk, 2 = run. It eases toward a target derived
 * from planar speed at {@link BLEND_PER_SECOND}, and the two clips bracketing `L` split the weight.
 * Crucially, a clip left playing at weight 0 still bleeds its motion into the pose (that made a
 * standing knight drift and look unsteady), so a clip that isn't contributing is fully stopped, not
 * just zero-weighted.
 *
 * **Jump** rides over the top as a one-shot: the launch→fall segment, started the moment `airborne`
 * turns on and retimed to fill the real airtime, fading the locomotion blend out and back by
 * `jumpWeight`. Touchdown just ends it — no landing clip is played (see {@link JUMP_FALL_END}).
 */
export function driveKnightAnimation(
  scene: Scene,
  knight: Knight,
  motion: () => KnightMotionSample,
  tuning: () => KnightTuning,
): void {
  const { idle, walk, run, jump } = knight.animations;
  const locomotion = [idle, walk, run];
  const playing = new Map<AnimationGroup, boolean>(locomotion.map((g) => [g, g.isPlaying]));

  let level = 0; // the locomotion scalar L
  let jumpWeight = 0;
  let wasAirborne = false;

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const { planarSpeed, airborne } = motion();
    const { walk: walkSpeed, run: runSpeed, airtime } = tuning();

    // --- jump -----------------------------------------------------------------------------------
    // Nothing is re-decided here: `airborne` already carries the debounce and the takeoff guard, so
    // the clip only needs the moment it turns on.
    if (airborne && !wasAirborne) {
      // Stretch (or compress) the segment onto the actual airtime so the pose lands with the capsule.
      const ratio = (JUMP_FALL_END - JUMP_LAUNCH_START) / Math.max(airtime, DIVISOR_FLOOR);
      playSegment(jump, JUMP_LAUNCH_START, JUMP_FALL_END, ratio);
    }
    wasAirborne = airborne;

    // The segment is a one-shot, so a fall outlasting the clip stops the group mid-air. Let the weight
    // ease down either way rather than dropping the jump's influence to zero on the frame it stops:
    // locomotion would otherwise snap in at full weight in one frame, the very discontinuity this
    // whole weight blend exists to avoid. A stopped group holds its last pose, so easing off it looks
    // like settling out of the jump.
    jumpWeight = moveToward(jumpWeight, airborne && jump.isPlaying ? 1 : 0, JUMP_BLEND_PER_SECOND * dt);
    if (jump.isPlaying) {
      jump.setWeightForAllAnimatables(jumpWeight);
      if (!airborne && jumpWeight <= WEIGHT_EPSILON) jump.stop();
    }
    const jumpInfluence = jumpWeight;

    // The feet ride the capsule while airborne and re-plant on touchdown, off the same flag as the
    // clip, so the two can never disagree.
    knight.planted = moveToward(knight.planted, airborne ? 0 : 1, PLANT_PER_SECOND * dt);

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
    ].map((w) => w * (1 - jumpInfluence));

    for (const [i, group] of locomotion.entries()) {
      const want = weights[i] > WEIGHT_EPSILON;
      if (want && !playing.get(group)) { group.play(true); playing.set(group, true); }
      else if (!want && playing.get(group)) { group.stop(); playing.set(group, false); }
      if (want) group.setWeightForAllAnimatables(weights[i]);
    }
  });
}
