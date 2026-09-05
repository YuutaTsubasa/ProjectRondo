<script lang="ts">
  import { onMount } from 'svelte';
  import { createHubScene, type HubScene } from '../presentation/babylon/hubScene';
  import { parse } from '../domain/dialogue/script/parser';
  import { createDialogueSession } from '../presentation/dialogue/dialogueSession.svelte';
  import DialogueOverlay from '../presentation/dialogue/DialogueOverlay.svelte';
  import { createGameMode } from './gameMode.svelte';
  import type { SoundCue } from '../domain/audio/soundCue';
  import introSource from '../content/dialogue/intro.dlg?raw';

  let canvas: HTMLCanvasElement;
  let hub: HubScene | undefined;
  const gameMode = createGameMode();
  const { graph, errors } = parse(introSource);
  if (errors.length) console.error('intro.dlg authoring errors:', errors);
  const session = graph ? createDialogueSession(graph) : undefined;

  onMount(() => {
    let disposed = false;
    // babylon sets tabIndex on the canvas so it can take keyboard events: Scene's constructor calls
    // attachControl, which assigns engine.canvasTabIndex (default 1). This app binds all game input
    // on window (presentation/babylon/input.ts), so the canvas never needs to be a tab stop -- and
    // as a sibling of the overlay it sits outside the modals' inert wrapper, giving Tab a way out of
    // an open modal onto an element that paints no focus indicator: hidden altogether behind the
    // opaque backlog, and behind the choices visible through their 0.42 wash but not clickable.
    // A *positive* tabindex is worse still: it sorts ahead of every tabindex=0 element on the page.
    //
    // Reset twice, and both are needed. The Scene constructor runs synchronously before
    // createHubScene's first await, so the promise has not settled yet and the canvas is already
    // tabbable -- the overlay mounts synchronously, so the intro dialogue and its LOG button are
    // live for the whole scene load. The second reset covers anything babylon assigns later during
    // the async setup.
    const loading = createHubScene(canvas);
    canvas.tabIndex = -1;
    loading.then((h) => {
      if (disposed) { h.dispose(); return; } // unmounted before the async load finished
      hub = h;
      canvas.tabIndex = -1;
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

  // Reads `hub` at call time rather than closing over its value, so the AVG can sound its cues as
  // soon as the audio graph is up without this component having to re-render when it is: the overlay
  // mounts before `createHubScene` resolves, and every call here happens on a keystroke or a click,
  // long after. A cue asked for before the graph exists is dropped, not queued — see `DeferredAudio`.
  const playCue = (cue: SoundCue) => hub?.audio.play(cue);

  function finishIntro() {
    gameMode.toPlaying();
    hub?.suspendInput(false);                     // hand control back to gameplay
    hub?.audio.setMusicScene('playing');
  }
</script>

<!-- tabindex="-1": babylon makes the canvas focusable, but all game input is bound on window
     (see presentation/babylon/input.ts), so it never needs to be a tab stop -- and as a sibling of
     the overlay it sits outside the inert wrapper, giving Tab a way out of an open modal onto an
     element that paints no focus indicator -- unseen behind the opaque backlog, and seen through the
     choices' wash but not usable. -->
<canvas bind:this={canvas} tabindex="-1" style="width:100vw;height:100vh;display:block"></canvas>
{#if session && !gameMode.isPlaying}
  <DialogueOverlay {session} {playCue} onFinished={finishIntro} />
{/if}
