import { describe, it, expect } from 'vitest';
import { createVariantRotation } from '../../../src/domain/audio/variantRotation';

describe('createVariantRotation', () => {
  it('hands out a cue\'s variants in order, starting at the first', () => {
    const rotation = createVariantRotation();
    expect([0, 1, 2, 3].map(() => rotation.next('ui.type'))).toEqual([0, 1, 2, 3]);
  });

  it('counts each cue on its own', () => {
    const rotation = createVariantRotation();
    // Interleaved, which is how they actually arrive: a typing tick between two footfalls must not
    // push the footsteps' feet along, or the left/right alternation the caller derives from this
    // index stops alternating.
    expect(rotation.next('ui.type')).toBe(0);
    expect(rotation.next('footstep.grass')).toBe(0);
    expect(rotation.next('ui.type')).toBe(1);
    expect(rotation.next('footstep.grass')).toBe(1);
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
