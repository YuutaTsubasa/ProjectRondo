/**
 * Everything a level has to offer for the swap to be able to put it on screen and take it down
 * again. Deliberately structural and deliberately small: `HubScene` and `TowerScene` both satisfy it
 * without either of them implementing it, because spec §7 is explicit that what the two levels share
 * is a character rig, not a level framework.
 */
export interface SwappableLevel {
  suspendInput(on: boolean): void;
  dispose(): void;
}

export interface LevelSwapOptions {
  /** Tears down whatever owns the levels — the babylon `Engine`. Called by {@link LevelSwap.unmount},
   *  possibly later than it: see there. */
  readonly disposeEngine: () => void;
  /** Runs the moment a built level becomes the one on screen, before the outgoing level is disposed.
   *  `App.svelte` resets the canvas's `tabIndex` here, which babylon sets in `Scene`'s constructor on
   *  every build. */
  readonly onShown: () => void;
}

export interface LevelSwap<L extends SwappableLevel> {
  /** The level on screen, or `undefined` until the first build settles. What the render loop reads. */
  readonly current: L | undefined;
  /**
   * The build in flight, or the last one to have finished. **It never rejects** — see
   * {@link createLevelSwap} for why that is a requirement rather than an accident — so awaiting it is
   * how a caller (and a test) knows a swap is over, in either outcome.
   */
  readonly loading: Promise<unknown>;
  /** Builds `build()`'s level and, once it stands, puts it on screen and commits. Refused, silently
   *  and by design, while another swap is in flight.
   *
   *  Generic in the level being built rather than in `L`, so `commit` is handed the concrete level —
   *  a hub with its audio graph and its follow camera — rather than the render loop's narrow view of
   *  one. Committing is where the app's own state is wired to the level, and that needs all of it. */
  swap<B extends L>(build: () => Promise<B>, commit: (built: B) => void): void;
  /** The component is going away: dispose the level on screen and the engine behind it. */
  unmount(): void;
}

/**
 * The level swap, as a machine: which level is on screen, what order the next one replaces it in,
 * and when the engine underneath them both may be torn down.
 *
 * **Build the next level FIRST, and only once it is standing swap onto it, tear the old one down and
 * commit.** If the build rejects, nothing has been disposed and nothing has moved — the player is
 * still in the level they were in, control comes back, and the failure is logged (spec §9's error
 * handling as the task brief states it). The cost of that order is that both scenes — and both Havok
 * worlds — are resident for the duration of the build. Spec §6's "one scene is alive at a time" is
 * about the steady state; the alternative here is disposing the only level on screen and showing
 * nothing for the second or so it takes to reload the knight's GLB into the new scene, with no way
 * back if that reload fails.
 *
 * **BOTH levels have their input suspended for that window, at both ends.** The outgoing one is
 * suspended by {@link LevelSwap.swap}: it is still simulating — it is still the scene being rendered
 * — and without this the player would keep walking (and the hub's portal observable would keep
 * testing the pedestal) during a load they cannot see the end of. The incoming one arrives suspended
 * from `createCharacterRig` (see its doc) and is resumed on the far side of the dispose, because its
 * listeners are bound to the same window and canvas as the outgoing level's and would otherwise be
 * steering an invisible camera and banking held keys throughout the load. It is resumed BEFORE
 * `commit`, so a commit that wants the level suspended anyway — the first hub build, whose intro
 * overlay owns the keyboard — has the last word rather than being undone afterwards.
 *
 * What neither branch restores is pointer lock. `suspendInput(true)` releases it and only a user
 * gesture can take it back (`followCamera.setEnabled`), so a swap costs the player mouse look until
 * their next click on the canvas — on the way in, on the way out, and on the failure path where
 * nothing else about the level changed. Keyboard and camera control come back at once.
 *
 * **{@link LevelSwap.loading} must never reject.** {@link LevelSwap.unmount} defers
 * `disposeEngine` onto it when a build is still in flight, so a rejection there would leak the WebGL
 * context and everything the engine owns. A single `.then(onFulfilled, onRejected)` keeps the
 * *build's* rejection from ever reaching an unhandled state — a second `.then(...)` for the reject
 * side would still leave this call's derived promise to reject with no handler — and the `.catch`
 * after it covers what runs INSIDE the fulfilled handler, which is the caller's `commit` and the
 * outgoing level's teardown.
 */
export function createLevelSwap<L extends SwappableLevel>(
  { disposeEngine, onShown }: LevelSwapOptions,
): LevelSwap<L> {
  let current: L | undefined;
  let unmounted = false;
  // Flipped in both settle paths below, unconditionally, before either even looks at `unmounted`: it
  // means "the in-flight build is done touching the engine", not "it succeeded". `unmount` reads it
  // to decide whether the engine is safe to dispose yet.
  let settled = false;
  let loading: Promise<unknown> = Promise.resolve();
  let swapping = false;

  const swap = <B extends L>(build: () => Promise<B>, commit: (built: B) => void): void => {
    if (swapping) return;
    swapping = true;
    settled = false;
    const leaving = current;
    leaving?.suspendInput(true);
    loading = build()
      .then(
        (built) => {
          settled = true;
          swapping = false;
          if (unmounted) { built.dispose(); return; } // unmounted before the async load finished
          current = built;
          onShown();
          leaving?.dispose(); // only now: until this line the outgoing level was the one rendered
          built.suspendInput(false);
          commit(built);
        },
        (err: unknown) => {
          settled = true;
          swapping = false;
          // Nothing for THIS function to dispose, and that is a fact about who owns the wreckage
          // rather than about there being none. Both builders open with `new Scene(engine)` and
          // reject only after it, so a failure always orphans at least a scene — and, depending on
          // how far it got, a Havok world, a knight and a rig whose listeners are on the window.
          // Nothing here ever received a handle to any of it, so the builders tear down their own
          // partial build before rejecting (see `createTowerScene`/`createHubScene` and
          // `levelTeardown.ts`). What reaches this branch is the failure alone — Havok, the knight
          // GLB or a tree asset — and it is still worth logging rather than swallowing.
          console.error('level build failed; staying in the current level:', err);
          // Hand control back to the level the player never left. Not after unmount: `unmounted`
          // means the level has already been disposed.
          if (!unmounted) leaving?.suspendInput(false);
        },
      )
      .catch((err: unknown) => {
        console.error('level swap failed after the build succeeded:', err);
      });
  };

  const unmount = (): void => {
    unmounted = true;
    current?.dispose();
    if (settled) {
      disposeEngine();
      return;
    }
    // A level is still building its scene against this engine — awaiting Havok, the knight GLB, or
    // the trees. Disposing the engine now would tear down the WebGL context that in-flight build is
    // still constructing against, out from under it. Defer: `loading` always settles, and by the time
    // it does, either the `unmounted` guard above has already disposed the level it was handed, or
    // the build failed and disposed its own partial scene before rejecting — either way the engine is
    // the only thing left. The level that was on screen when the swap started is disposed here.
    loading.then(disposeEngine);
  };

  return {
    get current() { return current; },
    get loading() { return loading; },
    swap,
    unmount,
  };
}
