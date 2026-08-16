<script lang="ts">
  import { onMount } from 'svelte';
  import { createHubScene, type HubScene } from '../presentation/babylon/hubScene';
  import { parse } from '../domain/dialogue/script/parser';
  import { createDialogueSession } from '../presentation/dialogue/dialogueSession.svelte';
  import DialogueOverlay from '../presentation/dialogue/DialogueOverlay.svelte';
  import { createGameMode } from './gameMode.svelte';
  import introSource from '../content/dialogue/intro.dlg?raw';

  let canvas: HTMLCanvasElement;
  let hub: HubScene | undefined;
  const gameMode = createGameMode();
  const { graph, errors } = parse(introSource);
  if (errors.length) console.error('intro.dlg authoring errors:', errors);
  const session = graph ? createDialogueSession(graph) : undefined;

  onMount(() => {
    let disposed = false;
    createHubScene(canvas).then((h) => {
      if (disposed) { h.dispose(); return; } // unmounted before the async load finished
      hub = h;
      hub.suspendInput(true);                    // start in intro mode: gameplay input off
      if (import.meta.env.DEV) (window as unknown as { hub: unknown }).hub = h;
    });
    return () => {
      disposed = true;
      hub?.dispose();
    };
  });

  function finishIntro() {
    gameMode.toPlaying();
    hub?.suspendInput(false);                     // hand control back to gameplay
  }
</script>

<canvas bind:this={canvas} style="width:100vw;height:100vh;display:block"></canvas>
{#if session && !gameMode.isPlaying}
  <DialogueOverlay {session} onFinished={finishIntro} />
{/if}
