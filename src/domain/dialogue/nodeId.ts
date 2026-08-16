/** A node's identity within a graph. A branded string: value-equal, usable as a Map key. */
export type NodeId = string & { readonly __brand: 'NodeId' };
export const nodeId = (value: string): NodeId => value as NodeId;
