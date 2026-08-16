import { type NodeId } from './nodeId';

/** Authoring problems surfaced by DialogueGraph.validate so they fail at load, not at runtime. */
export type GraphError =
  | { readonly kind: 'missingStart'; readonly startId: NodeId }
  | { readonly kind: 'danglingReference'; readonly from: NodeId; readonly target: NodeId }
  | { readonly kind: 'unreachableNode'; readonly node: NodeId };
