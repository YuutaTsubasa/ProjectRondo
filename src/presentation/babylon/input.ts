/** Keyboard input for the hub: a WASD planar axis and an edge-triggered jump. */
export interface InputState {
  /** Raw WASD axis: x = right(+)/left(-), y = forward(+)/back(-). */
  axis(): { x: number; y: number };
  /** Returns true once per jump key-press (edge-triggered, then consumed). */
  consumeJump(): boolean;
  /** Enables/disables reading input (e.g. while an AVG overlay owns focus). While disabled, the raw
   * key handlers are inert (no tracking, no preventDefault, so the overlay's own Enter/Space still
   * work), and any already-held keys/queued jump are dropped. */
  setEnabled(value: boolean): void;
  /** Removes the window/document listeners. */
  dispose(): void;
}

const isJumpKey = (k: string): boolean => k === ' ' || k === 'spacebar';
/** Keys the game consumes; their browser defaults (Space scrolls/activates focus) are suppressed. */
const GAME_KEYS = new Set(['w', 'a', 's', 'd', ' ', 'spacebar']);

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
  // (hold W, tab away, release, tab back → the character keeps walking). Drop all held state
  // whenever we lose focus or the tab is hidden.
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
