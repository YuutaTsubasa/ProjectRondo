import { describe, expect, it } from 'vitest';
import { createGameMode } from '../../src/app/gameMode.svelte';

describe('createGameMode', () => {
  it('starts in the intro, which is not playing', () => {
    const m = createGameMode();
    expect(m.mode).toBe('intro');
    expect(m.isPlaying).toBe(false);
  });

  it('leaves the intro for the hub, and counts as playing from then on', () => {
    const m = createGameMode();
    m.toHub();
    expect(m.mode).toBe('hub');
    expect(m.isPlaying).toBe(true);
  });

  it('enters the tower from the hub and comes back', () => {
    const m = createGameMode();
    m.toHub();
    m.toTower();
    expect(m.mode).toBe('tower');
    expect(m.isPlaying).toBe(true);
    m.exitTower();
    expect(m.mode).toBe('hub');
  });

  // The intro owns input; a portal firing underneath it would hand the player a scene swap
  // they never asked for and cannot see.
  it('refuses to enter the tower from the intro', () => {
    const m = createGameMode();
    m.toTower();
    expect(m.mode).toBe('intro');
  });

  it('refuses to exit a tower it is not in', () => {
    const m = createGameMode();
    m.toHub();
    m.exitTower();
    expect(m.mode).toBe('hub');
  });
});
