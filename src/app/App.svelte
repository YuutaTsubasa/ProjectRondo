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
      // babylon sets tabIndex on the canvas so it can take keyboard events. This app binds all game
      // input on window (presentation/babylon/input.ts), so the canvas never needs to be a tab stop
      // -- and as a sibling of the overlay it sits outside the modals' inert wrapper, giving Tab a
      // way out of an open modal onto an element hidden behind it that paints no focus indicator.
      // Set after the engine has had its say; the markup attribute alone is overwritten.
      canvas.tabIndex = -1;
      // Gate rather than unconditionally suspending: SKIP (or a parse failure leaving no session)
      // can finish the intro before this async scene load resolves, in which case gameMode is
      // already 'playing' with no overlay left to ever call suspendInput(false) again — an
      // unconditional suspend here would soft-lock input forever.
      hub.suspendInput(session !== undefined && !gameMode.isPlaying);
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

<!-- tabindex="-1": babylon makes the canvas focusable, but all game input is bound on window
     (see presentation/babylon/input.ts), so it never needs to be a tab stop -- and as a sibling of
     the overlay it sits outside the inert wrapper, giving Tab a way out of an open modal onto an
     element that is invisible behind it and paints no focus indicator. -->
<canvas bind:this={canvas} tabindex="-1" style="width:100vw;height:100vh;display:block"></canvas>
{#if session && !gameMode.isPlaying}
  <DialogueOverlay {session} onFinished={finishIntro} />
{/if}
