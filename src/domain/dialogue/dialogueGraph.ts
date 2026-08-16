import { type NodeId } from './nodeId';
import { type DialogueNode } from './dialogueNode';
import { type NodeExit } from './nodeExit';
import { type GraphError } from './graphError';

/** An immutable dialogue as a graph of nodes keyed by id, with a designated start. */
export interface DialogueGraph {
  readonly nodes: ReadonlyMap<NodeId, DialogueNode>;
  readonly startId: NodeId;
}

/** Builds a graph from nodes, indexing each by its id. */
export const fromNodes = (startId: NodeId, nodes: readonly DialogueNode[]): DialogueGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  startId,
});

/** The node ids an exit can lead to: the linear next, each branch target, or none for an end. */
const targets = (exit: NodeExit): readonly NodeId[] => {
  switch (exit.kind) {
    case 'linear': return [exit.next];
    case 'branch': return exit.choices.map((c) => c.target);
    case 'end': return [];
  }
};

/** The set of node ids reachable from `start` by following exits present in the graph. */
const reachableFrom = (graph: DialogueGraph, start: NodeId): ReadonlySet<NodeId> => {
  const visited = new Set<NodeId>();
  const pending: NodeId[] = [start];
  while (pending.length > 0) {
    const id = pending.pop()!; // safe: guarded by the while (pending.length > 0) condition
    const node = graph.nodes.get(id);
    if (!node || visited.has(id)) continue;
    visited.add(id);
    for (const t of targets(node.exit)) pending.push(t);
  }
  return visited;
};

/** Reports authoring problems; empty for a well-formed graph. Never throws. */
export const validate = (graph: DialogueGraph): readonly GraphError[] => {
  const hasStart = graph.nodes.has(graph.startId);
  const reachable = hasStart ? reachableFrom(graph, graph.startId) : new Set<NodeId>();
  const errors: GraphError[] = [];

  if (!hasStart) errors.push({ kind: 'missingStart', startId: graph.startId });

  for (const node of graph.nodes.values())
    for (const target of targets(node.exit))
      if (!graph.nodes.has(target))
        errors.push({ kind: 'danglingReference', from: node.id, target });

  if (hasStart)
    for (const id of graph.nodes.keys())
      if (!reachable.has(id)) errors.push({ kind: 'unreachableNode', node: id });

  return errors;
};
