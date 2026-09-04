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
      // Gate rather than unconditionally suspending: SKIP (or a parse failure leaving no session)
      // can finish the intro before this async scene load resolves, in which case gameMode is
      // already 'playing' with no overlay left to ever call suspendInput(false) again — an
      // unconditional suspend here would soft-lock input forever. The same predicate decides the
      // music: `session === undefined` (a dialogue parse failure) means no overlay ever renders and
      // `finishIntro` never runs, so if the music scene were keyed on `gameMode.isPlaying` alone the
      // AVG theme would play over gameplay forever.
      const introRunning = session !== undefined && !gameMode.isPlaying;
      hub.suspendInput(introRunning);
      hub.audio.setMusicScene(introRunning ? 'intro' : 'playing');
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
    hub?.audio.setMusicScene('playing');
  }
</script>

<canvas bind:this={canvas} style="width:100vw;height:100vh;display:block"></canvas>
{#if session && !gameMode.isPlaying}
  <DialogueOverlay {session} onFinished={finishIntro} />
{/if}
