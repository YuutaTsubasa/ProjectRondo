<script lang="ts">
  import { onMount } from 'svelte';
  import { createHubScene, type HubScene } from '../presentation/babylon/hubScene';
  let canvas: HTMLCanvasElement;
  onMount(() => {
    let disposed = false;
    let hub: HubScene | undefined;
    createHubScene(canvas).then((h) => {
      if (disposed) { h.dispose(); return; } // unmounted before the async load finished
      hub = h;
      if (import.meta.env.DEV) (window as unknown as { hub: unknown }).hub = h;
    });
    return () => {
      disposed = true;
      hub?.dispose();
    };
  });
</script>

<canvas bind:this={canvas} style="width:100vw;height:100vh;display:block"></canvas>
