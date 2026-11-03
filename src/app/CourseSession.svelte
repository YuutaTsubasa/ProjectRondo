<script lang="ts">
 import UiViewport from '../presentation/layout/UiViewport.svelte';
  import {recordStageClear} from './stageRecords';
  import { onMount, untrack } from 'svelte';
  import { retainMenuPortraitAfter } from '../presentation/menu/sharedMenuPortrait';
  import { Engine } from '@babylonjs/core/Engines/engine';
  import { Vector3 } from '@babylonjs/core/Maths/math.vector';
  import { createLevelSwap } from './levelSwap';
  import { createCourseScene, type CourseScene } from '../presentation/babylon/courseScene';
  import {getCourseStage} from '../domain/course/courseStages';
  import { createCourseRun, stepCourseRun } from '../domain/course/courseProgress';
  import CourseHud from '../presentation/course/CourseHud.svelte';

  let { stageId='course', onReady, onFailure, onExit, onComplete, exitLabel = '返回主選單' }: {
    onReady: () => void; onFailure: (error: unknown) => void; onExit?: () => void;
    stageId?:string; onComplete?: () => void; exitLabel?: string;
  } = $props();
  // A mounted session owns one stage; entry changes remount it.
  const stage = untrack(() => getCourseStage(stageId));
  let canvas: HTMLCanvasElement;
  let run = $state(createCourseRun());
  let hudPlayer=$state({x:stage.spawn.x,y:stage.spawn.z});
  let hudFacing=$state({x:0,y:1});
  let defeated=$state(0), damage=$state(0);
  let status = $state<'loading' | 'playing' | 'paused' | 'finished'>('loading');
  let course: CourseScene | undefined;
  let discardNextFrame = false;

  function pause() {
    if (status !== 'playing') return;
    status = 'paused'; course?.suspendInput(true);
  }
  function resume() {
    if (status !== 'paused') return;
    // Babylon clips use wall time even while scene.render is skipped. Discard the paused gap.
    course?.scene.resetLastAnimationTimeFrame();
    discardNextFrame = true;
    status = 'playing'; course?.suspendInput(false); canvas.focus();
  }
  function restart() {
    if (!course) return;
    discardNextFrame = true;
    course.scene.resetLastAnimationTimeFrame();
    course.player.teleport(new Vector3(stage.spawn.x, stage.spawn.y, stage.spawn.z));
    course.player.motion = { ...course.player.motion, facing: { x: 0, y: 1 } };
    course.player.root.rotation.y = Math.PI;
    hudPlayer={x:stage.spawn.x,y:stage.spawn.z};hudFacing={x:0,y:1};
    course.resetCombat(true); defeated=0; damage=0;
    course.follow.snap(); run = createCourseRun(); status = 'playing';
    course.suspendInput(false); canvas.focus();
  }
  function leave() { course?.suspendInput(true); onExit?.(); }
  function keydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (event.key !== 'Escape' || event.repeat) return;
    event.preventDefault();
    if (status === 'playing') pause(); else if (status === 'paused') resume();
  }

  // Warm the results-screen portrait once this stage is up; see retainMenuPortraitAfter.
  let stageShown!: () => void;
  const shown = new Promise<void>(resolve => { stageShown = resolve; });
  onMount(() => 'WebGLRenderingContext' in window ? retainMenuPortraitAfter(shown) : undefined);
  onMount(() => {
    let live = true;
    let engine: Engine;
    try { engine = new Engine(canvas, true, { preserveDrawingBuffer: import.meta.env.DEV, stencil: true }); }
    catch (error) { onFailure(error); return; }
    const levels = createLevelSwap<CourseScene>({ disposeEngine: () => engine.dispose(), onShown: () => { canvas.tabIndex = -1; } });
    engine.runRenderLoop(() => {
      if (status !== 'playing' || !course) return;
      if (document.hidden) { pause(); return; }
      // Engine delta can still include hidden time; skip simulation and physics on this frame.
      if (discardNextFrame) { discardNextFrame = false; course.scene.resetLastAnimationTimeFrame(); return; }
      course.scene.render();
      run = {...run, health:course.combat.health};
      defeated=course.combat.defeated; damage=course.combat.damage;
      const stepped = stepCourseRun(run, {
        position: course.player.capsulePosition(), grounded: !course.player.airborne,
        dt: engine.getDeltaTime() / 1000, active: true,
      }, stage.gates, stage.killY, stage.coins);
      course.updateAudio(run,stepped.run);
      run = stepped.run;
      if (stepped.respawn) {
        course.resetCombat(false);
        const p = stepped.respawn;
        course.player.teleport(new Vector3(p.x, p.y, p.z)); course.follow.snap();
      }
      const position=course.player.capsulePosition();
      hudPlayer={x:position.x,y:position.z};hudFacing={...course.player.motion.facing};
      if (run.finished) { status = 'finished'; course.suspendInput(true); recordStageClear(stage.id,run.elapsed);onComplete?.(); }
    });
    const resize = () => engine.resize();
    const visibility = () => { if (document.hidden) pause(); };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    engine.resize();
    levels.swap(async () => {
      try { return await createCourseScene(engine, canvas, stage); }
      catch (error) { if (live) onFailure(error); throw error; }
    }, built => {
      course = built;
      // Idle may already have been evaluated during loading; its next step begins at readiness.
      course.scene.resetLastAnimationTimeFrame();
      status = 'playing';
      course.suspendInput(false);
      if (document.hidden) pause();
      onReady();
      stageShown();
    });
    canvas.tabIndex = -1;
    return () => {
      live = false; course = undefined; levels.unmount();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
    };
  });
</script>

<svelte:window onkeydown={keydown} />
<canvas bind:this={canvas} tabindex="-1" data-game-entry aria-label={`${stage.title}遊戲畫面`} style="width:100vw;height:100vh;display:block"></canvas>
<UiViewport>
{#if status !== 'loading'}
  <CourseHud {stage} {run} {status} {defeated} {damage} player={hudPlayer} facing={hudFacing} checkpointLabel={stage.gates[run.checkpoint]!.label}
    onPause={pause} onResume={resume} onRestart={restart} onExit={leave} {exitLabel} />
{/if}
</UiViewport>
