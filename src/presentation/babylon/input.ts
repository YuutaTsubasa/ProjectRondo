/** Keyboard input for whichever level is on screen: `characterRig` builds one per rig, and both
 *  the hub and the tower are built through it. A WASD planar axis, a held walk modifier, an
 *  edge-triggered jump.
 *  The character runs by default; holding the modifier walks instead. */
export interface InputState {
  /** Raw WASD axis: x = right(+)/left(-), y = forward(+)/back(-). */
  axis(): { x: number; y: number };
  /** Returns true once per jump key-press (edge-triggered, then consumed). */
  consumeJump(): boolean;
  /** True while a Shift key is held, asking the character to walk instead of its default run. A
   *  modifier is a state, so it is polled rather than consumed. */
  isWalkHeld(): boolean;
  /** Enables/disables reading input (e.g. while an AVG overlay owns focus). While disabled, the raw
   * key handlers are inert (no tracking, no preventDefault, so the overlay's own Enter/Space still
   * work), and any already-held keys/queued jump are dropped. */
  setEnabled(value: boolean): void;
  /** Removes the window/document listeners. */
  dispose(): void;
}

const isJumpKey = (k: string): boolean => k === ' ' || k === 'spacebar';
// Both Shift keys report the same `key` value, so one entry covers left and right.
const WALK_KEY = 'shift';
/** Keys the game consumes; their browser defaults (Space scrolls/activates focus) are suppressed. */
const GAME_KEYS = new Set(['w', 'a', 's', 'd', ' ', 'spacebar', WALK_KEY]);

export function createInput(): InputState {
  const down = new Set<string>();
  let jumpQueued = false;
  let enabled = true;

  const onKeyDown = (e: KeyboardEvent) => {
    if (!enabled) return; // inert while suspended: no tracking, no preventDefault (overlay owns the key)
    const k = e.key.toLowerCase();
    if (GAME_KEYS.has(k)) e.preventDefault();
    if (!down.has(k) && isJumpKey(k)) jumpQueued = true;
    down.add(k);
  };
  const onKeyUp = (e: KeyboardEvent) => { if (!enabled) return; down.delete(e.key.toLowerCase()); };
  // A key released while the window is unfocused never delivers keyup here, leaving it "stuck" down
  // (hold W, tab away, release, tab back → the character keeps running, which is what it does with
  // nothing held). A stuck Shift is the same failure in the other direction: the character walks
  // until something clears it. Drop all held state whenever we lose focus or the tab is hidden.
  const clear = () => { down.clear(); jumpQueued = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);

  return {
    axis: () => enabled
      ? {
          x: (down.has('d') ? 1 : 0) - (down.has('a') ? 1 : 0),
          y: (down.has('w') ? 1 : 0) - (down.has('s') ? 1 : 0),
        }
      : { x: 0, y: 0 },
    isWalkHeld: () => enabled && down.has(WALK_KEY),
    consumeJump: () => {
      if (!enabled) { jumpQueued = false; return false; }
      const j = jumpQueued;
      jumpQueued = false;
      return j;
    },
    setEnabled: (value: boolean) => { enabled = value; if (!value) { down.clear(); jumpQueued = false; } },
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    },
  };
}
