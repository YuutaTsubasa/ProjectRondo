import type { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import { COURSE_SPAWN, COURSE_PLATFORMS, COURSE_CRYSTALS } from '../../domain/course/courseLayout';
import { COURSE_MOVEMENT } from '../../domain/course/courseMovement';
import { createCharacterRig } from './characterRig';
import type { Player } from './playerController';
import type { FollowCamera } from './followCamera';
import { createCrystals } from './crystals';
import { createEnvironment } from './environment';
import { createAtmosphere } from './postProcessing';
import { createClouds } from './clouds';
import { createWind } from './wind';
import { createShadows } from './shadows';
import { createCourseScenery } from './courseScenery';
import { loadHavok } from './havokModule';
import { disposeLevel, type LevelParts } from './levelTeardown';
import { createHubAudio } from '../audio/hubAudio';
import { exposeDevHandle } from './devHandles';

export interface CourseScene {
  readonly scene: Scene;
  readonly player: Player;
  readonly follow: FollowCamera;
  /** Input and camera look start suspended; the mounted session resumes them. */
  suspendInput(on: boolean): void;
  dispose(): void;
}

/** Course progress belongs to CourseSession; this module owns only the world and its resource lifetime. */
export async function createCourseScene(engine: Engine, canvas: HTMLCanvasElement): Promise<CourseScene> {
  const scene = new Scene(engine);
  const parts: LevelParts = {};
  try {
    scene.useRightHandedSystem = true;
    const { sun } = createEnvironment(scene);
    const havok = await loadHavok();
    scene.enablePhysics(Vector3.Zero(), new HavokPlugin(true, havok));
    const scenery = createCourseScenery(scene);
    const crystals = createCrystals(scene, COURSE_CRYSTALS);
    const rig = await createCharacterRig(scene, {
      canvas,
      makeShadows: (camera) => createShadows(sun, camera, { maxZ: 65, cascades: 2 }),
      groundHeight: (x, z) => {
        const support = COURSE_PLATFORMS.find((p) => Math.abs(x - p.center.x) <= p.width / 2 && Math.abs(z - p.center.z) <= p.depth / 2);
        return support?.center.y ?? null;
      },
      spawn: new Vector3(COURSE_SPAWN.x, COURSE_SPAWN.y, COURSE_SPAWN.z),
      crystals,
      initialYaw: Math.PI,
      movement: COURSE_MOVEMENT,
      cameraFraming: { distance: 8, height: 2, initialPitch: -0.08 },
      descentFollow: true,
    });
    parts.rig = rig;
    rig.player.motion = { ...rig.player.motion, facing: { x: 0, y: 1 } };
    rig.player.root.rotation.y = Math.PI;
    rig.shadows.cast(...scenery.casters);
    rig.shadows.receive(...scenery.receivers);
    createWind(scene);
    createClouds(scene);
    createAtmosphere(scene, rig.follow.camera);
    // Keep the far arch legible while nearer landings retain the meadow's atmospheric depth.
    scene.fogDensity = 0.0045;
    const audio = createHubAudio(scene, rig.readMotion, rig.knight);
    parts.audio = audio;
    audio.setMusicScene('playing');
    let disposed = false;
    const course: CourseScene = {
      scene,
      player: rig.player,
      follow: rig.follow,
      suspendInput: (on) => { if (!disposed) rig.suspendInput(on); },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        disposeLevel(scene, parts);
      },
    };
    exposeDevHandle(scene, 'course', course);
    exposeDevHandle(scene, 'shadows', rig.shadows);
    return course;
  } catch (error) {
    // Includes failed model loads: createCharacterRig releases its own partial DOM/Havok state.
    disposeLevel(scene, parts);
    throw error;
  }
}
