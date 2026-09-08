<script lang="ts">
  import { onMount } from 'svelte';
  import { Engine } from '@babylonjs/core/Engines/engine';
  import type { Scene } from '@babylonjs/core/scene';
  import { createHubScene, portalReturnSpawn, type HubScene } from '../presentation/babylon/hubScene';
  import { createTowerScene } from '../presentation/babylon/towerScene';
  import { parse } from '../domain/dialogue/script/parser';
  import { createDialogueSession } from '../presentation/dialogue/dialogueSession.svelte';
  import DialogueOverlay from '../presentation/dialogue/DialogueOverlay.svelte';
  import { createGameMode } from './gameMode.svelte';
  import type { SoundCue } from '../domain/audio/soundCue';
  import introSource from '../content/dialogue/intro.dlg?raw';

  /**
   * All this component needs of a level to render it, swap it and tear it down. `HubScene` and
   * `TowerScene` both satisfy it structurally — deliberately not a shared interface either of them
   * implements, because spec §7 is explicit that what the two levels share is a character rig, not a
   * level framework. This is the router's own view of them, and it lives with the router.
   */
  type Level = { readonly scene: Scene; suspendInput(on: boolean): void; dispose(): void };

  let canvas: HTMLCanvasElement;
  /** The hub, when it is the level on screen. `undefined` in the tower — the AVG's `playCue` and
   *  `finishIntro` both read it at call time and must find nothing rather than a disposed scene. */
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
    // closing over a particular scene, so swapping levels never has to touch the loop.
    let current: Level | undefined;
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
    // constructor runs synchronously inside a level build, before that build's first await -- so the
    // promise has not settled yet and the canvas is already tabbable -- the overlay mounts
    // synchronously, so the intro dialogue and its LOG button are live for the whole scene load. The
    // two resets are the `canvas.tabIndex = -1` right after the first `swapLevel` call below (the
    // synchronous half) and the one inside `swapLevel`'s fulfilled branch, which covers anything
    // babylon assigns later during the async setup -- for every level build, not just the first.

    // `settled` flips in both branches of `swapLevel` below, unconditionally, before either even
    // looks at `disposed` -- it means "the in-flight build is done touching the engine", not "it
    // succeeded". The cleanup below reads it to decide whether the engine is safe to dispose yet;
    // see there for why that matters.
    let settled = false;
    // The build currently in flight, or the last one to have finished. Reassigned by every swap and
    // read (not captured) by the cleanup, so the cleanup always waits on the newest build. There is
    // never more than one: `swapping` refuses a second while one is running.
    let loading: Promise<unknown> = Promise.resolve();
    let swapping = false;

    /**
     * Puts a new level on screen, in the one order that cannot strand the player on a black canvas:
     * build the next level FIRST, and only once it is standing swap the render loop onto it, tear the
     * old one down and commit the mode. If the build rejects, nothing has been disposed and nothing
     * has moved -- the player is still in the level they were in, control comes back, and the failure
     * is logged (spec §9's error handling as the task brief states it).
     *
     * The cost of that order is that both scenes -- and both Havok worlds -- are resident for the
     * duration of the build. Spec §6's "one scene is alive at a time" is about the steady state; the
     * alternative here is disposing the only level on screen and showing nothing for the second or so
     * it takes to reload the knight's GLB into the new scene, with no way back if that reload fails.
     *
     * BOTH levels have their input suspended for that window, at both ends. The outgoing one is
     * suspended here: it is still simulating -- it is still the scene being rendered -- and without
     * this the player would keep walking (and the hub's portal observable would keep testing the
     * pedestal) during a load they cannot see the end of. The incoming one arrives suspended from
     * `createCharacterRig` (see its doc) and is resumed below, on the far side of the dispose,
     * because its listeners are bound to the same window and canvas as the outgoing level's and
     * would otherwise be steering an invisible camera and banking held keys throughout the load.
     *
     * What neither branch restores is pointer lock. `suspendInput(true)` releases it and only a user
     * gesture can take it back (`followCamera.setEnabled`), so a swap costs the player mouse look
     * until their next click on the canvas -- on the way in, on the way out, and on the failure path
     * where nothing else about the level changed. Keyboard and camera control come back at once.
     */
    function swapLevel<L extends Level>(build: () => Promise<L>, commit: (built: L) => void): void {
      if (swapping) return;
      swapping = true;
      settled = false;
      const leaving = current;
      leaving?.suspendInput(true);
      // A single `.then(onFulfilled, onRejected)` call, not two separate `.then`s: attaching the
      // rejection handler here, on the promise `build()` returned, is what keeps a rejection from
      // ever reaching an unhandled state. A second `.then(...)` for the reject side would still leave
      // *this* call's derived promise (the one from the fulfilled-only handler) to reject with no
      // handler of its own.
      loading = build().then(
        (built) => {
          settled = true;
          swapping = false;
          if (disposed) { built.dispose(); return; } // unmounted before the async load finished
          current = built;
          canvas.tabIndex = -1;
          // Only now: until this line the outgoing level was the one being rendered.
          leaving?.dispose();
          // After the dispose, so no two rigs are ever live on the same window at once, and BEFORE
          // `commit`, so a commit that wants the level suspended anyway -- the first hub build, whose
          // intro overlay owns the keyboard -- has the last word rather than being undone here.
          built.suspendInput(false);
          commit(built);
        },
        (err) => {
          settled = true;
          swapping = false;
          // Nothing to dispose here -- the build never got as far as handing back a scene -- but the
          // failure itself (Havok, the knight GLB, or a tree asset failing to load) is still worth
          // knowing about rather than swallowing silently.
          console.error('level build failed; staying in the current level:', err);
          // Hand control back to the level the player never left -- keyboard and camera, but not
          // pointer lock, which the suspend released and only a click can retake (see this
          // function's doc). Not on unmount: `disposed` means the cleanup below has already disposed
          // it. The half-built level's rig, if it got as far as one, is left suspended and inert.
          if (!disposed) leaving?.suspendInput(false);
        },
      );
    }

    function enterTower(): void {
      // Mirrors `gameMode.toTower`'s own guard rather than trusting it: `gameMode` refuses the
      // transition, but by then this would already have disposed the hub the player is standing in.
      if (gameMode.mode !== 'hub') return;
      swapLevel(
        () => createTowerScene(engine, canvas, exitTower),
        () => {
          // The hub is gone; `playCue` and `finishIntro` both read this at call time and must find
          // nothing rather than a disposed scene.
          hub = undefined;
          // And the dev console's handle with it: left pointing at a disposed scene it is a trap for
          // whoever next types `hub.` at a prompt while standing in the tower.
          if (import.meta.env.DEV) (window as unknown as { hub: unknown }).hub = undefined;
          gameMode.toTower();
        },
      );
    }

    function exitTower(): void {
      if (gameMode.mode !== 'tower') return;
      swapLevel(
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
          if (import.meta.env.DEV) (window as unknown as { hub: unknown }).hub = built;
        },
      );
    }

    swapLevel(
      () => createHubScene(engine, canvas, enterTower),
      (built) => {
        hub = built;
        // Gate rather than unconditionally suspending: SKIP (or a parse failure leaving no session)
        // can finish the intro before this async scene load resolves, in which case gameMode is
        // already 'playing' with no overlay left to ever call suspendInput(false) again — an
        // unconditional suspend here would soft-lock input forever. The same predicate decides the
        // music: `session === undefined` (a dialogue parse failure) means no overlay ever renders and
        // `finishIntro` never runs, so if the music scene were keyed on `gameMode.isPlaying` alone the
        // AVG theme would play over gameplay forever.
        const introRunning = session !== undefined && !gameMode.isPlaying;
        built.suspendInput(introRunning);
        built.audio.setMusicScene(introRunning ? 'intro' : 'playing');
        if (import.meta.env.DEV) (window as unknown as { hub: unknown }).hub = built;
      },
    );
    // The first of the two resets described above, and it has to be here: `swapLevel` calls `build()`
    // synchronously, so by this line `createHubScene` has already run its `new Scene(engine)` and the
    // canvas is already tabbable. The second lives in `swapLevel`'s fulfilled branch.
    canvas.tabIndex = -1;

    return () => {
      disposed = true;
      // `current`, not `hub`: the level on screen is the tower's when the player is in it, and the
      // hub handle is undefined then.
      current?.dispose();
      window.removeEventListener('resize', onResize);
      if (settled) {
        engine.dispose();
      } else {
        // A level is still building its scene against this engine -- awaiting Havok, the knight GLB,
        // or the trees. Disposing the engine now would tear down the WebGL context that in-flight
        // build is still constructing against, out from under it. Defer: `loading` always settles
        // (its rejection branch above logs rather than rethrows), and by the time it does, either the
        // `disposed` guard above has already disposed the scene it was handed, or the build failed
        // and there was never a scene to dispose -- either way, the engine is the only thing left to
        // tear down. The level that was on screen when the swap started is disposed by this cleanup.
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
