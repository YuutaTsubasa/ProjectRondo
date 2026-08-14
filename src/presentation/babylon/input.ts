/** Keyboard input for the hub: a WASD planar axis and an edge-triggered jump. */
export interface InputState {
  /** Raw WASD axis: x = right(+)/left(-), y = forward(+)/back(-). */
  axis(): { x: number; y: number };
  /** Returns true once per jump key-press (edge-triggered, then consumed). */
  consumeJump(): boolean;
}

const isJumpKey = (k: string): boolean => k === ' ' || k === 'spacebar';

export function createInput(): InputState {
  const down = new Set<string>();
  let jumpQueued = false;

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!down.has(k) && isJumpKey(k)) jumpQueued = true;
    down.add(k);
  });
  window.addEventListener('keyup', (e) => down.delete(e.key.toLowerCase()));

  return {
    axis: () => ({
      x: (down.has('d') ? 1 : 0) - (down.has('a') ? 1 : 0),
      y: (down.has('w') ? 1 : 0) - (down.has('s') ? 1 : 0),
    }),
    consumeJump: () => {
      const j = jumpQueued;
      jumpQueued = false;
      return j;
    },
  };
}
