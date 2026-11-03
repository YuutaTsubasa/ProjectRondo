import {waitForAudioReadiness} from '../audio/audioReadiness';
import {createRegionObjectiveMarker} from './regionObjectiveMarker';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import { REGION_SPAWN, isRegionGrounded, isRegionPositionSafe, regionHeight, regionLocation } from '../../domain/region/regionLayout';
import { regionMusicScene } from '../../domain/region/regionMusic';
import { createCharacterRig } from '../babylon/characterRig';
import type { Player } from '../babylon/playerController';
import type { FollowCamera } from '../babylon/followCamera';
import { createCrystals } from '../babylon/crystals';
import { createEnvironment } from '../babylon/environment';
import { createAtmosphere } from '../babylon/postProcessing';
import { createClouds } from '../babylon/clouds';
import { createWind } from '../babylon/wind';
import { createShadows } from '../babylon/shadows';
import { loadHavok } from '../babylon/havokModule';
import { disposeLevel, type LevelParts } from '../babylon/levelTeardown';
import { exposeDevHandle } from '../babylon/devHandles';
import { createHubAudio, type HubAudio } from '../audio/hubAudio';
import { createTownAssets } from '../town/townAssets';
import { createTownScenery } from '../town/townScenery';
import { createParlorFrontage } from '../town/parlorFrontage';
import { createParlorInterior } from '../parlor/parlorInterior';
import { inParlor, PARLOR_NAME } from '../../domain/town/mahjongParlor';
import { townCameraPosition } from '../town/townCamera';
import { createRegionTerrain } from './regionTerrain';
import { createRegionScenery } from './regionScenery';

export interface RegionScene {
  readonly scene: Scene;
  readonly player: Player;
  readonly follow: FollowCamera;
  readonly audio: HubAudio;
  suspendInput(on: boolean): void;
  reset(): void;
  /** Moves the player within this world (for example through the parlor door) and snaps the camera behind them. */
  teleport(point: { x: number; y: number; z: number }, facing: { x: number; z: number }): void;
  getLocationLabel(): string;
  setWaterRestored(on: boolean): void;
  setObjective(id: string | null): void;
  dispose(): void;
}

/** A single physics world connects town, meadow, ridgeline and coast. The session owns expeditions. */
export async function createRegionScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
  spawn: { x: number; y: number; z: number } = REGION_SPAWN,
  /** World X/Z direction the player faces on arrival; the camera starts behind it. Defaults to south. */
  facing: { x: number; z: number } = { x: 0, z: -1 },
): Promise<RegionScene> {
  const scene = new Scene(engine), parts: LevelParts = {};
  try {
    scene.useRightHandedSystem = true;
    const { sun } = createEnvironment(scene);
    sun.intensity = 2.5;
    scene.getLightByName('ambient')!.intensity = .38;
    scene.enablePhysics(Vector3.Zero(), new HavokPlugin(true, await loadHavok()));
    const assets = await createTownAssets(scene);
    const town = createTownScenery(scene, assets, { southExitWidth: 12, backdrop: false, sea: false });
    const parlorFrontage = await createParlorFrontage(scene);
    const parlor = await createParlorInterior(scene);
    const terrain = createRegionTerrain(scene);
    createWind(scene);
    const scenery = createRegionScenery(scene);
    const objectiveMarker = createRegionObjectiveMarker(scene);
    const initial = isRegionPositionSafe(spawn) ? spawn : REGION_SPAWN;
    const arrival = initial === spawn ? facing : { x: 0, z: -1 }, arrivalYaw = Math.atan2(-arrival.x, -arrival.z);
    const rig = await createCharacterRig(scene, {
      canvas,
      makeShadows: camera => createShadows(sun, camera, { maxZ: 105, cascades: 3 }),
      groundHeight: (x, z) => isRegionPositionSafe({ x, y: 1, z }) ? regionHeight(x, z) : inParlor({ x, y: 1.2, z }) ? 0 : null,
      spawn: new Vector3(initial.x, initial.y, initial.z),
      crystals: createCrystals(scene, []),
      initialYaw: arrivalYaw,
      interact: true,
      cameraFraming: { distance: 7.5, height: 1.8, initialPitch: -.035 },
      descentFollow: false,
    });
    parts.rig = rig;
    rig.player.motion = { ...rig.player.motion, facing: { x: arrival.x, y: arrival.z } };
    rig.player.root.rotation.y = arrivalYaw;
    const buildings = assets.flatMap(asset => asset.meshes);
    rig.shadows.cast(...town.casters, ...scenery.casters, ...parlorFrontage.casters, ...parlor.casters, ...buildings);
    rig.shadows.receive(terrain.ground, ...town.receivers, ...scenery.receivers, ...parlor.receivers, ...buildings);
    createClouds(scene);
    createAtmosphere(scene, rig.follow.camera);
    scene.fogDensity = .0016;
    const audio = createHubAudio(scene, rig.readMotion, rig.knight, {musicCues:['music.town','music.meadow']});
    parts.audio = audio;
    let musicScene = regionMusicScene(initial.z);
    audio.setMusicScene(musicScene);
    const cameraSolids = [...town.cameraSolids, ...scenery.cameraSolids, ...parlor.cameraSolids];
    let disposed = false;
    const teleport = (point: { x: number; y: number; z: number }, facing: { x: number; z: number }) => {
      if (disposed) return;
      rig.player.teleport(new Vector3(point.x, point.y, point.z));
      rig.player.motion = { ...rig.player.motion, facing: { x: facing.x, y: facing.z } };
      const yaw = Math.atan2(-facing.x, -facing.z);
      rig.player.root.rotation.y = yaw;
      rig.follow.snap(yaw); scene.resetLastAnimationTimeFrame();
    };
    const reset = () => teleport(REGION_SPAWN, { x: 0, z: -1 });
    /** A fall off a ledge, railing or sill returns here, not to the distant gate. */
    let lastGround = { x: initial.x, z: initial.z };
    const recover = () => {
      const { facing } = rig.player.motion;
      teleport({ ...lastGround, y: regionHeight(lastGround.x, lastGround.z) + 1.3 }, { x: facing.x, z: facing.y });
    };
    let seconds = 0;
    scene.onBeforeRenderObservable.add(() => {
      const position = rig.player.capsulePosition();
      if (isRegionGrounded(position)) lastGround = { x: position.x, z: position.z };
      else if (!isRegionPositionSafe(position) && !inParlor(position)) recover();
      seconds += Math.min(.05, engine.getDeltaTime() / 1000);
      parlor.update(seconds, rig.player.root.position.add(new Vector3(0, 1.6, 0)));
      const nextMusicScene = regionMusicScene(rig.player.root.position.z, musicScene);
      if (nextMusicScene !== musicScene) {
        musicScene = nextMusicScene;
        audio.setMusicScene(musicScene);
      }
      const camera = rig.follow.camera, target = camera.getTarget();
      camera.position.copyFrom(townCameraPosition(target, camera.position, cameraSolids));
      camera.setTarget(target);
    });
    const region: RegionScene = {
      scene, player: rig.player, follow: rig.follow, audio, reset, teleport,
      getLocationLabel: () => inParlor(rig.player.root.position) ? `${PARLOR_NAME} · MAHJONG PARLOR` : regionLocation(rig.player.root.position.x, rig.player.root.position.z),
      suspendInput: on => { if (!disposed) rig.suspendInput(on); },
      setObjective: id => { if (!disposed) objectiveMarker.setTarget(id); },
      setWaterRestored: on => { if (!disposed) scenery.setWaterRestored(on); },
      dispose: () => { if (disposed) return; disposed = true; disposeLevel(scene, parts); },
    };
    exposeDevHandle(scene, 'region', region); exposeDevHandle(scene, 'regionAssets', assets);
    exposeDevHandle(scene, 'shadows', rig.shadows);
    await waitForAudioReadiness(()=>audio.whenReady());
    return region;
  } catch (error) { disposeLevel(scene, parts); throw error; }
}
