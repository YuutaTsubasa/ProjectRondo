/** Player intent while a dialogue runs: advance the current line, or select a branch option. */
export type DialogueInput =
  | { readonly kind: 'advance' }
  | { readonly kind: 'select'; readonly index: number };

export const ADVANCE: DialogueInput = { kind: 'advance' };
export const select = (index: number): DialogueInput => ({ kind: 'select', index });
