/**
 * Where the game is. `intro` is the opening dialogue, which owns input; `hub` and `tower` are the
 * two scenes, and the player moves between them through the colonnade's portal.
 */
export type Mode = 'intro' | 'hub' | 'tower';

/**
 * Reactive top-level mode. The transitions are guarded rather than free-form: entering the tower
 * from `intro` would swap the scene out from under a dialogue that owns input and cannot be seen
 * past, and exiting a tower the player is not in would dispose the scene they are standing in.
 * Both are refused here rather than by every caller remembering to check.
 *
 * `intro` false starts the game in the hub instead, and is not a convenience: the opening dialogue
 * is what calls `toHub`, so a run with no dialogue to show — `intro.dlg` failing to parse, which
 * leaves `App.svelte` with no session and therefore no overlay — would otherwise sit in `intro`
 * forever. Nothing about that state looks broken from inside the hub; it is `toTower`'s guard above
 * that never lifts, so the portal silently cannot fire and the tower is unreachable for the session.
 */
export function createGameMode(intro = true) {
  let mode = $state<Mode>(intro ? 'intro' : 'hub');
  return {
    get mode() { return mode; },
    /** True once the intro is over — what `App.svelte` keys the dialogue overlay off. */
    get isPlaying() { return mode !== 'intro'; },
    toHub() { if (mode === 'intro') mode = 'hub'; },
    toTower() { if (mode === 'hub') mode = 'tower'; },
    exitTower() { if (mode === 'tower') mode = 'hub'; },
  };
}
export type GameMode = ReturnType<typeof createGameMode>;
