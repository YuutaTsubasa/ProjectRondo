import { describe, it, expect } from 'vitest';
import { createVariantRotation } from '../../../src/domain/audio/variantRotation';

describe('createVariantRotation', () => {
  it('hands out a cue\'s variants in order, starting at the first', () => {
    const rotation = createVariantRotation();
    expect([0, 1, 2, 3].map(() => rotation.next('ui.type'))).toEqual([0, 1, 2, 3]);
  });

  it('counts each cue on its own', () => {
    const rotation = createVariantRotation();
    // Interleaved, which is how they actually arrive: `hubAudio`'s `play` is the only caller, and
    // every cue that reaches it goes through this one rotation. A move sounding between two typing
    // ticks must not push `ui.type` along, or its four recordings stop being handed out in order and
    // the repetition this exists to hide comes back.
    expect(rotation.next('ui.type')).toBe(0);
    expect(rotation.next('ui.move')).toBe(0);
    expect(rotation.next('ui.type')).toBe(1);
    expect(rotation.next('ui.move')).toBe(1);
    expect(rotation.next('ui.type')).toBe(2);
  });

  it('keeps counting past the number of files a cue has', () => {
    const rotation = createVariantRotation();
    // `ui.type` has four recordings and this goes to six, deliberately: the wrap belongs to the
    // sound bank's `pick`, which takes the index modulo however many variants actually loaded. A
    // rotation that wrapped here would have to know that count, and would then be wrong for every
    // cue that lost a file to a failed load.
    expect([0, 1, 2, 3, 4, 5].map(() => rotation.next('ui.type'))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('gives two rotations separate counters', () => {
    const first = createVariantRotation();
    const second = createVariantRotation();
    first.next('ui.move');
    expect(second.next('ui.move')).toBe(0);
  });
});
