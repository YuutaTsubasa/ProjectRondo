import {waitForAudioReadiness} from '../audio/audioReadiness';
import {createRegionObjectiveMarker} from './regionObjectiveMarker';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import { REGION_SPAWN, isRegionPositionSafe, regionHeight, regionLocation } from '../../domain/region/regionLayout';
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
    const terrain = createRegionTerrain(scene);
    createWind(scene);
    const scenery = createRegionScenery(scene);
    const objectiveMarker = createRegionObjectiveMarker(scene);
    const initial = isRegionPositionSafe(spawn) ? spawn : REGION_SPAWN;
    const rig = await createCharacterRig(scene, {
      canvas,
      makeShadows: camera => createShadows(sun, camera, { maxZ: 105, cascades: 3 }),
      groundHeight: (x, z) => isRegionPositionSafe({ x, y: 1, z }) ? regionHeight(x, z) : null,
      spawn: new Vector3(initial.x, initial.y, initial.z),
      crystals: createCrystals(scene, []),
      initialYaw: 0,
      interact: true,
      cameraFraming: { distance: 7.5, height: 1.8, initialPitch: -.035 },
      descentFollow: false,
    });
    parts.rig = rig;
    rig.player.motion = { ...rig.player.motion, facing: { x: 0, y: -1 } };
    rig.player.root.rotation.y = 0;
    const buildings = assets.flatMap(asset => asset.meshes);
    rig.shadows.cast(...town.casters, ...scenery.casters, ...buildings);
    rig.shadows.receive(terrain.ground, ...town.receivers, ...scenery.receivers, ...buildings);
    createClouds(scene);
    createAtmosphere(scene, rig.follow.camera);
    scene.fogDensity = .0028;
    const audio = createHubAudio(scene, rig.readMotion, rig.knight, {musicCues:['music.town','music.meadow']});
    parts.audio = audio;
    let musicScene = regionMusicScene(initial.z);
    audio.setMusicScene(musicScene);
    const cameraSolids = [...town.cameraSolids, ...scenery.cameraSolids];
    let disposed = false;
    const reset = () => {
      if (disposed) return;
      rig.player.teleport(new Vector3(REGION_SPAWN.x, REGION_SPAWN.y, REGION_SPAWN.z));
      rig.player.motion = { ...rig.player.motion, facing: { x: 0, y: -1 } };
      rig.player.root.rotation.y = 0; rig.follow.snap(); scene.resetLastAnimationTimeFrame();
    };
    scene.onBeforeRenderObservable.add(() => {
      if (!isRegionPositionSafe(rig.player.capsulePosition())) reset();
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
      scene, player: rig.player, follow: rig.follow, audio, reset,
      getLocationLabel: () => regionLocation(rig.player.root.position.x, rig.player.root.position.z),
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
