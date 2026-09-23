import { expect, it } from 'vitest';
import { stepFrontDoor } from '../../src/app/frontDoor';
it('enters the palace only from the menu and returns after leaving', () => {
  expect(stepFrontDoor('menu', 'palace')).toBe('loading');
  expect(stepFrontDoor('title', 'palace')).toBe('title');
  expect(stepFrontDoor('game', 'palace')).toBe('game');
  expect(stepFrontDoor('game', 'leave')).toBe('menu');
});