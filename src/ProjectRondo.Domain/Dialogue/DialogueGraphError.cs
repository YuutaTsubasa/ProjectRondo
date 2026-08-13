using OneOf;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>
/// An authoring problem found by <see cref="DialogueGraph.Validate"/>: a start node that does not exist,
/// a reference to a missing node, or a node that can never be reached from the start.
/// </summary>
public sealed class DialogueGraphError : OneOfBase<MissingStartNode, DanglingReference, UnreachableNode>
{
	private DialogueGraphError(OneOf<MissingStartNode, DanglingReference, UnreachableNode> input) : base(input) { }

	public static implicit operator DialogueGraphError(MissingStartNode value) => new(value);
	public static implicit operator DialogueGraphError(DanglingReference value) => new(value);
	public static implicit operator DialogueGraphError(UnreachableNode value) => new(value);

	public bool IsMissingStartNode => IsT0;
	public bool IsDanglingReference => IsT1;
	public bool IsUnreachableNode => IsT2;

	public MissingStartNode AsMissingStartNode => AsT0;
	public DanglingReference AsDanglingReference => AsT1;
	public UnreachableNode AsUnreachableNode => AsT2;
}

/// <summary>The graph's <see cref="DialogueGraph.StartId"/> is not present in its nodes.</summary>
public readonly record struct MissingStartNode(NodeId StartId);

/// <summary>Node <see cref="From"/> leads to <see cref="Target"/>, which is not present in the graph.</summary>
public readonly record struct DanglingReference(NodeId From, NodeId Target);

/// <summary>Node <see cref="Node"/> cannot be reached from the start node.</summary>
public readonly record struct UnreachableNode(NodeId Node);
