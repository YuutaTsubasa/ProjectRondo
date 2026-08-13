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
	public static NodeExit Branch(ImmutableArray<DialogueChoice> choices) => new(new BranchExit(choices));

	/// <summary>A choice between one or more <paramref name="choices"/>.</summary>
	public static NodeExit Branch(params DialogueChoice[] choices) => new(new BranchExit(choices.ToImmutableArray()));

	/// <summary>The terminal exit: advancing past this node ends the dialogue.</summary>
	public static NodeExit End { get; } = new(new EndExit());
}

/// <summary>Continues to a single next node.</summary>
public readonly record struct LinearExit(NodeId Next);

/// <summary>
/// Presents a branch; the player selects one <see cref="DialogueChoice"/>. Always holds at least one
/// choice — the invariant lives on the type, not just <see cref="NodeExit.Branch(ImmutableArray{DialogueChoice})"/>.
/// (A <c>default(BranchExit)</c> still bypasses this, as with any struct, but no explicit construction path
/// can produce an empty branch.)
/// </summary>
public readonly record struct BranchExit
{
	/// <summary>Creates a branch exit, requiring at least one entry in <paramref name="choices"/>.</summary>
	public BranchExit(ImmutableArray<DialogueChoice> choices) =>
		Choices = choices.IsDefaultOrEmpty
			? throw new ArgumentException("A branch exit needs at least one choice.", nameof(choices))
			: choices;

	/// <summary>The available choices; never empty.</summary>
	public ImmutableArray<DialogueChoice> Choices { get; }
}

/// <summary>Marks the end of the dialogue.</summary>
public readonly record struct EndExit;
