import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
// Side-effect: registers the StandardMaterial shader. Required with tree-shaken deep
// imports, otherwise meshes without an explicit material silently render nothing.
import '@babylonjs/core/Materials/standardMaterial';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
// Side-effect: registers Scene.prototype.enablePhysics / getPhysicsEngine (patched by
// RegisterJoinedPhysicsEngineComponent). Without this, enablePhysics is a no-op and
// PhysicsAggregate throws "No Physics Engine available".
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';

import { loadHavok } from './havokModule';
import { createCharacterRig } from './characterRig';
import type { FollowCamera } from './followCamera';
import type { Player } from './playerController';
import type { Knight } from './knight';
import { createEnvironment } from './environment';
import { createShadows } from './shadows';
import { createAtmosphere } from './postProcessing';
import { createTerrain } from './terrain';
import { terrainHeight } from './terrainHeight';
import { CAPSULE_HALF } from './capsule';
import { loadTrees } from './trees';
import { createGroundScatter } from './scatter';
import { createWind } from './wind';
import { createWater } from './water';
import { createClouds } from './clouds';
import { createLandmark, pedestalTopY, PEDESTAL_RADIUS, PLAZA_X, PLAZA_Z } from './landmark';
import { createPortalRing } from './portalRing';
import { PORTAL_HEIGHT_BAND, PORTAL_START, stepPortalTrigger, type PortalTrigger } from './portalTrigger';
import { createCrystals } from './crystals';
import { createHubAudio, type HubAudio } from '../audio/hubAudio';

/**
 * Test crystals for the homing attack, placed by hand near spawn so the move can be exercised without
 * hunting for one. A rising diagonal line plus a cluster: the line is for chaining, the cluster is for
 * checking that the camera cone actually picks between neighbours rather than grabbing the nearest.
 *
 * These are a playground, not level design. The tower spec owns real placement.
 */
const TEST_CRYSTALS = [
  { x: 0, y: 3, z: -8 },
  { x: 0, y: 5.5, z: -13 },
  { x: 0, y: 8, z: -18 },
  { x: 3, y: 4, z: -10 },
  { x: -3, y: 4, z: -10 },
] as const;

/**
 * How far from the pedestal's centre the return from the tower puts the player, in world units.
 *
 * Derived: twice {@link PEDESTAL_RADIUS}, so the player lands a whole pedestal-radius clear of its
 * edge on open ground. Spec §5 makes this the *first* line of defence against a re-entry loop —
 * `PORTAL_START` being disarmed is the second, and the two are both required, not either.
 *
 * **Untuned** all the same. The derivation fixes the safety margin, which is the part that has to be
 * right; what it cannot answer is how arriving that far out *reads* — whether the ring of light
 * ahead says "you came from there" or the pedestal is simply far enough away to look like somewhere
 * else. Nobody has stood here. Retune by eye, in the plaza, and keep it clear of the edge.
 */
const RETURN_DISTANCE = PEDESTAL_RADIUS * 2;

/**
 * How far the capsule's base starts above the ground it is spawned over. Small and positive on
 * purpose: a capsule that starts embedded pops through the one-sided MESH collider and falls out of
 * the world, so it is placed just clear and allowed to settle down onto the surface.
 *
 * **Untuned**: 0.3 u. The reasoning above fixes the sign and the order of magnitude — it must clear
 * the collider and it must not be a visible drop — but nothing measured the gap the capsule actually
 * needs, and nobody has watched a spawn settle. It is a guess inside a constraint.
 */
const SPAWN_CLEARANCE = 0.3;

/** Where a spawn goes for the capsule's base to sit `SPAWN_CLEARANCE` over the terrain at (x, z). */
function spawnOverTerrain(x: number, z: number): Vector3 {
  return new Vector3(x, terrainHeight(x, z) + CAPSULE_HALF + SPAWN_CLEARANCE, z);
}

/**
 * Where the player lands on returning from the tower: on the ground beside the pedestal, never on it
 * (spec §5, "Re-entry must not loop").
 *
 * Placed on the side of the pedestal that faces the hub's origin — the direction the player walked in
 * from — so they arrive looking back out through the colonnade at the way they came rather than at a
 * pillar, and so the ring of light is between them and the exit.
 *
 * A function returning a fresh `Vector3` rather than an exported constant, because `createPlayer`
 * hands its spawn straight to `PhysicsCharacterController`, whose `getPosition()` is documented as
 * returning its LIVE internal vector — a shared instance is exactly the kind of thing that ends up
 * being written through.
 */
export function portalReturnSpawn(): Vector3 {
  const toOrigin = Math.hypot(PLAZA_X, PLAZA_Z);
  const x = PLAZA_X + (-PLAZA_X / toOrigin) * RETURN_DISTANCE;
  const z = PLAZA_Z + (-PLAZA_Z / toOrigin) * RETURN_DISTANCE;
  return spawnOverTerrain(x, z);
}

export interface HubScene {
  readonly scene: Scene;
  readonly follow: FollowCamera;
  readonly player: Player;
  readonly knight: Knight;
  /** Music and character sound. `App.svelte` drives the music scene through this. */
  readonly audio: HubAudio;
  /** Suspends (on=true) or resumes (on=false) gameplay input and camera look, e.g. during an AVG
   *  overlay. The level arrives suspended and `App.svelte` resumes it once it is on screen; resuming
   *  does not restore pointer lock — see `CharacterRig.suspendInput`. */
  suspendInput(on: boolean): void;
  /** Tears this level down: removes its DOM listeners, disposes its scene. The engine outlives this
   *  and is disposed only by whoever owns it (`App.svelte`), not here. */
  dispose(): void;
}

/**
 * The hub level.
 *
 * `onEnterTower` fires the frame the player steps onto the colonnade's central pedestal. There is no
 * confirm key by design (spec §5): climbing onto the pedestal is already a deliberate act, and the
 * pedestal has no other purpose to conflict with.
 *
 * `spawn` defaults to the origin spawn this scene has always used, so the game's first entry is
 * unchanged; the only caller that passes one is the return from the tower, which passes
 * {@link portalReturnSpawn} to land the player *beside* the pedestal rather than on it.
 */
export async function createHubScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
  onEnterTower: () => void,
  spawn: Vector3 = spawnOverTerrain(0, 0),
): Promise<HubScene> {
  const scene = new Scene(engine);
  // Right-handed so glTF (a right-handed format) imports natively — no handedness reflection on
  // skinned characters, which otherwise collapses them to the floor when the parent yaws.
  scene.useRightHandedSystem = true;

  const { sun } = createEnvironment(scene);

  // Physics: Havok. The domain owns all gravity and the character controller is passed zero
  // gravity, so the world gravity stays zero too — no second, contradictory source of gravity.
  // (Set a real value here if/when dynamic rigid bodies are introduced.) The module comes from the
  // page-lifetime cache, not a fresh compile per level — spec §6, and `havokModule.ts` for why.
  const havok = await loadHavok();
  scene.enablePhysics(Vector3.Zero(), new HavokPlugin(true, havok));

  const crystals = createCrystals(scene, TEST_CRYSTALS);
  // The hub's answer to "how high is the ground here" — its analytic height field. The character rig
  // takes it as an argument rather than importing it, so the same rig works in a scene that has none.
  const rig = await createCharacterRig(scene, {
    canvas,
    sun,
    makeShadows: (camera) => createShadows(sun, camera),
    groundHeight: terrainHeight,
    spawn,
    crystals,
    // No: nothing the hub is *designed* around comes near the threshold — walking, running and
    // jumping were measured at 15.8 u/s against 17 — but a homing dash aimed at a crystal below the
    // player runs at `homingSpeed` 24 and would engage the term fully, on a camera tuned for this
    // level and for a move that has its own feel. The crystals above are a playground; the camera
    // they would re-tune is not. `followCamera`'s DESCENT_ENGAGE_SPEED has the arithmetic.
    descentFollow: false,
  });
  const { follow, shadows, player, knight, readMotion } = rig;
  // Babylon 9 keys shadow generators by camera, so the console's usual
  // `scene.lights.find(...).getShadowGenerator()` (no-arg) returns null. Expose a stable handle
  // instead, the same way playerController exposes moveConfig/charController.
  if (import.meta.env.DEV) (window as unknown as { shadows: unknown }).shadows = shadows;

  const terrain = createTerrain(scene);
  shadows.receive(terrain);
  createWind(scene);
  createGroundScatter(scene, shadows);
  createWater(scene);
  createClouds(scene);
  createLandmark(scene, shadows);
  // After the landmark, so the ring is drawn over ground the pedestal it encircles already stands on.
  createPortalRing(scene);

  createAtmosphere(scene, follow.camera);

  await loadTrees(scene, shadows);
  // Not awaited, and `createHubAudio` is not async: audio must never be able to hold up first render.
  // See its doc comment — a streaming music cue whose media element never fires `canplaythrough`
  // would otherwise leave this line pending for good, and with it this promise — and App.svelte's
  // `hub` assignment, which only happens once this promise resolves. The render loop in App.svelte
  // already runs by then (it starts before `createHubScene` is even called), so a hang here would
  // not stop rendering — it would just mean nothing is ever assigned to render, i.e. a blank canvas.
  // `readMotion` again, not a second function built beside it: the footsteps and the locomotion blend
  // they have to land on answer "how fast, and airborne?" from one source. Each layer's observer calls
  // it for itself, so the sample is built twice a frame — one *source*, not one sample.
  const audio = createHubAudio(scene, readMotion, knight);

  // The portal: standing on the colonnade's central pedestal enters the tower (spec §5).
  const portalY = pedestalTopY() + CAPSULE_HALF; // the capsule's CENTRE when its feet are on the top face
  let portal: PortalTrigger = PORTAL_START;
  scene.onBeforeRenderObservable.add(() => {
    // The capsule, never `rig.root`: `root.position.y` is the smoothed VISUAL height, so the height
    // half of the test below would be decided from a place the character is not. See
    // `Player.capsulePosition` — and `towerScene.ts`, which reads its summit pedestal the same way.
    const here = player.capsulePosition();
    const dx = here.x - PLAZA_X;
    const dz = here.z - PLAZA_Z;
    // The pedestal is a cylinder, so "inside" is a planar distance and a height band. Where the
    // pedestal is and how wide it is are this file's to answer; the edge rule and the band's
    // half-height are `portalTrigger.ts`'s, shared with the tower. The trigger starts disarmed,
    // which is what makes a return from the tower that lands on the pedestal safe (spec §5's second
    // line of defence; the first is that `portalReturnSpawn` does not land there in the first place).
    const inside = dx * dx + dz * dz <= PEDESTAL_RADIUS * PEDESTAL_RADIUS
      && Math.abs(here.y - portalY) <= PORTAL_HEIGHT_BAND;
    const stepped = stepPortalTrigger(portal, inside);
    portal = stepped.trigger;
    if (stepped.fired) onEnterTower();
  });

  const dispose = () => {
    rig.dispose();
    audio.dispose();
    // The scene, not the engine: the engine outlives every level (see App.svelte) and disposing it
    // here would take the WebGL context with it. `scene.dispose()` tears down this level's meshes,
    // physics, materials and observers.
    scene.dispose();
  };

  const suspendInput = (on: boolean) => rig.suspendInput(on);

  return { scene, follow, player, knight, audio, suspendInput, dispose };
}
