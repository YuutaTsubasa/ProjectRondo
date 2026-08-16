import { describe, it, expect } from 'vitest';
import { tokenize } from '../../../../src/domain/dialogue/script/lexer';

describe('DSL lexer', () => {
  it('tokenizes labels, lines, gotos and choices, ignoring blanks and comments', () => {
    const src = [
      '# a comment',
      ':: greet',
      '里昂: 你好。',
      '旁白(wide): 風起了。',
      '',
      '-> ask',
      ':: ask',
      '里昂: 走哪邊？',
      '* 左邊 -> left',
      '* 右邊 -> right',
      '-> END',
    ].join('\n');
    expect(tokenize(src)).toEqual([
      { kind: 'label', id: 'greet', line: 2 },
      { kind: 'line', speaker: '里昂', portrait: undefined, text: '你好。', line: 3 },
      { kind: 'line', speaker: '旁白', portrait: 'wide', text: '風起了。', line: 4 },
      { kind: 'goto', target: 'ask', line: 6 },
      { kind: 'label', id: 'ask', line: 7 },
      { kind: 'line', speaker: '里昂', portrait: undefined, text: '走哪邊？', line: 8 },
      { kind: 'choice', text: '左邊', target: 'left', line: 9 },
      { kind: 'choice', text: '右邊', target: 'right', line: 10 },
      { kind: 'goto', target: 'END', line: 11 },
    ]);
  });
});
