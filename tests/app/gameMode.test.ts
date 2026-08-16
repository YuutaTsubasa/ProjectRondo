import { describe, it, expect } from 'vitest';
import { createGameMode } from '../../src/app/gameMode.svelte';

describe('createGameMode', () => {
  it('starts in intro mode', () => {
    const gameMode = createGameMode();
    expect(gameMode.mode).toBe('intro');
    expect(gameMode.isPlaying).toBe(false);
  });

  it('switches to playing mode on toPlaying()', () => {
    const gameMode = createGameMode();
    gameMode.toPlaying();
    expect(gameMode.mode).toBe('playing');
    expect(gameMode.isPlaying).toBe(true);
  });

  it('toPlaying() is idempotent', () => {
    const gameMode = createGameMode();
    gameMode.toPlaying();
    gameMode.toPlaying();
    expect(gameMode.mode).toBe('playing');
    expect(gameMode.isPlaying).toBe(true);
  });
});
