using System.Collections.Immutable;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>An immutable dialogue as a graph of <see cref="DialogueNode"/> keyed by <see cref="NodeId"/>.</summary>
public sealed record DialogueGraph(ImmutableDictionary<NodeId, DialogueNode> Nodes, NodeId StartId)
{
	/// <summary>Builds a graph from <paramref name="nodes"/>, indexing each by its <see cref="DialogueNode.Id"/>.</summary>
	public static DialogueGraph FromNodes(NodeId startId, params DialogueNode[] nodes) =>
		new(nodes.ToImmutableDictionary(node => node.Id), startId);

	/// <summary>
	/// Reports authoring problems so they surface when the graph is loaded rather than as a dialogue that
	/// silently gets stuck at runtime (see <see cref="DialoguePlayback"/>'s dangling-reference no-op).
	/// Returns an empty array for a well-formed graph; never throws.
	/// </summary>
	public ImmutableArray<DialogueGraphError> Validate()
	{
		var hasStart = Nodes.ContainsKey(StartId);
		var reachable = hasStart ? ReachableFrom(StartId) : ImmutableHashSet<NodeId>.Empty;

		IEnumerable<DialogueGraphError> missingStart = hasStart ? [] : [new MissingStartNode(StartId)];

		var dangling = Nodes.Values
			.SelectMany(node => Targets(node).Select(target => (From: node.Id, Target: target)))
			.Where(edge => !Nodes.ContainsKey(edge.Target))
			.Select(edge => (DialogueGraphError)new DanglingReference(edge.From, edge.Target));

		IEnumerable<DialogueGraphError> unreachable = hasStart
			? Nodes.Keys.Where(id => !reachable.Contains(id)).Select(id => (DialogueGraphError)new UnreachableNode(id))
			: [];

		return missingStart.Concat(dangling).Concat(unreachable).ToImmutableArray();
	}

	/// <summary>The node ids a node's exit can lead to: the linear next, each branch target, or none for an end.</summary>
	private static IEnumerable<NodeId> Targets(DialogueNode node) =>
		node.Exit.Match<IEnumerable<NodeId>>(
			linear => [linear.Next],
			branch => branch.Choices.Select(choice => choice.Target),
			_ => []);

	/// <summary>The set of node ids reachable from <paramref name="start"/> by following exits present in the graph.</summary>
	private ImmutableHashSet<NodeId> ReachableFrom(NodeId start)
	{
		var visited = new HashSet<NodeId>();
		var pending = new Stack<NodeId>();
		pending.Push(start);

		while (pending.Count > 0)
		{
			var id = pending.Pop();
			if (!Nodes.TryGetValue(id, out var node) || !visited.Add(id))
				continue;

			foreach (var target in Targets(node))
				pending.Push(target);
		}

		return visited.ToImmutableHashSet();
	}
}
