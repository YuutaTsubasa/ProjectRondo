import { describe, it, expect } from 'vitest';
import { linearExit, branchExit, END_EXIT } from '../../../src/domain/dialogue/nodeExit';
import { dialogueChoice } from '../../../src/domain/dialogue/dialogueChoice';
import { nodeId } from '../../../src/domain/dialogue/nodeId';

describe('NodeExit', () => {
  it('linear carries the next node id', () => {
    expect(linearExit(nodeId('ask'))).toEqual({ kind: 'linear', next: 'ask' });
  });
  it('branch carries the choices', () => {
    const c = [dialogueChoice('左', nodeId('l')), dialogueChoice('右', nodeId('r'))];
    expect(branchExit(c)).toEqual({ kind: 'branch', choices: c });
  });
  it('end is a singleton kind', () => {
    expect(END_EXIT).toEqual({ kind: 'end' });
  });
});
