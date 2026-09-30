// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createInput } from '../../src/presentation/babylon/input';
let input: ReturnType<typeof createInput>;
afterEach(() => input?.dispose());
const key = (type: string, value: string, repeat = false) => window.dispatchEvent(new KeyboardEvent(type, { key: value, repeat, cancelable: true }));
it('separates edge-triggered attack and jump, including uppercase J', () => {
  input = createInput();
  key('keydown', 'J');
  expect(input.consumeAttack()).toBe(true);
  expect(input.consumeAttack()).toBe(false);
  expect(input.consumeJump()).toBe(false);
  key('keydown', 'J', true);
  expect(input.consumeAttack()).toBe(false);
  key('keydown', ' ');
  expect(input.consumeJump()).toBe(true);
  expect(input.consumeAttack()).toBe(false);
  key('keyup', 'J'); key('keydown', 'j');
  expect(input.consumeAttack()).toBe(true);
});
it.each(['disabled', 'blur', 'hidden'])('drops both queued actions on %s', reason => {
  input = createInput(); key('keydown', 'j'); key('keydown', ' ');
  if (reason === 'disabled') { input.setEnabled(false); key('keydown', 'j'); input.setEnabled(true); }
  if (reason === 'blur') window.dispatchEvent(new Event('blur'));
  if (reason === 'hidden') document.dispatchEvent(new Event('visibilitychange'));
  expect(input.consumeAttack()).toBe(false); expect(input.consumeJump()).toBe(false);
});
