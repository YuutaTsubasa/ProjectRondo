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

  it('re-enters the tower after returning to the hub', () => {
    const m = createGameMode();
    m.toHub();
    m.toTower();
    m.exitTower();
    m.toTower();
    expect(m.mode).toBe('tower');
  });

  // A dialogue parse failure leaves `App.svelte` with no session, so no overlay renders and nothing
  // ever calls `toHub`. Starting in the intro there is a hub the portal can never fire from — a
  // playable-looking game with the tower unreachable and nothing saying so.
  it('starts in the hub when there is no intro to run, and can reach the tower', () => {
    const m = createGameMode(false);
    expect(m.mode).toBe('hub');
    expect(m.isPlaying).toBe(true);
    m.toTower();
    expect(m.mode).toBe('tower');
  });

  it('refuses to return to the hub when already in the tower', () => {
    const m = createGameMode();
    m.toHub();
    m.toTower();
    m.toHub();
    expect(m.mode).toBe('tower');
  });
});
