import { type Vec3 } from '../math/vec3';

/**
 * One rung of the climb. `activateY` is the height at or above which this checkpoint takes over;
 * `respawn` is where a fall returns the player to.
 */
export interface TowerCheckpoint {
  readonly activateY: number;
  readonly respawn: Vec3;
}

/**
 * The checkpoints a tower was built with, in section order. A tuple rather than an array because
 * {@link stepTowerProgress} indexes it unconditionally: an empty list has no active checkpoint to
 * fall back to, and this is the level's own list rather than anything a player can shorten, so the
 * type says so instead of a guard restating it every frame.
 */
export type TowerCheckpoints = readonly [TowerCheckpoint, ...TowerCheckpoint[]];

/** Index into the checkpoint list the tower was built with. */
export interface TowerProgress {
  readonly active: number;
}

/** Index 0 is the tower floor, which is active before the player has climbed anything. */
export const TOWER_START: TowerProgress = { active: 0 };

export interface TowerProgressResult {
  readonly progress: TowerProgress;
  /** Where to put the player this frame, or null to leave them alone. */
  readonly respawnTo: Vec3 | null;
}

/**
 * Advances the climb by one frame.
 *
 * Activation is **upward-only**: a checkpoint the player has reached stays theirs even after they
 * drop back below its height. The alternative — recomputing the active checkpoint from the current
 * height every frame — would deactivate a checkpoint during the very fall it exists to catch, and
 * put the player a section lower than the one they earned.
 *
 * `fallMargin` is how far below the active checkpoint counts as a fall rather than a step down.
 */
export function stepTowerProgress(
  progress: TowerProgress,
  y: number,
  checkpoints: TowerCheckpoints,
  fallMargin: number,
): TowerProgressResult {
  let active = progress.active;
  while (active + 1 < checkpoints.length && y >= checkpoints[active + 1].activateY) active++;

  const reached = checkpoints[active];
  const respawnTo = y < reached.activateY - fallMargin ? reached.respawn : null;
  return { progress: active === progress.active ? progress : { active }, respawnTo };
}
