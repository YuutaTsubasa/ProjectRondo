import { describe, it, expect } from 'vitest';
import { nodeId } from '../../../src/domain/dialogue/nodeId';
import { speaker } from '../../../src/domain/dialogue/speaker';
import { portraitKey } from '../../../src/domain/dialogue/portraitKey';
import { dialogueChoice } from '../../../src/domain/dialogue/dialogueChoice';

describe('dialogue value types', () => {
  it('brands are plain strings at runtime (usable as Map keys and for display)', () => {
    expect(nodeId('greet')).toBe('greet');
    expect(speaker('里昂')).toBe('里昂');
    expect(portraitKey('normal')).toBe('normal');
    const key = nodeId('a');
    expect(new Map([[key, 1]]).get(nodeId('a'))).toBe(1); // value equality
  });
  it('dialogueChoice pairs a label with a target', () => {
    expect(dialogueChoice('左邊', nodeId('left'))).toEqual({ label: '左邊', target: 'left' });
  });
});
