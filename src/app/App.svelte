<script lang="ts">
  import { onMount } from 'svelte';
  import { Engine } from '@babylonjs/core/Engines/engine';
  import type { Scene } from '@babylonjs/core/scene';
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
    // preserveDrawingBuffer (dev only) lets tooling screenshot the WebGL canvas.
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: import.meta.env.DEV, stencil: true });
    // The one render loop for the app's lifetime: it renders whichever level is current rather than
    // closing over a particular scene, so swapping levels (a later task) never has to touch the loop.
    let current: { scene: Scene; dispose(): void } | undefined;
    engine.runRenderLoop(() => current?.scene.render());
    // Size the drawing buffer to the canvas now; the resize event only fires on later changes.
    engine.resize();
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    // babylon sets tabIndex on the canvas so it can take keyboard events: Scene's constructor calls
    // attachControl, which assigns engine.canvasTabIndex (default 1). This app binds all game input
    // on window (presentation/babylon/input.ts), so the canvas never needs to be a tab stop -- and
    // as a sibling of the overlay it sits outside the modals' inert wrapper, giving Tab a way out of
    // an open modal onto an element that paints no focus indicator: hidden altogether behind the
    // opaque backlog, and behind the choices visible through their 0.42 wash but not clickable.
    // A *positive* tabindex is worse still: it sorts ahead of every tabindex=0 element on the page.
    //
    // Reset twice, and both are needed. The Engine constructor above runs synchronously, and Scene's
    // constructor runs synchronously inside createHubScene, before createHubScene's first await --
    // so the promise has not settled yet and the canvas is already tabbable -- the overlay mounts
    // synchronously, so the intro dialogue and its LOG button are live for the whole scene load. The
    // second reset covers anything babylon assigns later during the async setup.
    const loadingHubScene = createHubScene(engine, canvas);
    canvas.tabIndex = -1;
    // `settled` flips in both branches below, unconditionally, before either even looks at `disposed`
    // -- it means "createHubScene is done touching the engine", not "it succeeded". The cleanup below
    // reads it to decide whether the engine is safe to dispose yet; see there for why that matters.
    let settled = false;
    // A single `.then(onFulfilled, onRejected)` call, not two separate `.then`s: attaching the
    // rejection handler here, on the promise `loadingHubScene` itself, is what keeps a rejection from
    // ever reaching an unhandled state. A second `loadingHubScene.then(...)` for the reject side would
    // still leave *this* call's derived promise (the one from the fulfilled-only handler) to reject
    // with no handler of its own.
    const loading = loadingHubScene.then(
      (h) => {
        settled = true;
        if (disposed) { h.dispose(); return; } // unmounted before the async load finished
        hub = h;
        current = h;
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
      },
      (err) => {
        settled = true;
        // Nothing to dispose here -- the build never got as far as handing back a scene -- but the
        // failure itself (Havok, the knight GLB, or a tree asset failing to load) is still worth
        // knowing about rather than swallowing silently.
        console.error('createHubScene failed:', err);
      },
    );
    return () => {
      disposed = true;
      hub?.dispose();
      window.removeEventListener('resize', onResize);
      if (settled) {
        engine.dispose();
      } else {
        // createHubScene is still building its scene against this engine -- awaiting Havok, the
        // knight GLB, or the trees. Disposing the engine now would tear down the WebGL context that
        // in-flight build is still constructing against, out from under it. Defer: `loading` always
        // settles (its rejection branch above logs rather than rethrows), and by the time it does,
        // either the `disposed` guard above has already disposed the scene it was handed, or the
        // build failed and there was never a scene to dispose -- either way, the engine is the only
        // thing left to tear down.
        loading.then(() => engine.dispose());
      }
    };
  });

  // Reads `hub` at call time rather than closing over its value, so the AVG can sound its cues as
  // soon as the audio graph is up without this component having to re-render when it is: the overlay
  // mounts before `createHubScene` resolves, and every call here happens on a keystroke or a click,
  // long after. A cue asked for before the graph exists is dropped, not queued — see `DeferredAudio`.
  const playCue = (cue: SoundCue) => hub?.audio.play(cue);

  function finishIntro() {
    gameMode.toHub();
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
