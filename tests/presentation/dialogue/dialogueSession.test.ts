import { describe, it, expect } from 'vitest';
import { createDialogueSession } from '../../../src/presentation/dialogue/dialogueSession.svelte';
import { parse } from '../../../src/domain/dialogue/script/parser';

const { graph } = parse(':: greet\n里昂: 你好。\n-> ask\n:: ask\n里昂: 走哪？\n* 左 -> l\n* 右 -> r\n:: l\n旁白: 左。\n:: r\n旁白: 右。\n');

describe('DialogueSession', () => {
  it('exposes speaker/line/choices and advances', () => {
    const s = createDialogueSession(graph!);
    expect(s.speaker).toBe('里昂');
    expect(s.line).toBe('你好。');
    expect(s.isFinished).toBe(false);
    s.advance();                       // -> ask (awaiting)
    expect(s.choices.map((c) => c.label)).toEqual(['左', '右']);
    s.select(0);                       // -> l
    expect(s.line).toBe('左。');
  });
  it('records a backlog of shown lines', () => {
    const s = createDialogueSession(graph!);
    s.advance(); s.select(1);          // greet, ask, r
    expect(s.backlog.map((b) => b.line)).toEqual(['你好。', '走哪？', '右。']);
  });
  it('an invalid input does not change state or backlog', () => {
    const s = createDialogueSession(graph!);
    s.advance();                       // now awaiting choice
    const before = s.backlog.length;
    s.advance();                       // no-op (advancing while awaiting)
    expect(s.backlog.length).toBe(before);
  });
});
