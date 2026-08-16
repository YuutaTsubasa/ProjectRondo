/** The hub is either playing the intro dialogue or in normal gameplay. */
export type Mode = 'intro' | 'playing';

/**
 * Reactive top-level mode gate. Starts in `intro` (the opening dialogue owns input); once the
 * dialogue ends or is skipped, `toPlaying()` flips to `playing` (one-way) and gameplay resumes.
 */
export function createGameMode() {
  let mode = $state<Mode>('intro');
  return {
    get mode() { return mode; },
    get isPlaying() { return mode === 'playing'; },
    toPlaying() { mode = 'playing'; },
  };
}
export type GameMode = ReturnType<typeof createGameMode>;
