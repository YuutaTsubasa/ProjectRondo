<script lang="ts">
  import {recordStageClear} from './stageRecords';
  import { onMount } from 'svelte';
  import { retainMenuPortrait } from '../presentation/menu/sharedMenuPortrait';
  import { Engine } from '@babylonjs/core/Engines/engine';
  import { Vector3 } from '@babylonjs/core/Maths/math.vector';
  import { createLevelSwap } from './levelSwap';
  import { createCourseScene, type CourseScene } from '../presentation/babylon/courseScene';
  import { COURSE_GATES, COURSE_KILL_Y, COURSE_SPAWN } from '../domain/course/courseLayout';
  import { createCourseRun, stepCourseRun } from '../domain/course/courseProgress';
  import CourseHud from '../presentation/course/CourseHud.svelte';

  let { onReady, onFailure, onExit, onComplete, exitLabel = '返回主選單' }: {
    onReady: () => void; onFailure: (error: unknown) => void; onExit?: () => void;
    onComplete?: () => void; exitLabel?: string;
  } = $props();
  let canvas: HTMLCanvasElement;
  let run = $state(createCourseRun());
  let hudPlayer=$state({x:COURSE_SPAWN.x,y:COURSE_SPAWN.z});
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
    course.player.teleport(new Vector3(COURSE_SPAWN.x, COURSE_SPAWN.y, COURSE_SPAWN.z));
    course.player.motion = { ...course.player.motion, facing: { x: 0, y: 1 } };
    course.player.root.rotation.y = Math.PI;
    hudPlayer={x:COURSE_SPAWN.x,y:COURSE_SPAWN.z};hudFacing={x:0,y:1};
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

  // Load the results-screen portrait while this stage loads, before its clear timer runs.
  onMount(() => 'WebGLRenderingContext' in window ? retainMenuPortrait() : undefined);
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
      }, COURSE_GATES, COURSE_KILL_Y);
      course.updateAudio(run,stepped.run);
      run = stepped.run;
      if (stepped.respawn) {
        course.resetCombat(false);
        const p = stepped.respawn;
        course.player.teleport(new Vector3(p.x, p.y, p.z)); course.follow.snap();
      }
      const position=course.player.capsulePosition();
      hudPlayer={x:position.x,y:position.z};hudFacing={...course.player.motion.facing};
      if (run.finished) { status = 'finished'; course.suspendInput(true); recordStageClear('course',run.elapsed);onComplete?.(); }
    });
    const resize = () => engine.resize();
    const visibility = () => { if (document.hidden) pause(); };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    engine.resize();
    levels.swap(async () => {
      try { return await createCourseScene(engine, canvas); }
      catch (error) { if (live) onFailure(error); throw error; }
    }, built => {
      course = built;
      // Idle may already have been evaluated during loading; its next step begins at readiness.
      course.scene.resetLastAnimationTimeFrame();
      status = 'playing';
      course.suspendInput(false);
      if (document.hidden) pause();
      onReady();
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
<canvas bind:this={canvas} tabindex="-1" data-game-entry aria-label="白宮天廊遊戲畫面" style="width:100vw;height:100vh;display:block"></canvas>
{#if status !== 'loading'}
  <CourseHud {run} {status} {defeated} {damage} player={hudPlayer} facing={hudFacing} checkpointLabel={COURSE_GATES[run.checkpoint]!.label}
    onPause={pause} onResume={resume} onRestart={restart} onExit={leave} {exitLabel} />
{/if}
