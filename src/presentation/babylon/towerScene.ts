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
import HavokPhysics from '@babylonjs/havok';

import { stepTowerProgress, TOWER_START, type TowerProgress } from '../../domain/hub/tower/towerProgress';
import { createCharacterRig, type CharacterRig } from './characterRig';
import { createCrystals } from './crystals';
import { flatGround } from './groundHeight';
import { createShadows, type Shadows } from './shadows';
import { stepPortalTrigger, PORTAL_START, type PortalTrigger } from './portalTrigger';
import { CAPSULE_HALF } from './capsule';
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
  TOWER_SUMMIT_PEDESTAL_HEIGHT,
  TOWER_SUMMIT_RADIUS,
  type TowerPlatform,
} from './towerLevel';

/**
 * The sky the white column has to read against. **Untuned**: a near-black blue, dark because spec §2
 * says the tower is white and one solid column, and a white column needs something behind it. There
 * is no skydome, no fog and no atmosphere post-process — the clear colour is the whole sky, which is
 * also where the hub's 91 % shadow cost and its terrain/tree/cloud draw calls actually go away.
 * Nobody has looked at this colour.
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

/** **Untuned**: the sun's angle only has to make the column's near face brighter than its far one,
 *  so the round shape reads; nobody has looked at where the shadows fall. */
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

/** Half-height of the band around the pedestal's standing height that counts as being on it.
 *  **Untuned**: 1.2 u, wide enough to survive the capsule's rest gap and a frame mid-step, narrow
 *  enough that passing overhead does not fire it. */
const PORTAL_HEIGHT_BAND = 1.2;

/**
 * The panorama that lights the knight's metal. Same file, same intensity as `createEnvironment` —
 * see that function for why a metallic PBR material with no environment renders near-black, and for
 * why a FAILED texture has to be dropped rather than left assigned (the knight would never be drawn
 * at all). Repeated here rather than shared because `createEnvironment` also builds a skydome, an
 * ambient tinted to a horizon colour and a sun aimed at a hub, none of which belong in a tower.
 */
const IBL_URL = '/env/studio.hdr';
const IBL_FACE_SIZE = 128;
const IBL_INTENSITY = 1.4;

/**
 * The Havok WASM module, kept across scene builds. Spec §6: the module is a genuine singleton, and
 * re-instantiating it on every tower entry would pay for a second WASM compile to get an identical
 * result. This cache is module-local, so the hub still loads its own — a cache the two scenes share
 * belongs with the routing that swaps them, not here.
 */
let havokModule: ReturnType<typeof HavokPhysics> | undefined;
const loadHavok = () => (havokModule ??= HavokPhysics());

export interface TowerScene {
  readonly scene: Scene;
  readonly rig: CharacterRig;
  /** Suspends (on=true) or resumes (on=false) gameplay input and camera look. */
  suspendInput(on: boolean): void;
  /** Tears this level down: its scene, its rig's DOM listeners, its audio. The engine outlives it
   *  and is disposed only by whoever owns it (`App.svelte`), not here. */
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
 */
export async function createTowerScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
  onExit: () => void,
): Promise<TowerScene> {
  const scene = new Scene(engine);
  // Right-handed for the same reason the hub is: glTF is a right-handed format, and importing a
  // skinned character into a left-handed scene reflects it — the knight collapses when its parent yaws.
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(...SKY_RGB, 1);

  const ambient = new HemisphericLight('towerAmbient', new Vector3(0, 1, 0), scene);
  ambient.intensity = AMBIENT_INTENSITY;
  const sun = new DirectionalLight('towerSun', SUN_DIRECTION, scene);
  sun.position = SUN_POSITION;
  sun.intensity = SUN_INTENSITY;

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
  // domain owns all gravity, and a second source would contradict it.
  const havok = await loadHavok();
  scene.enablePhysics(Vector3.Zero(), new HavokPlugin(true, havok));

  // Before the rig, because `createPlayer` takes the crystals — affordable only because `crystals.ts`
  // registers no shadow casters, so there is nothing here that needs a generator that does not exist.
  const crystals = createCrystals(scene, TOWER_CRYSTALS);

  const rig = await createCharacterRig(scene, {
    canvas,
    sun,
    makeShadows: (camera) => towerShadows(sun, camera),
    // The tower's whole answer to "how high is the ground here": one plane. It is what keeps
    // `followCamera`'s ground clamp — which has no domain guard and would otherwise still be
    // answering with the hub's height field, pinning the camera at y ~ 15-18 for the whole of
    // section 1 (spec §13.2) — reporting the floor.
    groundHeight: flatGround(TOWER_FLOOR_Y),
    spawn: TOWER_SPAWN,
    crystals,
  });
  const { shadows, player, follow } = rig;

  buildTower(scene, shadows);

  // Character sound, no music (spec §9). Not awaited and not async, for `hubScene`'s reason: audio
  // must never be able to hold up first render.
  const audio = createHubAudio(scene, rig.readMotion, rig.knight, { music: false });

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
      // them costs when it is missed.
      player.teleport(new Vector3(to.x, to.y, to.z));
      follow.snap();
      // Nothing else this frame: the portal test below would be reading `here`, which is now a
      // position the character has just left.
      return;
    }

    const dx = here.x - TOWER_SUMMIT.x;
    const dz = here.z - TOWER_SUMMIT.z;
    // The pedestal is a cylinder, so "inside" is a planar distance and a height band — the geometry
    // stays here and `stepPortalTrigger` owns only the edge (it starts disarmed, so arriving on top
    // of the trigger cannot fire it).
    const inside = dx * dx + dz * dz <= TOWER_SUMMIT_RADIUS * TOWER_SUMMIT_RADIUS
      && Math.abs(here.y - (TOWER_SUMMIT.y + CAPSULE_HALF)) <= PORTAL_HEIGHT_BAND;
    const fired = stepPortalTrigger(portal, inside);
    portal = fired.trigger;
    if (fired.fired) onExit();
  });

  const tower: TowerScene = {
    scene,
    rig,
    suspendInput: (on: boolean) => rig.suspendInput(on),
    dispose: () => {
      rig.dispose();
      audio.dispose();
      // The scene, not the engine — the engine outlives every level (see App.svelte).
      scene.dispose();
    },
  };
  // A stable handle for the console, the same way `hubScene` exposes its shadow generator: Babylon 9
  // keys shadow generators by camera, so the usual no-arg lookups return null here too.
  if (import.meta.env.DEV) (window as unknown as { tower: unknown }).tower = tower;
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
  mat.diffuseColor = WHITE_DIFFUSE;
  mat.specularColor = WHITE_SPECULAR;
  // Picks up the hemispheric ambient, so a face turned away from the sun is shaded rather than black.
  mat.ambientColor = new Color3(1, 1, 1);

  const finish = (mesh: AbstractMesh, shape: PhysicsShapeType) => {
    mesh.material = mat;
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
  finish(column, PhysicsShapeType.CYLINDER);

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
    { diameter: TOWER_SUMMIT_RADIUS * 2, height: TOWER_SUMMIT_PEDESTAL_HEIGHT, tessellation: 24 },
    scene,
  );
  // TOWER_SUMMIT is the pedestal's TOP face, so its centre sits half a pedestal below.
  pedestal.position.set(TOWER_SUMMIT.x, TOWER_SUMMIT.y - TOWER_SUMMIT_PEDESTAL_HEIGHT / 2, TOWER_SUMMIT.z);
  finish(pedestal, PhysicsShapeType.CYLINDER);
}
