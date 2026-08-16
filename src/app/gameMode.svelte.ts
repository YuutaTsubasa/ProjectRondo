/** The hub is either playing the intro dialogue or in normal gameplay. */
export type Mode = 'intro' | 'playing';

export function createGameMode() {
  let mode = $state<Mode>('intro');
  return {
    get mode() { return mode; },
    get isPlaying() { return mode === 'playing'; },
    toPlaying() { mode = 'playing'; },
  };
}
export type GameMode = ReturnType<typeof createGameMode>;
