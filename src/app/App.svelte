<script lang="ts">
  import { onMount } from 'svelte';
  import { createHubScene } from '../presentation/babylon/hubScene';
  let canvas: HTMLCanvasElement;
  onMount(() => { createHubScene(canvas); });
</script>

<canvas bind:this={canvas} style="width:100vw;height:100vh;display:block"></canvas>
