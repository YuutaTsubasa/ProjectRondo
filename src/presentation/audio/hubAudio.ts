import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

import { createFootstepCadence, type Gait } from '../../domain/audio/footstepCadence';
import { musicChange, type MusicScene } from '../../domain/audio/musicDirector';
import { surfaceCue, type SoundCue } from '../../domain/audio/soundCue';
import { POND } from '../../domain/hub/waterBody';
import { WALK_THRESHOLD, type Knight } from '../babylon/knight';
import type { Player } from '../babylon/playerController';
import { createGameAudio } from './audioEngine';
import { loadSoundBank, type LoopHandle } from './soundBank';

export interface HubAudio {
  setMusicScene(scene: MusicScene): void;
  dispose(): void;
}

/** A clip's playback position in [0, 1), or `null` when it is not playing. */
const phaseOf = (group: AnimationGroup): number | null => {
  if (!group.isPlaying || group.animatables.length === 0) return null;
  const span = group.to - group.from;
  if (span <= 0) return null;
  const p = (group.animatables[0].masterFrame - group.from) / span;
  return ((p % 1) + 1) % 1;
};

/** How much of the pose this clip is contributing right now. Zero when it is not playing at all. */
const weightOf = (group: AnimationGroup): number =>
  group.isPlaying && group.animatables.length > 0 ? group.animatables[0].weight : 0;

/** Stands in when the audio graph could not be built at all. Every entry point is a no-op. */
const SILENT: HubAudio = { setMusicScene: () => {}, dispose: () => {} };

/**
 * Connects the scene to the audio.
 *
 * The only file that touches both, on purpose: `hubScene.ts` gains one construction and one dispose
 * call, which keeps this feature's footprint on a file another branch is also editing down to
 * something a rebase resolves on sight.
 *
 * **This can never fail the scene.** `createHubScene` awaits it, and `App.svelte` calls
 * `createHubScene(canvas).then(...)` with no `.catch` — so a rejection here would surface as an
 * unhandled rejection and a blank canvas. That is the same failure an unpulled knight GLB already
 * causes (`docs/HANDOFF.md` §3), and the reason `soundBank` tolerates missing files at all; it would
 * be absurd to be careful about one missing .ogg and then let a browser that refuses to open an
 * AudioContext take the whole game down. A failure here means a silent game, not a broken one.
 */
export async function createHubAudio(
  scene: Scene,
  camera: Camera,
  player: Player,
  knight: Knight,
): Promise<HubAudio> {
  try {
    return await buildHubAudio(scene, camera, player, knight);
  } catch (error) {
    console.warn('[audio] could not start; the game will be silent:', error);
    return SILENT;
  }
}

async function buildHubAudio(
  scene: Scene,
  camera: Camera,
  player: Player,
  knight: Knight,
): Promise<HubAudio> {
  const audio = await createGameAudio();
  const bank = await loadSoundBank(audio);

  // The listener rides the camera, not the character: what the player hears should match what the
  // player sees, and the third-person camera sits several units behind the knight.
  audio.engine.listener.attach(camera);

  const loops: LoopHandle[] = [];
  const wind = bank.startLoop('ambience.wind');
  if (wind) loops.push(wind);
  const water = bank.startLoop('ambience.water', {
    position: new Vector3(POND.centreX, POND.surfaceY, POND.centreZ),
  });
  if (water) loops.push(water);

  const cadence = createFootstepCadence();
  let wasAirborne = player.airborne;
  let music: LoopHandle | null = null;
  let playingTrack: SoundCue | null = null;

  const observer = scene.onBeforeRenderObservable.add(() => {
    const elapsed = scene.getEngine().getDeltaTime() / 1000;
    const { airborne } = player;

    // Take-off and landing ride the edges of the same `airborne` flag the jump clip uses, rather
    // than a second reading of the ground probe. `groundContact.ts` exists because two consumers
    // deciding "is it grounded" independently drifted apart; sound and pose stay on one source.
    if (airborne !== wasAirborne) bank.play(airborne ? 'jump.takeoff' : 'jump.land');
    wasAirborne = airborne;

    const v = player.motion.velocity;
    const speed = Math.hypot(v.x, v.z);
    const { walk, run } = knight.animations;
    // The clip that is actually driving the pose, by blend weight. "Run is playing at all" is not
    // the same question: the cross-fade starts the run clip the moment speed passes walking, so for
    // the whole handover it is playing while the walk pose is still what is on screen — and the two
    // clips' phases are unrelated, so reading the wrong one puts the sound anywhere in the cycle.
    const running = weightOf(run) > weightOf(walk);
    const gait: Gait = speed <= WALK_THRESHOLD ? 'idle' : running ? 'run' : 'walk';
    const phase = running ? phaseOf(run) : phaseOf(walk);
    if (phase === null) {
      cadence.step({ gait: 'idle', phase: 0, airborne, elapsed });
      return;
    }

    const fall = cadence.step({ gait, phase, airborne, elapsed });
    if (!fall) return;
    // Two layers, one footfall: the armour on the character and the surface under it.
    bank.play('footstep.armour', { playbackRate: fall.playbackRate, gain: fall.volume });
    bank.play(surfaceCue('grass'), {
      playbackRate: fall.playbackRate,
      gain: fall.volume,
      variant: fall.foot === 'left' ? 0 : 1,
    });
  });

  return {
    setMusicScene(next) {
      const change = musicChange(playingTrack, next);
      if (!change) return;
      music?.stop();
      music = bank.startLoop(change.track);
      playingTrack = music ? change.track : null;
      if (music) {
        music.setVolume(0);
        music.setVolume(1, change.fadeSeconds);
      }
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      music?.stop();
      for (const loop of loops) loop.stop();
      bank.dispose();
      audio.dispose();
    },
  };
}
