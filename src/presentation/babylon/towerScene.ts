import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader. Required with tree-shaken deep imports,
// otherwise meshes without an explicit material silently render nothing.
import '@babylonjs/core/Materials/standardMaterial';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
// Side-effect: registers Scene.prototype.enablePhysics / getPhysicsEngine (patched by
// RegisterJoinedPhysicsEngineComponent). Without this, enablePhysics is a no-op and
// PhysicsAggregate throws "No Physics Engine available".
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';

import { stepTowerProgress, TOWER_START, type TowerProgress } from '../../domain/hub/tower/towerProgress';
import { createCharacterRig } from './characterRig';
import { createCrystals } from './crystals';
import { exposeDevHandle } from './devHandles';
import { unknownGround } from './groundHeight';
import { loadHavok } from './havokModule';
import { IBL_FACE_SIZE, IBL_INTENSITY, IBL_URL } from './ibl';
import { disposeLevel, type LevelParts } from './levelTeardown';
import { createShadows, type Shadows } from './shadows';
import { standingOnPedestal, stepPortalTrigger, PORTAL_START, type PortalTrigger } from './portalTrigger';
import { toBabylon } from './vectorConversions';
import { CAPSULE_HALF } from './capsule';
import { PEDESTAL_HEIGHT } from './pedestal';
import { createHubAudio } from '../audio/hubAudio';
import {
  TOWER_CHECKPOINTS,
  TOWER_COLUMN_HEIGHT,
  TOWER_COLUMN_RADIUS,
  TOWER_CRYSTALS,
  TOWER_FALL_MARGIN,
  TOWER_FLOOR_RADIUS,
  TOWER_FLOOR_Y,
  TOWER_PLATFORMS,
  TOWER_SLAB_THICKNESS,
  TOWER_SPAWN,
  TOWER_SUMMIT,
  TOWER_SUMMIT_RADIUS,
  type TowerPlatform,
} from './towerLevel';

/**
 * The sky the white column has to read against. **Untuned**: a near-black blue, dark because spec §2
 * says the tower is white and one solid column, and a white column needs something behind it. There
 * is no skydome, no fog and no atmosphere post-process — the clear colour is the whole sky, which is
 * also where the hub's 91 % shadow cost and its terrain/tree/cloud draw calls actually go away.
 *
 * It has now been rendered and screenshotted at four heights (spec §14.7) and nothing was moved for
 * it: whether the white column reads against it is a judgement nobody has made, which is why this
 * stays **Untuned**.
 */
const SKY_RGB: readonly [number, number, number] = [0.04, 0.05, 0.09];

/**
 * The tower's white. **Untuned**: 0.9 rather than 1.0 so the sun still has somewhere to go on a lit
 * face, with a barely-blue tint so it sits with {@link SKY_RGB} rather than reading as paper. The
 * low specular is the same call `landmark.ts` makes for stone — a broad highlight on a 62 u column
 * would be a stripe, not a shine.
 */
const WHITE_DIFFUSE = new Color3(0.9, 0.9, 0.92);
const WHITE_SPECULAR = new Color3(0.08, 0.08, 0.08);

/**
 * The tower's sun: which way it points, where it stands, and how bright. **All three Untuned**, and
 * they are Untuned in three different ways, so each is marked for itself.
 *
 * {@link SUN_DIRECTION} has a reason, and it is the only one that does: the angle only has to make
 * the column's near face brighter than its far one, so the round shape reads. Where the shadows fall
 * has now been looked at (spec §14.7) and this was not moved for it: the knight's own shadow lands on
 * the slab under it and the column's on the floor, and the summit pedestal is **backlit** from the
 * direction the last bounce arrives from, so it reads as a dark disc on a white balcony rather than
 * as white on white. Watched, not measured, and not called a defect here — whether the exit still
 * reads as the exit is the owner's call.
 *
 * {@link SUN_POSITION} is a **guess, and mostly inert**. A directional light lights by its direction
 * alone; its position only places a shadow frustum, and only on `shadows.ts`'s plain-generator
 * fallback branch — the cascaded branch this level runs on derives its own frustum from the camera.
 * So all this had to be was high enough and far enough out to sit clear of a 62 u column. Nothing
 * about it was measured and nothing on the shipped path reads it.
 *
 * {@link SUN_INTENSITY} is a **guess with no derivation at all**, and the honest statement is that
 * 1.2 against the hub's 1.1 (`environment.ts`) is a difference nobody decided. It is not derivable
 * from the hub's either: this scene has no skydome, no fog and two thirds of the hub's ambient
 * ({@link AMBIENT_INTENSITY} 0.3 against 0.45), and it is lighting white rather than grass, so what
 * the hub's number would look like here is not something the hub's number answers. Retune it by eye
 * against the column, together with {@link WHITE_DIFFUSE} and {@link SKY_RGB}, which are the other
 * two halves of the same judgement.
 */
const SUN_DIRECTION = new Vector3(-0.4, -1, -0.6);
const SUN_POSITION = new Vector3(20, 90, 30);
const SUN_INTENSITY = 1.2;
/** **Untuned**: dimmer than the hub's 0.45, because the hub's ambient is filling a daylit outdoor
 *  scene and this one only has to keep the column's shaded side off pure black. */
const AMBIENT_INTENSITY = 0.3;

/**
 * How far from the camera the tower's shadows stop, and how many cascades cover it. **Both Untuned,
 * and both deliberate deviations from `shadows.ts`'s own constants**, which are shaped for the hub:
 * `shadowMaxZ` 120 over a 100 x 100 plain, split four ways.
 *
 * A climb is the opposite shape. Everything whose shadow says anything is within a few units of the
 * player — their own body on the slab they are standing on, and the column face beside them — and the
 * camera sits 5 u away, so 30 u covers the player, their platform, the next platform up and the
 * column between them. Two cascades rather than four because 30 u split logarithmically twice already
 * puts the near split around 8 u, and every cascade is a full re-render of every caster.
 *
 * Everything else in `shadows.ts` is inherited on purpose: `bias`, `normalBias`, the filter and the
 * darkness were all measured (spec §7 Task 3 and Task 8), and `normalBias` in particular is a
 * world-space offset that does not scale with the light frustum, so that measurement carries here.
 * Only the two numbers whose meaning is "what shape is this level" are overridden.
 */
const SHADOW_MAX_Z = 30;
const SHADOW_CASCADES = 2;

export interface TowerScene {
  readonly scene: Scene;
  /** Suspends (on=true) or resumes (on=false) gameplay input and camera look. The level arrives
   *  suspended and `App.svelte` resumes it once it is on screen; resuming does not restore pointer
   *  lock — see `CharacterRig.suspendInput`. */
  suspendInput(on: boolean): void;
  /** Tears this level down: its rig (DOM listeners and Havok character controller), its audio, then
   *  its scene — see `levelTeardown.ts` for why in that order. The engine outlives it and is
   *  disposed only by whoever owns it (`App.svelte`), not here. */
  dispose(): void;
}

/**
 * The climbing tower: a white column on a solid floor, with the platforms and crystals of
 * `towerLevel.ts` spiralling up its outside, and the checkpoint rule of `towerProgress.ts` running
 * over the character rig.
 *
 * Built in the order `characterRig.ts` requires and `hubScene.ts` established: environment, then
 * physics, then the crystals `createPlayer` needs, then the rig (which is what finally makes the
 * camera, and with it the shadow generator), then everything that casts a shadow, then audio.
 *
 * `onExit` fires when the player stands on the summit pedestal. It is the only way out of the tower
 * (spec §5) — the respawn rule means a player past section 1 cannot descend.
 *
 * **A build that rejects tears down what it had built.** The scene exists from the first line and
 * both awaits after it can fail — Havok, the knight's GLB — so a rejection used to reach the caller
 * with a whole scene, its Havok world, its rig and its DOM listeners alive and nothing left pointing
 * at them. The caller cannot clean that up (it never received anything), and a failed entry is
 * retryable — step off the pedestal, step back on — so it was one orphan per attempt. Owned here,
 * where the half-built pieces are; `levelTeardown.ts` has the order and why it matters.
 *
 * **For the tower that rejection is the knight's GLB, and the `catch` below is not what covers it.**
 * `loadHavok` compiles once for the page and is cached (spec §6), so by the time anyone can stand on
 * the pedestal it has already resolved from the hub's build; the GLB fetch is the only thing left
 * here that can fail. It fails *inside* `createCharacterRig`, before `parts.rig` is assigned, so
 * `disposeLevel` disposes the scene alone and it is the rig's own release that takes the six DOM
 * listeners and the Havok character controller — see `characterRig.ts` for why that has to be the
 * rig's job rather than this file's.
 */
export async function createTowerScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
  onExit: () => void,
): Promise<TowerScene> {
  const scene = new Scene(engine);
  const parts: LevelParts = {};
  try {
    return await buildTowerScene(scene, parts, canvas, onExit);
  } catch (err) {
    disposeLevel(scene, parts);
    throw err;
  }
}

/** The tower's actual construction, split off only so {@link createTowerScene} can wrap it in the
 *  teardown above without indenting the whole level inside a `try`. `parts` is filled in as the
 *  build goes, so the failure path can tear down exactly what exists. */
async function buildTowerScene(
  scene: Scene,
  parts: LevelParts,
  canvas: HTMLCanvasElement,
  onExit: () => void,
): Promise<TowerScene> {
  // Right-handed for the same reason the hub is: glTF is a right-handed format, and importing a
  // skinned character into a left-handed scene reflects it — the knight collapses when its parent yaws.
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(...SKY_RGB, 1);

  const ambient = new HemisphericLight('towerAmbient', new Vector3(0, 1, 0), scene);
  ambient.intensity = AMBIENT_INTENSITY;
  // `.clone()`, for the reason `buildTower`'s material gives and with one fact behind it that was
  // missing when this was last argued about: `ShadowLight` STORES what it is handed rather than
  // copying it (`_setDirection` / `_setPosition` are bare assignments, and `DirectionalLight`'s
  // constructor assigns `direction` straight through), and `ShadowLight.getRotation()` then
  // normalizes `direction` IN PLACE. So these module-level vectors would be the light's own, and one
  // call to `getRotation` would rescale a constant every later tower build starts from. Nothing on
  // the render path calls it today — this is latent, not live, and it is cloned because the
  // ownership is wrong rather than because a symptom was seen. The hub never had this: its
  // equivalents are constructed at the call site (`environment.ts`).
  const sun = new DirectionalLight('towerSun', SUN_DIRECTION.clone(), scene);
  sun.position = SUN_POSITION.clone();
  sun.intensity = SUN_INTENSITY;

  // The plate and the two numbers describing it are `ibl.ts`'s, shared with the hub because both
  // levels light the same knight with the same asset. The construction is this file's: see
  // `createEnvironment` for why a metallic PBR material with no environment renders near-black, and
  // for why a FAILED texture has to be dropped rather than left assigned — the knight would never be
  // drawn at all, face included.
  let iblFailed = false;
  const ibl = new HDRCubeTexture(
    IBL_URL, scene, IBL_FACE_SIZE,
    /* noMipmap */ false, /* generateHarmonics */ true, /* gammaSpace */ false,
    /* prefilterOnLoad */ true, /* onLoad */ undefined,
    /* onError */ () => {
      iblFailed = true;
      scene.environmentTexture = null;
      console.warn(`[towerScene] ${IBL_URL} failed to load — dropped so the knight's PBR materials can still render; the armour will read as dark, unlit metal until it is fixed.`);
    },
  );
  if (!iblFailed) scene.environmentTexture = ibl;
  scene.environmentIntensity = IBL_INTENSITY;

  // Physics: Havok, world gravity zero. The reasoning is `hubScene.ts`'s and is not restated — the
  // domain owns all gravity, and a second source would contradict it. The module is the hub's too:
  // one compile for the page, shared across every swap (spec §6, and `havokModule.ts` for why).
  const havok = await loadHavok();
  scene.enablePhysics(Vector3.Zero(), new HavokPlugin(true, havok));

  // Before the rig, because `createPlayer` takes the crystals — affordable only because `crystals.ts`
  // registers no shadow casters, so there is nothing here that needs a generator that does not exist.
  const crystals = createCrystals(scene, TOWER_CRYSTALS);

  const rig = await createCharacterRig(scene, {
    canvas,
    makeShadows: (camera) => towerShadows(sun, camera),
    // The tower's whole answer to "how high is the ground here": it has none. Every surface here is
    // a collider the foot probe and the support probe find for themselves, and the floor at y 0 is
    // the surface for a character at the base and for nobody on a slab 40 u above it — which is what
    // answering it anyway did, drawing the knight down on the floor at every platform edge. See
    // {@link unknownGround} for what the camera gives up along with it. What must NOT come back is
    // the hub's height field, which has no domain guard and would pin the camera at y ~ 15-18 for
    // the whole of section 1 (spec §13.2); that is why this is injected at all.
    groundHeight: unknownGround,
    // A fresh vector, never the level's own: it ends up inside `PhysicsCharacterController`, whose
    // `getPosition()` hands back its live internal one. See TOWER_SPAWN.
    spawn: toBabylon(TOWER_SPAWN),
    crystals,
    // Yes, and this is the level the term exists for: a missed platform is a 24-28 u fall the player
    // is meant to watch (spec §2, §4), and without it the knight leaves the bottom of the frame 8 u
    // in. The tower's own crystals can start a downward dash too, and here that is wanted — a dash
    // down the outside of the column is the same fall, aimed.
    descentFollow: true,
  });
  parts.rig = rig;
  const { shadows, player, follow } = rig;

  buildTower(scene, shadows);

  // Character sound, no music (spec §9). Not awaited and not async, for `hubScene`'s reason: audio
  // must never be able to hold up first render.
  const audio = createHubAudio(scene, rig.readMotion, rig.knight, { music: false });
  parts.audio = audio;

  let progress: TowerProgress = TOWER_START;
  let portal: PortalTrigger = PORTAL_START;
  scene.onBeforeRenderObservable.add(() => {
    // The capsule, never `rig.root`: `root.position.y` is the smoothed VISUAL height, and both rules
    // below would be decided from a place the character is not. See `Player.capsulePosition`.
    const here = player.capsulePosition();

    const stepped = stepTowerProgress(progress, here.y, TOWER_CHECKPOINTS, TOWER_FALL_MARGIN);
    progress = stepped.progress;
    if (stepped.respawnTo !== null) {
      const to = stepped.respawnTo;
      // Both halves, or the respawn is a swoop rather than a cut: `teleport` resets the four things
      // that hold the old position on the character's side and `snap()` drops the camera's smoothed
      // Y, which is a fifth and is not the character's to reset. Spec §13.1 measured what each of
      // them costs when it is missed. In this order and not the other: `snap()` re-seeds the camera
      // from the character's transform, and `teleport` is what moves it there.
      player.teleport(new Vector3(to.x, to.y, to.z));
      follow.snap();
      // Nothing else this frame: the portal test below would be reading `here`, which is now a
      // position the character has just left.
      return;
    }

    // Where the summit pedestal is and how wide it is stay here; what counts as standing on one is
    // `portalTrigger.ts`'s, shared with the hub. The trigger starts disarmed, so arriving on top of
    // it cannot fire it.
    const inside = standingOnPedestal({
      planarDistance: Math.hypot(here.x - TOWER_SUMMIT.x, here.z - TOWER_SUMMIT.z),
      radius: TOWER_SUMMIT_RADIUS,
      aboveStandingHeight: here.y - (TOWER_SUMMIT.y + CAPSULE_HALF),
      airborne: player.airborne,
    });
    const fired = stepPortalTrigger(portal, inside);
    portal = fired.trigger;
    if (fired.fired) onExit();
  });

  const tower: TowerScene = {
    scene,
    suspendInput: (on: boolean) => rig.suspendInput(on),
    // The same call the failure path above makes, over the same `parts` — so a finished level and a
    // half-built one cannot be torn down in two different orders. `levelTeardown.ts` says what that
    // order buys and why the scene is disposed last and the engine never.
    dispose: () => disposeLevel(scene, parts),
  };
  // Console handles. Babylon 9 keys shadow generators by camera, so the usual no-arg
  // `scene.lights.find(...).getShadowGenerator()` returns null here as it does in the hub — the
  // generator has to be handed out or it cannot be reached at all.
  exposeDevHandle(scene, 'tower', tower);
  exposeDevHandle(scene, 'shadows', shadows);
  return tower;
}

/** The hub's measured shadow generator with the tower's cascade shape — see {@link SHADOW_MAX_Z}.
 *  Handed to `createShadows` rather than set on what it returns, so which branch has these properties
 *  stays that file's business; see `ShadowShape` for what that does and does not save. */
function towerShadows(sun: DirectionalLight, camera: Camera): Shadows {
  return createShadows(sun, camera, { maxZ: SHADOW_MAX_Z, cascades: SHADOW_CASCADES });
}

/** The column, the floor, the platforms and the summit pedestal — all one white material, all static
 *  colliders, all casting and receiving. */
function buildTower(scene: Scene, shadows: Shadows): void {
  const mat = new StandardMaterial('towerWhite', scene);
  // `.clone()`, never the module-level instances: a `Color3` is more often mutated in place than
  // reassigned — `crystals.ts` does exactly that to its own material's colour for the hit flash — so
  // handing the material these would leave the tower's white reachable and writable through
  // `scene.materials`, and a level rebuilt after a swap would inherit whatever wrote to it. That is
  // PR #39's finding; `portalRing.ts` guards its emissive the same way.
  mat.diffuseColor = WHITE_DIFFUSE.clone();
  mat.specularColor = WHITE_SPECULAR.clone();
  // Picks up the hemispheric ambient, so a face turned away from the sun is shaded rather than black.
  mat.ambientColor = new Color3(1, 1, 1);

  // `material` defaults to the shared white; the column passes its own. A parameter rather than an
  // overwrite afterwards, so no mesh is ever briefly assigned a material it does not keep.
  const finish = (mesh: AbstractMesh, shape: PhysicsShapeType, material: StandardMaterial = mat) => {
    mesh.material = material;
    mesh.isPickable = false;
    new PhysicsAggregate(mesh, shape, { mass: 0 }, scene);
    shadows.cast(mesh);
    shadows.receive(mesh);
  };

  const floor = CreateCylinder(
    'towerFloor',
    { diameter: TOWER_FLOOR_RADIUS * 2, height: TOWER_SLAB_THICKNESS, tessellation: 48 },
    scene,
  );
  floor.position.set(0, TOWER_FLOOR_Y - TOWER_SLAB_THICKNESS / 2, 0);
  finish(floor, PhysicsShapeType.CYLINDER);

  // Not standable, and not made unstandable by anything but its height: the top face is 4 u above
  // the summit and there is no way onto it. It is the thing that tells you which face you are on and
  // how high you have got, and the thing you fall past (spec §2).
  const column = CreateCylinder(
    'towerColumn',
    { diameter: TOWER_COLUMN_RADIUS * 2, height: TOWER_COLUMN_HEIGHT, tessellation: 32 },
    scene,
  );
  column.position.set(0, TOWER_FLOOR_Y + TOWER_COLUMN_HEIGHT / 2, 0);
  // The column gets its own copy of the white so it can drop back-face culling, and the rest of the
  // tower does not — a floor and platforms drawn from below cost draw calls for faces nobody sees.
  //
  // **This is a mitigation, not a fix, and it must not be read as one.** The camera still enters the
  // column: `followCamera` consults exactly one piece of world geometry, the ground query, and has no
  // ray cast, no occlusion test and no pull-in (spec §13.2 parked it inside `plazaPillar_0` and it
  // was not deflected by a millimetre). At `PLATFORM_ORBIT` 4.6 against `TOWER_COLUMN_RADIUS` 3.2 and
  // the camera's `distance` 5, that happens whenever the player faces outward. Spec §14.4 measured
  // how often that is — on the layout BEFORE the platforms were moved out to clear the jump path:
  // never on the climb's own aims (the camera was 6.42-9.09 u from the axis for every step, launch
  // and chain aim the route needs), and on every frame of a fall taken facing outward (1.20-1.77 u,
  // 50 frames out of 50) — which is the one place it costs the player something, because that fall
  // is the one spec §2 says they watch. Those distances are void as numbers at the new orbit; what
  // holds is that the climb's aims look inward from further out than they did and the fall still
  // happens at the axis.
  //
  // What this changes is only what the player sees when it does: with culling on, the column
  // renders NOTHING from inside and the level is seen through it; with it off, they see
  // the column's inside surface. A wall in the way instead of the world popping out of existence.
  // The real answer is camera obstruction handling, which is a project of its own and out of scope
  // here (spec §13.3 carries it as budgeted work).
  const columnMat = mat.clone('towerColumnWhite');
  columnMat.backFaceCulling = false;
  finish(column, PhysicsShapeType.CYLINDER, columnMat);

  TOWER_PLATFORMS.forEach((platform: TowerPlatform, i: number) => {
    const slab = CreateBox(
      `towerPlatform_${i}`,
      { width: platform.width, height: TOWER_SLAB_THICKNESS, depth: platform.depth },
      scene,
    );
    // `platform.y` is the slab's TOP face — the height the player stands at, and the height every
    // rule in `towerLevel.ts` is written in — so the box is sunk by half its thickness to place it.
    slab.position.set(platform.x, platform.y - TOWER_SLAB_THICKNESS / 2, platform.z);
    // Turned to face the column, which is what makes `width` and `depth` mean what the level's rules
    // say they mean. Set BEFORE the aggregate below: `PhysicsAggregate` reads the mesh's transform to
    // place the body, so a rotation applied afterwards would leave the collider behind the ledge.
    slab.rotation.y = platform.rotationY;
    finish(slab, PhysicsShapeType.BOX);
  });

  const pedestal = CreateCylinder(
    'towerSummitPedestal',
    { diameter: TOWER_SUMMIT_RADIUS * 2, height: PEDESTAL_HEIGHT, tessellation: 24 },
    scene,
  );
  // TOWER_SUMMIT is the pedestal's TOP face, so its centre sits half a pedestal below.
  pedestal.position.set(TOWER_SUMMIT.x, TOWER_SUMMIT.y - PEDESTAL_HEIGHT / 2, TOWER_SUMMIT.z);
  finish(pedestal, PhysicsShapeType.CYLINDER);
}
