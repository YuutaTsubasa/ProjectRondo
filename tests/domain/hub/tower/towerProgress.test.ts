import { describe, expect, it } from 'vitest';
import { stepTowerProgress, TOWER_START, type TowerCheckpoint } from '../../../../src/domain/hub/tower/towerProgress';
import { vec3 } from '../../../../src/domain/math/vec3';

const CHECKPOINTS: readonly TowerCheckpoint[] = [
  { activateY: 0, respawn: vec3(0, 0, 0) },
  { activateY: 18, respawn: vec3(1, 18, 1) },
  { activateY: 42, respawn: vec3(2, 42, 2) },
];
const MARGIN = 4;

describe('stepTowerProgress', () => {
  it('starts on the floor checkpoint and asks for no respawn', () => {
    const r = stepTowerProgress(TOWER_START, 0, CHECKPOINTS, MARGIN);
    expect(r.progress.active).toBe(0);
    expect(r.respawnTo).toBeNull();
  });

  it('activates the next checkpoint on the way up', () => {
    const r = stepTowerProgress(TOWER_START, 18, CHECKPOINTS, MARGIN);
    expect(r.progress.active).toBe(1);
  });

  // The rule the whole design rests on: falling must not undo progress, or a fall would
  // strand the player a section lower than the checkpoint they earned.
  it('does not deactivate a checkpoint when the player drops back below its height', () => {
    const up = stepTowerProgress(TOWER_START, 18, CHECKPOINTS, MARGIN);
    const down = stepTowerProgress(up.progress, 17, CHECKPOINTS, MARGIN);
    expect(down.progress.active).toBe(1);
  });

  it('respawns to the active checkpoint once the fall passes the margin', () => {
    const up = stepTowerProgress(TOWER_START, 18, CHECKPOINTS, MARGIN);
    const fallen = stepTowerProgress(up.progress, 18 - MARGIN - 0.01, CHECKPOINTS, MARGIN);
    expect(fallen.respawnTo).toEqual(vec3(1, 18, 1));
  });

  it('does not respawn for a drop inside the margin', () => {
    const up = stepTowerProgress(TOWER_START, 18, CHECKPOINTS, MARGIN);
    const dipped = stepTowerProgress(up.progress, 18 - MARGIN + 0.01, CHECKPOINTS, MARGIN);
    expect(dipped.respawnTo).toBeNull();
  });

  // A homing chain can cross a whole section in one dash, so one step may pass two thresholds.
  it('activates the highest checkpoint a single step passes', () => {
    const r = stepTowerProgress(TOWER_START, 50, CHECKPOINTS, MARGIN);
    expect(r.progress.active).toBe(2);
  });

  it('returns to the floor checkpoint when the player drops below the tower base', () => {
    const r = stepTowerProgress(TOWER_START, -50, CHECKPOINTS, MARGIN);
    expect(r.respawnTo).toEqual(vec3(0, 0, 0));
  });
});
