<script lang="ts">
  import { onMount } from 'svelte';
  import { createHubScene } from '../presentation/babylon/hubScene';
  let canvas: HTMLCanvasElement;
  onMount(() => {
    createHubScene(canvas).then((hub) => {
      if (import.meta.env.DEV) (window as unknown as { hub: unknown }).hub = hub;
    });
  });
</script>

<canvas bind:this={canvas} style="width:100vw;height:100vh;display:block"></canvas>
