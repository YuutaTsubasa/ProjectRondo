namespace ProjectRondo.Domain.Dialogue;

/// <summary>
/// Pure, engine-agnostic dialogue advancement. Given a <see cref="DialogueGraph"/>, the current
/// <see cref="DialogueState"/> and one <see cref="DialogueInput"/>, it computes the next state.
/// Invalid input (advancing a choice, selecting a line, an out-of-range index, or input after the
/// end) is a no-op: the same state is returned.
/// </summary>
public static class DialoguePlayback
{
	/// <summary>The state at the graph's start node.</summary>
	public static DialogueState Start(DialogueGraph graph) => StateOf(graph.Nodes[graph.StartId]);

	/// <summary>Projects a node to the state that presents it: a branch node awaits a choice, otherwise it speaks.</summary>
	private static DialogueState StateOf(DialogueNode node) =>
		node.Exit.Match<DialogueState>(
			_ => new Speaking(node),
			branch => new AwaitingChoice(node, branch.Choices),
			_ => new Speaking(node));
}
