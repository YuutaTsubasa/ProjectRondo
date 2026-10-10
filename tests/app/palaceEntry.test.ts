import { expect, it } from 'vitest';
import { stepFrontDoor } from '../../src/app/frontDoor';
it('enters the palace only from extras and returns after leaving', () => {
  expect(stepFrontDoor('menu', 'extras')).toBe('extras');
  expect(stepFrontDoor('extras', 'palace')).toBe('loading');
  expect(stepFrontDoor('menu', 'palace')).toBe('menu');
  expect(stepFrontDoor('title', 'palace')).toBe('title');
  expect(stepFrontDoor('game', 'palace')).toBe('game');
  expect(stepFrontDoor('game', 'leave')).toBe('menu');
});