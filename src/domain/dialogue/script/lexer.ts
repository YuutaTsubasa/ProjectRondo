import { type Token } from './token';

/** `* text -> target` */
const CHOICE = /^\*\s*(.+?)\s*->\s*(\S+)\s*$/;
/** `Speaker: text` or `Speaker(portrait): text` */
const LINE = /^([^():]+?)(?:\(([^)]*)\))?\s*:\s*(.*)$/;

/** Splits DSL source into one token per meaningful line; blanks and `#` comments are skipped. */
export const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('#')) continue;

    if (raw.startsWith('::')) {
      tokens.push({ kind: 'label', id: raw.slice(2).trim(), line });
      continue;
    }
    if (raw.startsWith('->')) {
      tokens.push({ kind: 'goto', target: raw.slice(2).trim(), line });
      continue;
    }
    const choice = CHOICE.exec(raw);
    if (choice) {
      tokens.push({ kind: 'choice', text: choice[1], target: choice[2], line });
      continue;
    }
    const parsed = LINE.exec(raw);
    if (parsed) {
      tokens.push({ kind: 'line', speaker: parsed[1].trim(), portrait: parsed[2]?.trim() || undefined, text: parsed[3].trim(), line });
      continue;
    }
    // Unrecognized line: emit a line token with empty speaker so the parser reports it in context.
    tokens.push({ kind: 'line', speaker: '', portrait: undefined, text: raw, line });
  }
  return tokens;
};
