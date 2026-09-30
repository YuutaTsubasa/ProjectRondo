import { describe, expect, it } from 'vitest';
import { stepFrontDoor } from '../../src/app/frontDoor';

describe('front door', () => {
  it('requires title and menu before starting, then waits for the game to be ready', () => {
    expect(stepFrontDoor('title', 'start')).toBe('title');
    expect(stepFrontDoor('title', 'activate')).toBe('menu');
    expect(stepFrontDoor('menu', 'start')).toBe('loading');
    expect(stepFrontDoor('loading', 'start')).toBe('loading');
    expect(stepFrontDoor('loading', 'ready')).toBe('game');
    expect(stepFrontDoor('menu', 'ready')).toBe('menu');
  });
  it('returns from settings to menu and from menu to title', () => {
    expect(stepFrontDoor('menu', 'settings')).toBe('settings');
    expect(stepFrontDoor('settings', 'back')).toBe('menu');
    expect(stepFrontDoor('menu', 'back')).toBe('title');
    expect(stepFrontDoor('settings', 'start')).toBe('settings');
  });
  it('offers retry or menu recovery after a load failure without leaving a running game', () => {
    expect(stepFrontDoor('loading', 'fail')).toBe('error');
    expect(stepFrontDoor('error', 'retry')).toBe('loading');
    expect(stepFrontDoor('error', 'back')).toBe('menu');
    expect(stepFrontDoor('loading', 'back')).toBe('loading');
    expect(stepFrontDoor('game', 'back')).toBe('game');
    expect(stepFrontDoor('game', 'start')).toBe('game');
  });
});