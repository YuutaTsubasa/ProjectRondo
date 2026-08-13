namespace ProjectRondo.Domain.Dialogue;

/// <summary>
/// Pure, engine-agnostic dialogue advancement. Given a <see cref="DialogueGraph"/>, the current
/// <see cref="DialogueState"/> and one <see cref="DialogueInput"/>, it computes the next state.
/// Invalid input (advancing a choice, selecting a line, an out-of-range index, or input after the
/// end) is a no-op: the same state is returned.
/// </summary>
public static class DialoguePlayback
{
	/// <summary>
	/// The state at the graph's start node. Assumes <see cref="DialogueGraph.StartId"/> exists in
	/// <see cref="DialogueGraph.Nodes"/> — a graph-construction invariant — and throws otherwise.
	/// Mid-playback references to a missing node (see <see cref="Go"/>) are instead treated as a no-op.
	/// </summary>
	public static DialogueState Start(DialogueGraph graph) => StateOf(graph.Nodes[graph.StartId]);

	/// <summary>Advances the dialogue by one input, returning the same state for invalid input.</summary>
	public static DialogueState Step(DialogueGraph graph, DialogueState state, DialogueInput input) =>
		state.Match<DialogueState>(
			speaking => StepSpeaking(graph, state, speaking, input),
			awaiting => StepAwaiting(graph, state, awaiting, input),
			_ => state);

	private static DialogueState StepSpeaking(DialogueGraph graph, DialogueState self, Speaking speaking, DialogueInput input) =>
		input.Match<DialogueState>(
			_ => speaking.Current.Exit.Match<DialogueState>(
				linear => Go(graph, linear.Next, self),
				_ => self,
				_ => new Ended(speaking.Current)),
			_ => self);

	private static DialogueState StepAwaiting(DialogueGraph graph, DialogueState self, AwaitingChoice awaiting, DialogueInput input) =>
		input.Match<DialogueState>(
			_ => self,
			select => select.Index >= 0 && select.Index < awaiting.Choices.Length
				? Go(graph, awaiting.Choices[select.Index].Target, self)
				: self);

	private static DialogueState Go(DialogueGraph graph, NodeId id, DialogueState fallback) =>
		graph.Nodes.TryGetValue(id, out var node) ? StateOf(node) : fallback;

	private static DialogueState StateOf(DialogueNode node) =>
		node.Exit.Match<DialogueState>(
			_ => new Speaking(node),
			branch => new AwaitingChoice(node, branch.Choices),
			_ => new Speaking(node));
}
