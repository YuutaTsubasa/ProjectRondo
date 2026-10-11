<script lang="ts">
 import UiViewport from '../presentation/layout/UiViewport.svelte';
  import { onMount } from 'svelte';
  import { Engine } from '@babylonjs/core/Engines/engine';
  import { createLevelSwap } from './levelSwap';
  import { createTownScene, type TownScene } from '../presentation/town/townScene';
  import TownHud from '../presentation/town/TownHud.svelte';

  let { onReady, onFailure, onExit }: { onReady: () => void; onFailure: (error: unknown) => void; onExit?: () => void } = $props();
  let canvas: HTMLCanvasElement;
  let status = $state<'loading' | 'playing' | 'paused'>('loading');
  let locationLabel = $state('');
  let town: TownScene | undefined;
  let discardNextFrame = false;

  function pause() {
    if (status !== 'playing') return;
    status = 'paused';
    town?.suspendInput(true);
  }
  function resume() {
    if (status !== 'paused' || document.hidden) return;
    town?.scene.resetLastAnimationTimeFrame();
    discardNextFrame = true;
    status = 'playing';
    town?.suspendInput(false);
    canvas.focus();
  }
  function reset() {
    if (!town) return;
    town.reset();
    locationLabel = town.getLocationLabel();
    town.scene.resetLastAnimationTimeFrame();
    discardNextFrame = true;
    status = document.hidden ? 'paused' : 'playing';
    town.suspendInput(status === 'paused');
    if (status === 'playing') canvas.focus();
  }
  function leave() { town?.suspendInput(true); onExit?.(); }
  function keydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (event.key !== 'Escape' || event.repeat) return;
    event.preventDefault();
    if (status === 'playing') pause(); else if (status === 'paused') resume();
  }

  onMount(() => {
    let live = true;
    let engine: Engine;
    try { engine = new Engine(canvas, true, { preserveDrawingBuffer: import.meta.env.DEV, stencil: true }); }
    catch (error) { onFailure(error); return; }
    const levels = createLevelSwap<TownScene>({ disposeEngine: () => engine.dispose(), onShown: () => { canvas.tabIndex = -1; } });
    engine.runRenderLoop(() => {
      if (status !== 'playing' || !town) return;
      if (document.hidden) { pause(); return; }
      // Engine delta and Babylon animation time can both include the paused gap.
      if (discardNextFrame) { discardNextFrame = false; town.scene.resetLastAnimationTimeFrame(); return; }
      town.scene.render();
      locationLabel = town.getLocationLabel();
    });
    const resize = () => engine.resize();
    const visibility = () => { if (document.hidden) pause(); };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    engine.resize();
    levels.swap(async () => {
      try { return await createTownScene(engine, canvas); }
      catch (error) { if (live) onFailure(error); throw error; }
    }, built => {
      town = built;
      town.scene.resetLastAnimationTimeFrame();
      locationLabel = town.getLocationLabel();
      status = 'playing';
      if (document.hidden) pause(); else canvas.focus();
      onReady();
    });
    canvas.tabIndex = -1;
    return () => {
      live = false;
      town = undefined;
      levels.unmount();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
    };
  });
</script>

<svelte:window onkeydown={keydown} />
<canvas bind:this={canvas} tabindex="-1" data-game-entry aria-label="白色王城遊戲畫面" style="width:100vw;height:100vh;display:block"></canvas>
<UiViewport>
{#if status !== 'loading'}
  <TownHud {status} {locationLabel} onPause={pause} onResume={resume} onReset={reset} onExit={leave} />
{/if}
</UiViewport>
