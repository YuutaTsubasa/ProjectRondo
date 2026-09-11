<script lang="ts">
  import { onMount } from 'svelte';
  import { Engine } from '@babylonjs/core/Engines/engine';
  import type { Scene } from '@babylonjs/core/scene';
  import { createHubScene, portalReturnSpawn, type HubScene } from '../presentation/babylon/hubScene';
  import { createTowerScene } from '../presentation/babylon/towerScene';
  import { exposeDevHandle } from '../presentation/babylon/devHandles';
  import { parse } from '../domain/dialogue/script/parser';
  import { createDialogueSession } from '../presentation/dialogue/dialogueSession.svelte';
  import DialogueOverlay from '../presentation/dialogue/DialogueOverlay.svelte';
  import { createGameMode } from './gameMode.svelte';
  import { createLevelSwap, type SwappableLevel } from './levelSwap';
  import type { SoundCue } from '../domain/audio/soundCue';
  import introSource from '../content/dialogue/intro.dlg?raw';

  /**
   * All this component needs of a level to render it: `levelSwap.ts` owns the rest of the shape, and
   * `HubScene`/`TowerScene` satisfy both structurally — deliberately not a shared interface either of
   * them implements, because spec §7 is explicit that what the two levels share is a character rig,
   * not a level framework.
   */
  type Level = SwappableLevel & { readonly scene: Scene };

  let canvas: HTMLCanvasElement;
  /** The hub, when it is the level on screen. `undefined` in the tower — the AVG's `playCue` and
   *  `finishIntro` both read it at call time and must find nothing rather than a disposed scene. */
  let hub: HubScene | undefined;
  const { graph, errors } = parse(introSource);
  if (errors.length) console.error('intro.dlg authoring errors:', errors);
  const session = graph ? createDialogueSession(graph) : undefined;
  // No session means the dialogue failed to parse, so no overlay ever renders and nothing ever calls
  // `finishIntro`. The mode has to start past the intro for that case or the game is unplayable in a
  // way nothing announces: `enterTower` and `gameMode.toTower` both refuse from 'intro', so the
  // player would walk a hub whose portal can never fire. See `createGameMode`.
  const gameMode = createGameMode(session !== undefined);

  onMount(() => {
    // preserveDrawingBuffer (dev only) lets tooling screenshot the WebGL canvas.
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: import.meta.env.DEV, stencil: true });
    // The swap machine, and with it the whole order in which one level replaces another: see
    // `levelSwap.ts`, which is where that order and its failure paths are argued and tested. What
    // stays here is what the levels ARE and what committing to one means for this app's own state.
    const levels = createLevelSwap<Level>({
      disposeEngine: () => engine.dispose(),
      onShown: () => { canvas.tabIndex = -1; },
    });
    // The one render loop for the app's lifetime: it renders whichever level is current rather than
    // closing over a particular scene, so swapping levels never has to touch the loop.
    engine.runRenderLoop(() => levels.current?.scene.render());
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
    // constructor runs synchronously inside a level build, before that build's first await -- so the
    // promise has not settled yet and the canvas is already tabbable -- the overlay mounts
    // synchronously, so the intro dialogue and its LOG button are live for the whole scene load. The
    // two resets are the `canvas.tabIndex = -1` right after the first `levels.swap` call below (the
    // synchronous half) and the `onShown` above, which covers anything babylon assigns later during
    // the async setup -- for every level build, not just the first.

    function enterTower(): void {
      // Mirrors `gameMode.toTower`'s own guard rather than trusting it: `gameMode` refuses the
      // transition, but by then this would already have disposed the hub the player is standing in.
      if (gameMode.mode !== 'hub') return;
      levels.swap(
        () => createTowerScene(engine, canvas, exitTower),
        () => {
          // The hub is gone; `playCue` and `finishIntro` both read this at call time and must find
          // nothing rather than a disposed scene. The dev console's `window.hub` clears itself on the
          // hub scene's own dispose, along with every other handle -- see `devHandles.ts`.
          hub = undefined;
          gameMode.toTower();
        },
      );
    }

    function exitTower(): void {
      if (gameMode.mode !== 'tower') return;
      levels.swap(
        // `portalReturnSpawn()` rather than the default origin spawn: the return lands the player
        // beside the colonnade's pedestal, not on it (spec §5). The rebuilt hub's trigger also starts
        // disarmed, which is the second line of defence behind this one -- both, not either.
        () => createHubScene(engine, canvas, enterTower, portalReturnSpawn()),
        (built) => {
          hub = built;
          gameMode.exitTower();
          // A fresh scene means a fresh audio graph, so the music scene has to be set again. Never
          // 'intro': the intro is long over by the time anything can reach the tower.
          built.audio.setMusicScene('playing');
          exposeDevHandle(built.scene, 'hub', built);
        },
      );
    }

    levels.swap(
      () => createHubScene(engine, canvas, enterTower),
      (built) => {
        hub = built;
        // Gate rather than unconditionally suspending: SKIP can finish the intro before this async
        // scene load resolves, in which case gameMode is already playing with no overlay left to ever
        // call suspendInput(false) again — an unconditional suspend here would soft-lock input
        // forever. A dialogue parse failure is the same state and reaches it earlier: `createGameMode`
        // is told there is no intro and starts in the hub, which is also what keeps the AVG theme from
        // playing over gameplay forever.
        const introRunning = !gameMode.isPlaying;
        built.suspendInput(introRunning);
        built.audio.setMusicScene(introRunning ? 'intro' : 'playing');
        exposeDevHandle(built.scene, 'hub', built);
      },
    );
    // The first of the two resets described above, and it has to be here: `levels.swap` calls
    // `build()` synchronously, so by this line `createHubScene` has already run its `new
    // Scene(engine)` and the canvas is already tabbable. The second is the `onShown` hook.
    canvas.tabIndex = -1;

    return () => {
      // Disposes the level on screen -- the tower's when the player is in it, where the `hub` handle
      // is undefined -- and then the engine, deferred if a build is still in flight. See
      // `levelSwap.ts`.
      levels.unmount();
      window.removeEventListener('resize', onResize);
    };
  });

  // Reads `hub` at call time rather than closing over its value, so the AVG can sound its cues as
  // soon as the audio graph is up without this component having to re-render when it is: the overlay
  // mounts before `createHubScene` resolves, and every call here happens on a keystroke or a click,
  // long after. A cue asked for before the graph exists is dropped, not queued — see `DeferredAudio`.
  const playCue = (cue: SoundCue) => hub?.audio.play(cue);

  function finishIntro() {
    gameMode.toHub();
    // Keyboard and camera back to gameplay. Mouse look needs the player's next click on the canvas:
    // the overlay's suspend released pointer lock and only a gesture can retake it (followCamera).
    hub?.suspendInput(false);
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
