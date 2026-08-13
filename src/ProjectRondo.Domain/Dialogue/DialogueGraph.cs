using System.Collections.Immutable;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>An immutable dialogue as a graph of <see cref="DialogueNode"/> keyed by <see cref="NodeId"/>.</summary>
public sealed record DialogueGraph(ImmutableDictionary<NodeId, DialogueNode> Nodes, NodeId StartId)
{
	/// <summary>Builds a graph from <paramref name="nodes"/>, indexing each by its <see cref="DialogueNode.Id"/>.</summary>
	public static DialogueGraph FromNodes(NodeId startId, params DialogueNode[] nodes) =>
		new(nodes.ToImmutableDictionary(node => node.Id), startId);
}
