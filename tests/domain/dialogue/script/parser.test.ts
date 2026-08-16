import { describe, it, expect } from 'vitest';
import { parse } from '../../../../src/domain/dialogue/script/parser';
import { start, step } from '../../../../src/domain/dialogue/dialoguePlayback';
import { ADVANCE, select } from '../../../../src/domain/dialogue/dialogueInput';

const SCRIPT = `
:: greet
里昂: 雲層再往下沉三十公尺，哨站就看不見谷底了。
旁白: 風從西面壓過來。
-> ask

:: ask
里昂: 你確定要在這種天氣裡下去？
* 走向懸崖邊 -> cliff
* 繼續等待 -> wait

:: cliff
旁白: 你走向懸崖。
-> END

:: wait
旁白: 你選擇等待。
`;

describe('DSL parser', () => {
  it('parses a well-formed script into a runnable graph', () => {
    const { graph, errors } = parse(SCRIPT);
    expect(errors).toEqual([]);
    expect(graph).toBeDefined();

    // greet: two auto-chained lines, then -> ask (a branch of 2)
    let state = start(graph!);
    expect(state.kind === 'speaking' && state.current.speaker).toBe('里昂');
    state = step(graph!, state, ADVANCE); // second line (旁白)
    expect(state.kind === 'speaking' && state.current.speaker).toBe('旁白');
    state = step(graph!, state, ADVANCE); // -> ask (awaiting choice)
    expect(state.kind).toBe('awaitingChoice');
    expect(state.kind === 'awaitingChoice' && state.choices.map((c) => c.label)).toEqual(['走向懸崖邊', '繼續等待']);

    // choose cliff -> line -> END
    state = step(graph!, state, select(0));
    expect(state.kind === 'speaking' && state.current.speaker).toBe('旁白');
    state = step(graph!, state, ADVANCE);
    expect(state.kind).toBe('ended');
  });

  it('defaults the portrait to "normal" when omitted', () => {
    const { graph } = parse(':: a\n里昂: 嗨。\n');
    const node = start(graph!);
    expect(node.kind === 'speaking' && node.current.portrait).toBe('normal');
  });

  it('reports a choice that appears before any line', () => {
    const { errors } = parse('* 左 -> l\n');
    expect(errors.some((e) => e.kind === 'choiceWithoutLine')).toBe(true);
  });

  it('reports a duplicate label', () => {
    const { errors } = parse(':: a\n里昂: x\n:: a\n里昂: y\n');
    expect(errors.some((e) => e.kind === 'duplicateLabel')).toBe(true);
  });

  it('surfaces graph validation errors (dangling target)', () => {
    const { errors } = parse(':: a\n里昂: x\n-> nowhere\n');
    expect(errors.some((e) => e.kind === 'danglingReference')).toBe(true);
  });
});
