import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Shadows } from './shadows';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this; see crystals.ts).
import '@babylonjs/core/Materials/standardMaterial';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TrailMesh } from '@babylonjs/core/Meshes/trailMesh';
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
  readonly kick: AnimationGroup;
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
   * World-space vertical velocity, world units/s. Needed only to tell a homing bounce from a homing
   * timeout on the frame `homing` clears: `characterMovement.step` sets it to `homingBounceSpeed` (positive)
   * on arrival and to zero on timeout, and that is the only difference between the two — `homing` itself
   * goes null either way.
   */
  readonly verticalSpeed: number;
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
  /** Blue dash trail, started when `homing` turns on and stopped at the bounce or the timeout — see
   *  {@link driveKnightAnimation}. Created once, hidden, in {@link loadKnight}. */
  readonly trail: TrailMesh;
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
 * The knight's base orientation: the model faces +Z on import, so this turns its back to the
 * third-person camera (the hub is right-handed and third-person cameras trail the character, so the
 * model's front has to face away from the rig). Named rather than inlined at its one call site
 * (`root.rotationQuaternion = KNIGHT_FACING.clone()` in {@link loadKnight}) so that assignment reads as
 * "the import correction" instead of a bare `Quaternion.FromEulerAngles(0, Math.PI, 0)` a reader would
 * have to re-derive the reason for.
 *
 * Named a second reason once, too: `driveKnightAnimation` had a dash-spin placeholder that restored
 * this exact orientation when a dash ended, so both call sites needed the same value. `57489fe`
 * deleted that placeholder along with the Flying Kick clip that replaced it, leaving the import
 * assignment as the only reader — the `.clone()` there is cheap insurance against a future second
 * reader mutating this module-level instance in place (Babylon's `rotationQuaternion` is more often
 * mutated via `.copyFrom`/`.set` than reassigned), not evidence that one still exists today.
 */
const KNIGHT_FACING = Quaternion.FromEulerAngles(0, Math.PI, 0);

/**
 * Blue emissive tint for the dash trail. Unlit and bright for the same reason as the crystal's
 * emissive tint in crystals.ts: this needs to read as a streak across the field, not blend into the
 * armour or the terrain.
 */
const TRAIL_EMISSIVE = new Color3(0.3, 0.65, 1);
/**
 * Trail ribbon width and history length. `DASH_TRAIL_LENGTH` is a ring-segment count, dimensionless.
 * `DASH_TRAIL_DIAMETER` is NOT a world-unit width, even though it reads like one next to
 * {@link TARGET_HEIGHT}: `TrailMesh._updateSectionVectors` builds each ribbon section from `diameter`
 * and then transforms it by `generator.getWorldMatrix()` (`createDashTrail` is passed `trailGenerator`,
 * a `TransformNode` parented to the glTF `root` — see {@link loadKnight}), and `root.scaling` is set in
 * {@link loadKnight} to `TARGET_HEIGHT / rawHeight` — a factor that is not 1 by construction (that line
 * exists precisely because the raw model isn't 1.9 units tall). A parented node's world matrix is built
 * from the parent's, so `trailGenerator.getWorldMatrix()` carries that same scaling even though nothing
 * on `trailGenerator` itself sets it. So `0.2` is in the GLB's own local units, and the on-screen ribbon
 * width is `0.2 * root.scaling`, whatever that multiple happens to be — not directly comparable to
 * `TARGET_HEIGHT` or any other world-space measurement in this file. Nobody has watched the trail on
 * screen; retune this by eye in local units against an actual screenshot, or compute the world-space
 * width wanted and divide by `root.scaling` at the call site, rather than treating this number as if
 * it were already in world units.
 */
const DASH_TRAIL_DIAMETER = 0.2;
const DASH_TRAIL_LENGTH = 24;

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
 * **This table is from the previous character** (whose head was `Mesh_0` + `Mesh_32`/`Mesh_33` — see
 * `HEAD_MESHES` in `shadowPolicy.ts`), not the current four-mesh head this file swaps in
 * (`Mesh_1`/`Mesh_20`/`Mesh_43`/`Mesh_46`), and has not been retaken since. A different head mesh with
 * a different face texture in a different frame composition will not reproduce these figures. Left
 * here because `FACE_EMISSIVE` below was *tuned* against this table, so the constant's provenance is
 * this measurement even though the measurement no longer describes what ships — re-measure on the
 * current head before trusting the numbers, and note the constant itself may want retuning once that's
 * done.
 *
 * Previously described here as inseparable from the hair — that was wrong. `shadowPolicy.ts` (`HEAD_MESHES`)
 * establishes that `Mesh_1` is hair only (no face, no neck, no skin) and `Mesh_20` is the face/head
 * skin: they are already separate meshes, both listed separately in `HEAD_MESHES`, both put on the
 * same emissive clone by `swapHeadMaterial` below. So the hair lift (near-black to a warm brown) and
 * the face lift are two separate meshes on one shared material, not one mesh carrying both — they
 * could be tuned independently (e.g. a second, hair-only material) if that were ever wanted. Left as
 * one shared `FACE_EMISSIVE` for now; the lift on the hair reads as an improvement, not a defect.
 */
const FACE_EMISSIVE = 0.45;

/** Cache-buster for the packed metallic/roughness map; bump when the map is rebuilt. */
const BODY_MR_URL = '/models/knight_mr.webp?v=1';

/**
 * How metallic the armour is allowed to read, deliberately below the physically-correct 1.
 *
 * A metal has no diffuse — its albedo becomes the specular F0 — so it can only show what it reflects.
 * This scene has no environment texture (`scene.environmentTexture` is null; nothing in `src/` ever
 * sets one), so at `metallic = 1` the ~36% of texels the packed map flags as metal have nothing to
 * reflect but the sun's specular lobe and render near-black. The armour's own albedo is dark to begin
 * with — mean luma 71.8/255, 39.5% of its texels below 32 — so there is little headroom to lose.
 *
 * Holding some diffuse back is the concession that buys the plate its shape without an IBL. Measured
 * over the armour's own pixels (mask taken by hiding the body and diffing, 50 850 px), scene frozen,
 * zero reproducibility and restore controls, at `BODY_DIRECT_INTENSITY`:
 *
 * | metallic | mean luma | pixels below 30 |
 * | --- | --- | --- |
 * | 1.0 | 34.0 | 66.6% |
 * | 0.8 | 46.4 | 42.4% |
 * | **0.6** | **56.0** | **35.3%** |
 * | 0.4 | 64.1 | 32.5% |
 *
 * 0.4 is brighter still but the steel starts reading as plastic, losing the dark-to-light contrast
 * that makes it look like metal. If an environment texture is ever added, raise this back toward 1
 * and re-measure — the correct fix is the IBL, not this number.
 *
 * This table, `BODY_DIRECT_INTENSITY`'s below, and the "~36%" metal-texel figure above were all
 * measured through the *lossy* `knight_mr.webp` that ships today (its header is `VP8 `, not
 * `VP8L` — see the README's regeneration recipe). Lossy WebP chroma-subsamples and cross-contaminates
 * the G/B channels this map packs roughness and metallic into, so re-packing losslessly per that
 * recipe changes the inputs these numbers came from and invalidates this table; re-measure after
 * re-packing rather than trusting these figures against the new map.
 */
const BODY_METALLIC = 0.6;

/**
 * Direct-light multiplier for the armour, compensating for the same missing IBL.
 *
 * `directIntensity` scales only this material's response to the scene's lights, so it lifts the
 * armour without touching the terrain, foliage or the toon face (which is its own material). Measured
 * at `BODY_METALLIC`, same mask and controls: 1.0 -> 43.5, 1.3 -> 50.1, **1.6 -> 56.0**, 2.0 -> 63.2.
 *
 * Together with `BODY_METALLIC` this takes the armour from **27.6 mean luma with 72.2% of its pixels
 * below 30** to **56.0 with 35.3%** — roughly double the brightness, with the near-black half of the
 * surface halved. That was the reported problem: the plate read as a flat silhouette, and its shapes
 * merged into one another rather than looking see-through.
 *
 * Like `BODY_METALLIC`'s table, this was measured through the *lossy* `knight_mr.webp` that ships
 * today; re-packing losslessly per the README's recipe changes the G/B inputs and invalidates these
 * figures too — re-measure after re-packing.
 */
const BODY_DIRECT_INTENSITY = 1.6;

/**
 * Corrects the GLB-shipped `normalTexture.scale: 0` on the knight's material while every mesh —
 * head included — still shares that one material object, so the correction is in place before
 * anything clones it.
 *
 * Must run before {@link applyFaceMaterial}. Every one of the knight's 47 meshes ships sharing a
 * single glTF material at the point `loadKnight` calls this; `swapHeadMaterial` (inside
 * `applyFaceMaterial`, called right after) is what first splits the head onto its own clone via
 * `Material.clone()`. `Material.clone()` runs every texture slot through `SerializationHelper.Clone`,
 * which calls `sourceProperty.clone()` — and `level` is a `@serialize()` field on `BaseTexture` — so
 * the clone ends up with its own `bumpTexture` *wrapper*, carrying whatever `level` the source had at
 * clone time. Correct the source here, before that clone exists, and the clone inherits the fix for
 * free. Correcting it only in {@link applyBodyPbr} instead — which runs after the split, and only
 * touches the body's copy of the material — would leave the head's four meshes, including `Mesh_1`
 * (the 9232-vertex hair), on the shipped `level: 0`. Babylon's loader copies `normalTexture.scale`
 * straight into `bumpTexture.level` (`glTFLoader.pure.js`), and PBR materials compile with
 * `NORMALXYSCALE` defined, so `perturbNormalBase` evaluates `normalize(n * vec3(scale, scale, 1.0))`
 * with `scale = 0` — the unperturbed geometric normal, i.e. a dead normal map on whichever mesh never
 * gets corrected.
 *
 * The base commit's GLB had no `scale` key at all (the glTF spec default of 1), so the head had a
 * live normal map before this PR swapped in a GLB that ships `scale: 0`; leaving this uncorrected
 * would be a regression this PR introduces, not a pre-existing defect.
 *
 * If a re-export ever puts the head on one material and the body on another — the most likely way
 * the "everything shares one material" assumption breaks, and exactly the split
 * {@link swapHeadMaterial} performs by hand today — that is caught HERE, not downstream. Neither
 * `applyFaceMaterial`'s nor `applyBodyPbr`'s own "shares one material" guard would catch it: each
 * only compares materials *within* its own slice (all-head, or all-body), and a head/body split
 * still leaves every mesh agreeing with the others in its own slice, so both guards pass silently.
 * The correction has to run per distinct material for the same reason: guessing "the" material and
 * skipping the rest would leave whichever material is not `source` on the shipped `level: 0` with no
 * warning anywhere — the one silent failure path in a file where every other guard warns.
 *
 * Warn-and-skip, like every other guard in this file: this runs inside `loadKnight`, which `hubScene`
 * awaits before `loadTrees` and `runRenderLoop`, so nothing here may throw.
 */
function correctSharedNormalScale(meshes: readonly AbstractMesh[]): void {
  const withMaterial = meshes.filter((m) => m.material);
  if (withMaterial.length === 0) return;
  const materials = [...new Set(withMaterial.map((m) => m.material))] as PBRMaterial[];
  if (materials.length > 1) {
    // Not the expected shape — nothing should have split the material yet on this GLB — but correct
    // every distinct material anyway rather than guessing which one to fix and leaving the rest on
    // the shipped `level: 0`. See the doc above for why neither downstream guard reports this split.
    console.warn(
      `[knight] meshes do not share one material before any clone has run (${materials.length} distinct: ${materials.map((m) => m?.name ?? 'none').join(', ')}) — correcting normalTexture.scale on each rather than skipping.`,
    );
  }
  for (const source of materials) {
    if (source.getClassName() !== 'PBRMaterial') continue; // applyBodyPbr's/applyFaceMaterial's own guards report a non-PBR material from their own slice.
    if (source.bumpTexture && source.bumpTexture.level !== 1) {
      console.warn(
        `[knight] '${source.name}' shipped normalTexture.scale ${source.bumpTexture.level} — reset to 1, before face lighting clones this material, so both body and head pick up the armour's normal map. Re-export should fix this at the source; see the README.`,
      );
      source.bumpTexture.level = 1;
    }
  }
}

/**
 * Gives the armour a metallic/roughness map so the plate catches light as metal instead of reading as
 * flat matte, and — synchronously, before any of that map's fetch has even started — closes a seam:
 * the `backFaceCulling`/`twoSidedLighting` pair that closes up the armour's single-sided shells at
 * their see-through seams. This GLB is legitimately not `doubleSided`, so the loader correctly never
 * set `twoSidedLighting`, and dropping culling is a deliberate art call, not a correction (see the
 * comments above those two assignments below).
 *
 * The other export-side defect this material ships with — `normalTexture.scale: 0` — is corrected
 * earlier, by {@link correctSharedNormalScale}, *before* {@link applyFaceMaterial} clones this
 * material for the head. Fixing it here instead, after the clone already exists, would leave the
 * clone (and so all four head meshes) on the shipped, uncorrected `level`; see that function's doc.
 *
 * Runs *after* {@link applyFaceMaterial}, so the head's toon clone — cloned before this — keeps a
 * non-metallic, unlit face. The whole body shares one material, so setting it once covers every mesh.
 *
 * **The map is fire-and-forget; the corrections above it are not.** `backFaceCulling` and
 * `twoSidedLighting` are both written to `source` before this function returns — see the comments
 * above each assignment for why they cannot wait. Only `metallicTexture` and its sampler flags are
 * deferred into the loaded texture's `onLoad` callback below, which fires at an unbounded later time —
 * after `loadKnight` has already resolved and `hubScene`'s render loop has already started. Unlike
 * {@link applyFaceMaterial}, `loadKnight` does not await this call, so a caller cannot observe the
 * map's arrival by awaiting `loadKnight`: until `onLoad` fires, the armour renders with the seam fix
 * already applied, but without the metallic/roughness map.
 *
 * Deliberately has no {@link FACE_COMPILE_TIMEOUT_MS}-style ceiling on that wait. The face path needs
 * one because `loadKnight` awaits it — an unbounded hang there would block scene startup entirely, with
 * no render loop, no trees, no input. This path is awaited by nothing, so a slow or hung fetch costs
 * only a late texture: the model keeps rendering in its already-corrected pre-map state in the
 * meantime, a stuck `onLoad` never fires and never blocks anything else, and a failed fetch still
 * surfaces via `onError`'s warning below rather than failing silently. There is no caller-visible hang
 * here for a timeout to bound.
 *
 * That head/body split only holds while `applyFaceMaterial` actually swapped the clone in.
 * `applyFaceMaterial` is deliberately warn-and-skip and returns without swapping from several guard
 * points, and this function excludes the head only *by name* — so on any of those paths the head
 * meshes are still sitting on the very material this function is about to make metallic and
 * light-tracking. Detected below and skipped rather than silently making the face metallic.
 */
function applyBodyPbr(meshes: readonly AbstractMesh[], scene: Scene): void {
  const body = meshes.filter((m) => !HEAD_MESHES.includes(m.name) && m.material);
  if (body.length === 0) {
    console.warn('[knight] no body material found — PBR skipped, armour stays matte.');
    return;
  }
  const source = body[0].material as PBRMaterial;
  // "The whole body shares one material" only means anything while the body actually shares one.
  // `swapHeadMaterial` below guards the identical assumption for the head explicitly, and for the same
  // reason: a re-export splitting the armour across two materials (belt, cloth, plate) would otherwise
  // leave the second one matte, non-metallic and at `directIntensity` 1, next to a body lifted to
  // `BODY_DIRECT_INTENSITY`, with no warning. Skip loudly instead of half-applying it.
  if (body.some((m) => m.material !== source)) {
    // Dedupe by material *identity*, not name: glTF does not require unique material names and the
    // loader does not dedupe them (the same reasoning `swapHeadMaterial` below spells out for mesh
    // names), so two distinct materials sharing a name would otherwise collapse into "1 distinct" —
    // a message that contradicts itself in exactly the case this guard exists to report.
    const distinct = [...new Set(body.map((m) => m.material))];
    const names = distinct.map((m) => m?.name ?? 'none');
    console.warn(
      `[knight] body meshes do not share one material (${distinct.length} distinct: ${names.join(', ')}) — PBR skipped rather than painting one of them across the rest.`,
    );
    return;
  }
  // `metallicTexture`, `useRoughnessFromMetallicTextureGreen`, `useMetallnessFromMetallicTextureBlue`,
  // `useRoughnessFromMetallicTextureAlpha`, `metallic` and `roughness` exist only on `PBRMaterial`; on
  // any other material class every one of the writes below lands as an inert own-property and the
  // armour silently stays matte. Check before touching, the way the head path checks `albedoTexture`.
  if (source.getClassName() !== 'PBRMaterial') {
    console.warn(
      `[knight] body material '${source.name}' is a ${source.getClassName()}, not a PBRMaterial — PBR skipped, armour stays matte.`,
    );
    return;
  }
  // `body` was filtered by name, which only proves the head *meshes* aren't in it — not that the head
  // is off `source`. `applyFaceMaterial` warn-and-skips from seven different guard points (name-count
  // mismatch, no material, split head materials, no albedoTexture, `clone()` returning null, a clone
  // without an albedoTexture, or a compile failure that rolls the head back to `source`), and on every
  // one of them the head meshes are still on this exact material object. Applying `metallic = 0.6`,
  // `directIntensity = 1.6` and unculled two-sided lighting to it would make the face metallic and
  // light-tracking — a worse outcome than the matte face `applyFaceMaterial`'s own doc promises when it
  // skips. Detect that by identity, not by name, and skip loudly instead.
  if (meshes.some((m) => HEAD_MESHES.includes(m.name) && m.material === source)) {
    console.warn(
      `[knight] head meshes are still on '${source.name}' — face lighting must not have swapped its clone in. PBR skipped rather than making the face metallic too.`,
    );
    return;
  }
  // The normal-scale defect this material ships with (`normalTexture.scale: 0`) is corrected earlier,
  // on `source` itself, by `correctSharedNormalScale` — before this function ever runs and before
  // `applyFaceMaterial` clones the material for the head. By the time `source` is read here it should
  // already be 1; this function does not re-correct it (see `correctSharedNormalScale`'s doc for why
  // the correction has to happen before the clone, not after).
  //
  // The armour is a stack of single-sided shells that do not quite meet — most visibly where the
  // upper arm passes the torso. Back-face culling removes the far shell's inward-facing triangles,
  // so those seams showed the scene straight through the character rather than the armour's inside.
  // Measured against the knight's true silhouette (taken with culling off, so gaps are inside it,
  // scene frozen, zero reproducibility control): 107 of 53 245 silhouette pixels read as background
  // with culling on, 0 with it off, and every camera angle tried showed the same (241-497 px on,
  // 0 off). Only the body needs this — leaving the face culled measures identically at 0, and the
  // head is a closed mesh that gains nothing from the extra fragments.
  //
  // This also reaches the shadow map, not just the camera pass: `ShadowGenerator._renderSubMeshForShadowMap`
  // passes the material's own `backFaceCulling` straight through, so turning it off here turns
  // culling off for all four CSM cascade renders too, and these 43 meshes both cast and receive.
  // Measured the consequence directly (same frozen frame, 70 436 knight pixels, zero
  // reproducibility control), body culled vs. unculled:
  //
  // | | body culled | body unculled | delta |
  // | --- | --- | --- | --- |
  // | `scene.shadowsEnabled = true` | 53.5 mean luma, 30.68% below 20 | 51.9, 30.73% | **−1.6** |
  // | `scene.shadowsEnabled = false` | 63.1, 29.81% | 63.1, 29.81% | **0.00** |
  //
  // With shadows off the change is aggregate-neutral, as expected — the seam pixels are a small
  // fraction of the body. With shadows on, the back faces write depth into the same cascades these
  // meshes sample, and that darkens the knight by ~1.6 luma (~3%). The near-black fraction barely
  // moves (30.68% -> 30.73%), so this is a mild uniform darkening, not new acne — accepted, and it
  // slightly offsets `BODY_METALLIC`/`BODY_DIRECT_INTENSITY` above. `NORMAL_BIAS = 0.04` in
  // `shadows.ts` (Task 8) was validated against this material CULLED, so that validation no longer
  // describes what ships — but the table above shows no acne increase with it unculled, so this is
  // recorded rather than re-tuned. The extra fragment cost across four cascades is real and
  // unmeasured; timing cannot be measured through a hidden browser pane on this machine.
  //
  // A second, independent way this PR invalidates that same Task 8 validation: it was measured at
  // 62 meshes casting-and-receiving (31 `tripo_part_*` knight-body meshes + 31 environment meshes,
  // spec §7). This PR takes the knight's receiving body from 31 meshes to 43 (see `HEAD_MESHES` /
  // `knightReceivesShadow` in `shadowPolicy.ts`), so the shipped casting-and-receiving count is now
  // 74, not 62. `NORMAL_BIAS = 0.04`'s acne validation was never re-run at 74 — it is recorded here
  // rather than re-tuned, same as the culled/unculled point above, and both are noted at
  // `shadows.ts`'s `NORMAL_BIAS` declaration and its WebGL1-fallback comment.
  //
  // Applied here, unconditionally and synchronously — NOT deferred into the metallic/roughness map's
  // `onLoad` below. It has no dependency on that map, and deferring it there was a bug: on a failed
  // fetch `onLoad` never fires, so the seam fix never applied either, and the armour was not merely
  // matte in that state but see-through (the 107/53245-pixel gap above, reopened). Setting it here
  // means the seams stay closed regardless of whether the map ever arrives.
  source.backFaceCulling = false;
  // Babylon gates the back-face normal flip in `pbrBlockNormalFinal` on
  // `!backFaceCulling && twoSidedLighting` (see `trees.ts`'s identical pairing for the doubleSided
  // glTF case). This GLB is not `doubleSided`, so the loader never set `twoSidedLighting`, and without
  // it every back face `backFaceCulling = false` newly rasterises would shade with its outward normal
  // instead of the flipped one. Set it explicitly for the correct pairing on a double-sided material.
  //
  // Measured rather than assumed load-bearing: over the 5431 px that back faces actually fill (pixels
  // differing between the culled and unculled renders), toggling this changed 1 pixel. Seam mean luma
  // was 60.4 with 0% near-black either way — brighter than the armour's own mean, not the unlit black
  // the wrong-normal mechanism predicts — because the hemispheric ambient already lights these seams
  // adequately. So this is not what is holding the seams up today; it is the correct flag for a
  // double-sided material and cheap insurance against future geometry or lighting changes that would
  // make the wrong-normal shading visible.
  source.twoSidedLighting = true;
  // Every mutation below is applied together, and only once BODY_MR_URL has actually finished
  // loading — inside the `onLoad` callback. The previous shape of this function set
  // `metallic`/`roughness`/the sampler eagerly, before the fetch could possibly have completed, on
  // the theory that non-blocking would leave the body rendering on "the shared material's current
  // state (matte)" in the meantime. That is not what actually happens: Babylon's `_setTexture`
  // substitutes its zero-filled `emptyTexture` for any sampler that is not ready, and
  // `pbrBlockReflectivity` then computes `metallicRoughness.r *= map.b` and `.g *= map.g` against
  // that all-zero texture, so both resolve to 0 — fully dielectric at roughness 0, a hard
  // pinpoint-specular "plastic" look, the opposite end of the range from matte. The same substitution
  // is also what a *failed* fetch leaves in place forever, silently. Measured on the knight's own
  // pixels by pointing this texture at a URL that 404s:
  //
  // | state | mean luma | pixels above 150 |
  // | --- | --- | --- |
  // | map loaded | 85.0 | 1.32% |
  // | failed fetch (emptyTexture) | 104.2 | 31.17% |
  //
  // A 24-fold jump in bright pixels — the pinpoint-specular signature. Deferring every write here to
  // `onLoad` makes the pre-load state and a permanently-failed fetch identical: the body simply stays
  // on the shared material's current GLB state (today, flat matte) until the map is actually ready —
  // which is what "armour appears as it was, then gains its map" requires. `onError` also warns now,
  // in the same voice as every other guard in this function, instead of leaving the plastic look
  // permanent and silent.
  const mr = new Texture(BODY_MR_URL, scene, {
    noMipmap: false,
    invertY: false,
    onLoad: () => {
      // The GLB's own metallicTexture/metallic/roughness are overwritten here with no fallback.
      // Today's GLB ships flat factors and no metallicTexture, so nothing is lost. `knight.fbx` itself
      // carries no metallic or roughness source either — verified against the file: its only texture
      // references are `Material_Diffuse.jpg` and `Material_Normal.jpg`, its bytes contain no
      // occurrence of `metal`/`Metal`/`roughness`/`Roughness`, and the committed `knight.fbm/` folder
      // holds exactly those two JPEGs (the README's regeneration recipe says the same: no metallic or
      // roughness source is committed). So getting them into the GLB directly is not on the table for
      // *this* pipeline without a new source asset. This guard is kept anyway, for whatever eventually
      // supplies one: the day a metallic/roughness-carrying GLB does ship, this would silently paint
      // the separately-versioned `knight_mr.webp` sidecar over a correct, co-versioned map. Warn, in
      // the same spirit as the head path's emissiveFactor/emissiveTexture/emissiveIntensity guards.
      if (source.metallicTexture) {
        console.warn(
          `[knight] '${source.name}' already ships a metallicTexture. It is discarded: applyBodyPbr replaces it with ${BODY_MR_URL}.`,
        );
      }
      source.metallicTexture = mr;
      source.useRoughnessFromMetallicTextureGreen = true;
      source.useMetallnessFromMetallicTextureBlue = true;
      // Babylon reads roughness from the metallic texture's ALPHA channel by default, and alpha takes
      // precedence over green — so setting Green alone does nothing. The packed map is fully opaque
      // (alpha 255 everywhere, verified by reading it back), which pinned roughness at 1.0 and discarded
      // the 0.25-0.6 the G channel actually carries. Turning this off is what lets the packing take effect.
      source.useRoughnessFromMetallicTextureAlpha = false;
      source.metallic = BODY_METALLIC;
      source.roughness = 1;
      source.directIntensity = BODY_DIRECT_INTENSITY;
    },
    onError: (message, exception) => {
      // Nothing above ever ran — `source` is untouched, so the armour stays on the shared material's
      // current GLB state (today, flat matte) rather than silently freezing into the pinpoint-specular
      // look the table above measures. That is the *right* fallback, but a permanent one with no
      // explanation, so say so. The seam fix (`backFaceCulling`/`twoSidedLighting` above this texture)
      // does not depend on this map and is unaffected — it is applied unconditionally, so a failed
      // fetch here costs only the metallic look, not the closed seams.
      console.warn(
        `[knight] failed to load ${BODY_MR_URL} — armour stays on the shared material's current (matte) state, permanently:`,
        message ?? exception,
      );
    },
  });
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
 * Every one of the knight's 47 meshes ships sharing a single glTF material, so the head needs a clone
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
 * Guards, clones, puts the clone on the four head meshes, awaits its compile, and rolls the meshes
 * back if that fails. Split out from {@link applyFaceMaterial} so the try/catch there covers all of it.
 */
async function swapHeadMaterial(meshes: readonly AbstractMesh[]): Promise<void> {
  const head = meshes.filter((m) => HEAD_MESHES.includes(m.name));
  // Each expected name must appear exactly once. Counting `head.length` would not establish that:
  // glTF does not require unique node names and the loader does not dedupe them, so a GLB with two
  // `Mesh_1`s and no `Mesh_46` still totals four — and the face would be applied to part of the head
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
  // `vLightingIntensity.y` — and the shipped GLB does carry KHR_materials_emissive_strength with
  // emissiveStrength 0 (see the README's GLB regeneration recipe), so this guard fires on every load
  // of today's asset, not hypothetically: left unpinned, that 0 would multiply FACE_EMISSIVE to black
  // and the measured table above would stop describing what renders. Pin it to 1 so the constant means
  // what it says, and report the discard like the other two channels.
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

/**
 * Builds the dash trail, hidden and stopped: {@link driveKnightAnimation} starts it when `homing` turns
 * on and stops it at the bounce or the timeout.
 *
 * Unlit (`disableLighting`) rather than the crystal's lit-emissive combination in crystals.ts: a thin,
 * fast-tapering ribbon catches shading artefacts at its degenerate edges that a solid polyhedron
 * doesn't, and this effect only needs to read as a flat blue streak.
 */
function createDashTrail(scene: Scene, generator: TransformNode): TrailMesh {
  const mat = new StandardMaterial('knightTrailMat', scene);
  mat.emissiveColor = TRAIL_EMISSIVE;
  mat.disableLighting = true;
  const trail = new TrailMesh('knightDashTrail', generator, scene, DASH_TRAIL_DIAMETER, DASH_TRAIL_LENGTH, false);
  trail.material = mat;
  trail.isPickable = false;
  trail.setEnabled(false);
  return trail;
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
  const result = await ImportMeshAsync('/models/knight_web.glb?v=6', scene);
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

  correctSharedNormalScale(result.meshes);
  await applyFaceMaterial(result.meshes);
  applyBodyPbr(result.meshes, scene);

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
    throw new Error(`knight_web.glb must contain Idle, Walk, Run, Jump and Flying Kick animations; found: ${groups.map((g) => g.name).join(', ') || '(none)'}`);
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

  // The trail must NOT be generated off `root` itself: `root` is the glTF `__root__` node, and the
  // seating above puts its origin at the CAPSULE's bottom — the knight's FEET, not its body — so a
  // `TrailMesh` fed `root` as its generator draws the ribbon from ground level regardless of where the
  // character actually is (the bug the owner saw). A dedicated generator node fixes it without moving
  // `root` itself, which everything else in this file (foot planting, the terrain re-anchor above)
  // depends on staying exactly where it is.
  //
  // Same coordinate-space trap `DASH_TRAIL_DIAMETER` documents: `trailGenerator` is parented to `root`,
  // so its world position is `root`'s world matrix applied to its OWN local position — and `root.scaling`
  // (set above to `TARGET_HEIGHT / rawHeight`) is part of that matrix. So a local Y of `rawHeight / 2`
  // (half the model's own raw height, in the GLB's own units, BEFORE the `TARGET_HEIGHT` rescale) lands
  // at `rawHeight / 2 * root.scaling` = `rawHeight / 2 * (TARGET_HEIGHT / rawHeight)` = `TARGET_HEIGHT / 2`
  // in world space — mid-torso on the rescaled, on-screen knight. Using a world-space or `TARGET_HEIGHT`-
  // relative offset here instead would be off by whatever `root.scaling` happens to be, the same mistake
  // `DASH_TRAIL_DIAMETER`'s doc warns against for the ribbon's width.
  const trailGenerator = new TransformNode('knightTrailGenerator', scene);
  trailGenerator.parent = root;
  trailGenerator.position.y = rawHeight / 2;

  const trail = createDashTrail(scene, trailGenerator);
  const knight: Knight = { animations: { idle, walk, run, jump, kick }, planted: 1, trail };

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
 * as {@link JUMP_LAUNCH_START} above, but by parsing `public/models/knight_web.glb`'s animation
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
 * whether the dash ends in a bounce or a timeout (`KnightMotionSample.verticalSpeed`) and has its own
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
 *
 * **Homing** layers on top of both, driven off `homing` rather than `airborne` (which stays true for
 * the whole dash-plus-bounce, so it never re-fires the jump segment on its own): the
 * [{@link KICK_STRIKE_START}, {@link KICK_STRIKE_END}] slice of the Flying Kick clip plays once,
 * retimed onto `homingEntrySeconds` the same way the jump segment is retimed onto `airtime` — a dash
 * is bounded at `homingMaxDuration` (0.6s) and typically shorter, well under the clip's full 1.5s, so
 * playing it unretimed at natural rate would show only its wind-up and never the kick itself (see
 * {@link KICK_STRIKE_START}'s doc). The trail runs for as long as `homing` is true, and both the clip
 * and the trail fade in and out by `kickWeight` the same way the jump segment fades by `jumpWeight` —
 * and, since `canEnterHoming` only fires while already airborne, the jump segment can still be
 * mid-fade when a dash starts, so `kickWeight` also cuts into the jump's *rendered* weight (not
 * locomotion's, which is already zeroed by `jumpInfluence` whenever a jump is live) so the two
 * one-shots do not fight over the same bones. On the frame `homing` clears, a positive `verticalSpeed`
 * (a bounce; see {@link KnightMotionSample.verticalSpeed}) restarts the jump clip from
 * {@link BOUNCE_RESTART} so it rides the existing `jumpWeight` blend back into locomotion. A timeout
 * (`verticalSpeed` not positive) plays nothing — the domain already zeroed the velocity, so the knight
 * simply resumes falling under gravity next frame.
 */
export function driveKnightAnimation(
  scene: Scene,
  knight: Knight,
  motion: () => KnightMotionSample,
  tuning: () => KnightTuning,
): void {
  const { idle, walk, run, jump, kick } = knight.animations;
  const locomotion = [idle, walk, run];
  const playing = new Map<AnimationGroup, boolean>(locomotion.map((g) => [g, g.isPlaying]));

  let level = 0; // the locomotion scalar L
  let jumpWeight = 0;
  let kickWeight = 0;
  let wasAirborne = false;
  let wasHoming = false;

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const { planarSpeed, airborne, homing, verticalSpeed, homingEntrySeconds } = motion();
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

    // --- homing dash pose, trail and bounce seam -------------------------------------------------
    // `airborne` stays true for the whole dash and the bounce that follows it (the capsule never
    // touches ground in between), so the block above never re-fires on a bounce — `homing`'s own
    // edges are what drive the pose and the clip restart here.
    if (homing && !wasHoming) {
      // Collapse the ribbon to the current position so it grows fresh from the dash's start, rather
      // than snapping in a straight line from wherever it last trailed off.
      knight.trail.reset();
      knight.trail.setEnabled(true);
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
      knight.trail.setEnabled(false);
      // `characterMovement.step` clears `homing` on both a bounce and a timeout, so that alone can't
      // tell them apart — a bounce also sets a positive vertical velocity (`homingBounceSpeed`), a
      // timeout zeroes it (see KnightMotionSample.verticalSpeed's doc). Only a bounce restarts the
      // clip; a timeout leaves the knight simply falling under gravity from here, with no clip played.
      if (verticalSpeed > 0) {
        // Untuned, unlike `ratio` above: retiming this the same way would need a bounce-specific
        // airtime, and `KnightTuning` exposes none. Reusing the ordinary jump's `airtime` would
        // misrepresent the bounce — that value is derived from `jumpSpeed`, while a bounce rises at
        // `homingBounceSpeed`, a different speed with a different real duration. Plays at the clip's
        // natural rate for now; a later task tunes it by eye in the browser.
        const bounceRatio = 1;
        playSegment(jump, BOUNCE_RESTART, JUMP_FALL_END, bounceRatio);
      }
    }
    wasHoming = homing;

    // The segment is a one-shot, so a fall outlasting the clip stops the group mid-air. Let the weight
    // ease down either way rather than dropping the jump's influence to zero on the frame it stops:
    // locomotion would otherwise snap in at full weight in one frame, the very discontinuity this
    // whole weight blend exists to avoid. A stopped group holds its last pose, so easing off it looks
    // like settling out of the jump.
    jumpWeight = moveToward(jumpWeight, airborne && jump.isPlaying ? 1 : 0, JUMP_BLEND_PER_SECOND * dt);
    // Same fast ease as the jump: a dash pose has to read as immediate, not cross-fade in.
    kickWeight = moveToward(kickWeight, homing && kick.isPlaying ? 1 : 0, JUMP_BLEND_PER_SECOND * dt);
    if (kick.isPlaying) {
      kick.setWeightForAllAnimatables(kickWeight);
      if (!homing && kickWeight <= WEIGHT_EPSILON) kick.stop();
    }
    // `canEnterHoming` only fires while already airborne, so the jump segment can still be live —
    // and its weight still ramping — on the frame a dash starts. Cut kick's share out of jump's
    // *rendered* weight (not `jumpWeight` itself, which still governs the stop-out-of-airborne check
    // below) so the two one-shots don't compete for the same bones; locomotion needs no equivalent
    // term because `jumpInfluence` already zeroes it whenever a jump is live.
    if (jump.isPlaying) {
      jump.setWeightForAllAnimatables(jumpWeight * (1 - kickWeight));
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
    ].map((w) => w * (1 - jumpInfluence) * (1 - kickWeight));

    for (const [i, group] of locomotion.entries()) {
      const want = weights[i] > WEIGHT_EPSILON;
      if (want && !playing.get(group)) { group.play(true); playing.set(group, true); }
      else if (!want && playing.get(group)) { group.stop(); playing.set(group, false); }
      if (want) group.setWeightForAllAnimatables(weights[i]);
    }
  });
}
