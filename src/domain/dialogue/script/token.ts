/** A lexed line of DSL source (1-based `line` for error messages). */
export type Token =
  | { readonly kind: 'label'; readonly id: string; readonly line: number }
  | { readonly kind: 'line'; readonly speaker: string; readonly portrait: string | undefined; readonly text: string; readonly line: number }
  | { readonly kind: 'goto'; readonly target: string; readonly line: number }
  | { readonly kind: 'choice'; readonly text: string; readonly target: string; readonly line: number };
