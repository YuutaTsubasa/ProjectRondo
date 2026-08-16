import { type GraphError } from '../graphError';

/** A DSL authoring error: either a syntactic problem or a merged graph-validation error. */
export type ParseError =
  | { readonly kind: 'choiceWithoutLine'; readonly line: number }
  | { readonly kind: 'gotoWithoutLine'; readonly line: number }
  | { readonly kind: 'duplicateLabel'; readonly id: string; readonly line: number }
  | { readonly kind: 'emptyLine'; readonly line: number }
  | { readonly kind: 'labelWithoutLine'; readonly id: string; readonly line: number }
  | GraphError;
