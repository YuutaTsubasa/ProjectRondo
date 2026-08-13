using System.Collections.Immutable;
using OneOf;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>Where a <see cref="DialogueNode"/> leads: on to one line, to a branch, or to the end.</summary>
public sealed class NodeExit : OneOfBase<LinearExit, BranchExit, EndExit>
{
	private NodeExit(OneOf<LinearExit, BranchExit, EndExit> input) : base(input) { }

	/// <summary>A single continuation to <paramref name="next"/>.</summary>
	public static NodeExit Line(NodeId next) => new(new LinearExit(next));

	/// <summary>A choice between one or more <paramref name="choices"/>.</summary>
	public static NodeExit Branch(ImmutableArray<DialogueChoice> choices) =>
		choices.IsDefaultOrEmpty
			? throw new ArgumentException("A branch exit needs at least one choice.", nameof(choices))
			: new(new BranchExit(choices));

	/// <summary>A choice between one or more <paramref name="choices"/>.</summary>
	public static NodeExit Branch(params DialogueChoice[] choices) => Branch(choices.ToImmutableArray());

	/// <summary>The terminal exit: advancing past this node ends the dialogue.</summary>
	public static NodeExit End { get; } = new(new EndExit());
}

/// <summary>Continues to a single next node.</summary>
public readonly record struct LinearExit(NodeId Next);

/// <summary>Presents a branch; the player selects one <see cref="DialogueChoice"/>.</summary>
public readonly record struct BranchExit(ImmutableArray<DialogueChoice> Choices);

/// <summary>Marks the end of the dialogue.</summary>
public readonly record struct EndExit;
