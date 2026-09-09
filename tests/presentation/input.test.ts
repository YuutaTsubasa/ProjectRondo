// @vitest-environment jsdom
//
// vite.config.ts pins environment: 'node' for the suite; this file opts itself into jsdom because
// `createInput` binds real `window`/`document` listeners rather than exposing anything pure.
//
// The rule under test: the character runs by default and Shift walks (inverted from the naive
// "Shift sprints" mapping, per the project owner's post-playtest call on the climbing tower —
// jumping between platforms needs speed, so holding Shift just to move at a normal pace was
// tiring). `MovementInput.runRequested` still means "run this frame" on the domain side; this
// file only pins what the presentation layer reports before that boolean is even built.
import { describe, expect, it, afterEach } from 'vitest';
import { createInput } from '../../src/presentation/babylon/input';

const press = (key: string) => window.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
const release = (key: string) => window.dispatchEvent(new window.KeyboardEvent('keyup', { key, bubbles: true }));

describe('createInput — run/walk modifier', () => {
  let input: ReturnType<typeof createInput> | undefined;

  afterEach(() => {
    input?.dispose();
    input = undefined;
  });

  it('reports running with no key held', () => {
    input = createInput();
    expect(input.isWalkHeld()).toBe(false);
  });

  it('reports walking while Shift is held', () => {
    input = createInput();
    press('Shift');
    expect(input.isWalkHeld()).toBe(true);

    release('Shift');
    expect(input.isWalkHeld()).toBe(false);
  });

  it('falls back to the safe (running) state while disabled, even mid-hold', () => {
    input = createInput();
    press('Shift');
    expect(input.isWalkHeld()).toBe(true);

    input.setEnabled(false);
    expect(input.isWalkHeld()).toBe(false);

    // Re-enabling starts clean: the held-during-disable key was dropped, not remembered.
    input.setEnabled(true);
    expect(input.isWalkHeld()).toBe(false);
  });
});
