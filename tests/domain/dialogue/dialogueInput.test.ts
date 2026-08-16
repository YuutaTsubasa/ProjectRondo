import { describe, it, expect } from 'vitest';
import { ADVANCE, select } from '../../../src/domain/dialogue/dialogueInput';

describe('DialogueInput', () => {
  it('ADVANCE is the advance intent', () => {
    expect(ADVANCE).toEqual({ kind: 'advance' });
  });
  it('select carries a zero-based index', () => {
    expect(select(2)).toEqual({ kind: 'select', index: 2 });
  });
});
