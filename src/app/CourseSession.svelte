<script lang="ts">
  import { onMount } from 'svelte';
  import { Engine } from '@babylonjs/core/Engines/engine';
  import { Vector3 } from '@babylonjs/core/Maths/math.vector';
  import { createLevelSwap } from './levelSwap';
  import { createCourseScene, type CourseScene } from '../presentation/babylon/courseScene';
  import { COURSE_GATES, COURSE_KILL_Y, COURSE_SPAWN } from '../domain/course/courseLayout';
  import { createCourseRun, stepCourseRun } from '../domain/course/courseProgress';
  import CourseHud from '../presentation/course/CourseHud.svelte';

  let { onReady, onFailure, onExit }: { onReady: () => void; onFailure: (error: unknown) => void; onExit?: () => void } = $props();
  let canvas: HTMLCanvasElement;
  let run = $state(createCourseRun());
  let status = $state<'loading' | 'playing' | 'paused' | 'finished'>('loading');
  let course: CourseScene | undefined;

  function pause() {
    if (status !== 'playing') return;
    status = 'paused'; course?.suspendInput(true);
  }
  function resume() {
    if (status !== 'paused') return;
    // Babylon clips use wall time even while scene.render is skipped. Discard the paused gap.
    course?.scene.resetLastAnimationTimeFrame();
    status = 'playing'; course?.suspendInput(false); canvas.focus();
  }
  function restart() {
    if (!course) return;
    course.scene.resetLastAnimationTimeFrame();
    course.player.teleport(new Vector3(COURSE_SPAWN.x, COURSE_SPAWN.y, COURSE_SPAWN.z));
    course.player.motion = { ...course.player.motion, facing: { x: 0, y: 1 } };
    course.player.root.rotation.y = Math.PI;
    course.follow.snap(); run = createCourseRun(); status = 'playing';
    course.suspendInput(false); canvas.focus();
  }
  function leave() { course?.suspendInput(true); onExit?.(); }
  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.repeat) return;
    event.preventDefault();
    if (status === 'playing') pause(); else if (status === 'paused') resume();
  }

  onMount(() => {
    let live = true;
    let engine: Engine;
    try { engine = new Engine(canvas, true, { preserveDrawingBuffer: import.meta.env.DEV, stencil: true }); }
    catch (error) { onFailure(error); return; }
    const levels = createLevelSwap<CourseScene>({ disposeEngine: () => engine.dispose(), onShown: () => { canvas.tabIndex = -1; } });
    engine.runRenderLoop(() => {
      if (status !== 'playing' || !course) return;
      if (document.hidden) { pause(); return; }
      course.scene.render();
      const stepped = stepCourseRun(run, {
        position: course.player.capsulePosition(), grounded: !course.player.airborne,
        dt: engine.getDeltaTime() / 1000, active: true,
      }, COURSE_GATES, COURSE_KILL_Y);
      run = stepped.run;
      if (stepped.respawn) {
        const p = stepped.respawn;
        course.player.teleport(new Vector3(p.x, p.y, p.z)); course.follow.snap();
      }
      if (run.finished) { status = 'finished'; course.suspendInput(true); }
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
<canvas bind:this={canvas} tabindex="-1" data-game-entry aria-label="遺跡之路遊戲畫面" style="width:100vw;height:100vh;display:block"></canvas>
{#if status !== 'loading'}
  <CourseHud {run} {status} checkpointLabel={COURSE_GATES[run.checkpoint]!.label}
    onPause={pause} onResume={resume} onRestart={restart} onExit={leave} />
{/if}
