import {waitForAudioReadiness} from '../audio/audioReadiness';
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
import {createCourseAudio} from '../course/courseAudio';
import type {CourseRun} from '../../domain/course/courseProgress';
import { createHubAudio } from '../audio/hubAudio';
import { createCourseCombat, stepCourseCombat, hitCourseGuard, recoverCourseCombat, type CourseCombat } from '../../domain/course/courseCombat';
import { loadCourseGuards } from '../course/courseGuards';
import { exposeDevHandle } from './devHandles';

export interface CourseScene {
  readonly scene: Scene;
  readonly player: Player;
  readonly follow: FollowCamera;
  readonly combat: CourseCombat;
  resetCombat(full: boolean): void;
  updateAudio(before:CourseRun,after:CourseRun):void;
  /** Input and camera look start suspended; the mounted session resumes them. */
  suspendInput(on: boolean): void;
  dispose(): void;
}

/** Course progress belongs to CourseSession; this module owns only the world and its resource lifetime. */
export async function createCourseScene(engine: Engine, canvas: HTMLCanvasElement): Promise<CourseScene> {
  const scene = new Scene(engine);
  const parts: LevelParts = {};
  let guards: Awaited<ReturnType<typeof loadCourseGuards>> | undefined;
  try {
    scene.useRightHandedSystem = true;
    const { sun } = createEnvironment(scene);
    sun.intensity = 4;
    scene.getLightByName('ambient')!.intensity = .08;
    scene.environmentIntensity = .5;
    const havok = await loadHavok();
    scene.enablePhysics(Vector3.Zero(), new HavokPlugin(true, havok));
    const scenery = createCourseScenery(scene);
    const crystals = createCrystals(scene, COURSE_CRYSTALS);
    let combat = createCourseCombat();
    const stageAudio=createCourseAudio();parts.audio=stageAudio;
    // Stable indices keep a locked moving enemy and a crystal chain on the same attack path.
    const targets = {
      get positions() { return [...crystals.positions, ...combat.guards.map(g => g.phase === 'defeated'
        ? { x: g.x, y: -10000, z: g.z } : { x: g.x, y: g.y + 1, z: g.z })]; },
      flash(index: number) {
        if (index < crystals.positions.length) { crystals.flash(index);stageAudio.play('hit'); }
        else { const before=combat;combat = hitCourseGuard(combat, index - crystals.positions.length);stageAudio.updateCombat(before,combat); }
      },
    };
    const rig = await createCharacterRig(scene, {
      canvas,
      makeShadows: (camera) => createShadows(sun, camera, { maxZ: 65, cascades: 2 }),
      groundHeight: (x, z) => {
        const support = COURSE_PLATFORMS.find((p) => Math.abs(x - p.center.x) <= p.width / 2 && Math.abs(z - p.center.z) <= p.depth / 2);
        return support?.center.y ?? null;
      },
      spawn: new Vector3(COURSE_SPAWN.x, COURSE_SPAWN.y, COURSE_SPAWN.z),
      crystals: targets,
      initialYaw: Math.PI,
      movement: COURSE_MOVEMENT,
      cameraFraming: { distance: 8, height: 2, initialPitch: -0.08 },
      descentFollow: true,
    });
    parts.rig = rig;
    rig.shadows.generator.forceBackFacesOnly = true;
    rig.shadows.generator.bias = .0001;
    guards = await loadCourseGuards(scene, rig.shadows);
    guards.update(combat);
    let suspended = true, elapsed = 0;
    scene.onBeforeRenderObservable.add(() => {
      if (suspended) return;
      const dt = Math.max(0, Math.min(.05, scene.getEngine().getDeltaTime() / 1000));
      elapsed += dt; scenery.update(elapsed);
      const beforeCombat=combat;
      combat = stepCourseCombat(combat, rig.player.capsulePosition(), dt,
        rig.player.motion.homing !== null || rig.player.homingBounced);
      stageAudio.updateCombat(beforeCombat,combat);
      guards!.update(combat);
      for (const mesh of rig.player.root.getChildMeshes())
        mesh.visibility = combat.invulnerable > 0 && Math.floor(elapsed * 14) % 2 === 0 ? .42 : 1;
    });
    rig.player.motion = { ...rig.player.motion, facing: { x: 0, y: 1 } };
    rig.player.root.rotation.y = Math.PI;
    rig.shadows.cast(...scenery.casters);
    rig.shadows.receive(...scenery.receivers);
    createWind(scene);
    createClouds(scene);
    createAtmosphere(scene, rig.follow.camera);
    // Keep the far arch legible while nearer landings retain the meadow's atmospheric depth.
    scene.fogDensity = 0.0045;
    const audio = createHubAudio(scene, rig.readMotion, rig.knight, {music:false});
    parts.audio = {dispose(){stageAudio.dispose();audio.dispose();}};
    let disposed = false;
    const course: CourseScene = {
      scene,
      player: rig.player,
      follow: rig.follow,
      get combat() { return combat; },
      updateAudio(before,after){stageAudio.updateProgress(before,after);},
      resetCombat(full) { if(full)stageAudio.reset();combat = full ? createCourseCombat() : recoverCourseCombat(combat); guards!.update(combat); },
      suspendInput: (on) => { if (!disposed) { suspended = on; rig.suspendInput(on);stageAudio.pause(on); } },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        guards?.dispose();
        disposeLevel(scene, parts);
      },
    };
    exposeDevHandle(scene, 'course', course);
    exposeDevHandle(scene, 'shadows', rig.shadows);
    await waitForAudioReadiness(()=>stageAudio.prepare());
    return course;
  } catch (error) {
    // Includes failed model loads: createCharacterRig releases its own partial DOM/Havok state.
    guards?.dispose();
    disposeLevel(scene, parts);
    throw error;
  }
}
