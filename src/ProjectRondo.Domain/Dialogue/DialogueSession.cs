using R3;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>
/// A running dialogue as reactive state: wraps the pure <see cref="DialoguePlayback"/> so the presentation
/// layer binds to <see cref="State"/> instead of polling. Invalid input is a no-op that returns the same
/// <see cref="DialogueState"/>, so R3's equality check suppresses the emission.
/// </summary>
public sealed class DialogueSession : IDisposable
{
	private readonly DialogueGraph _graph;
	private readonly ReactiveProperty<DialogueState> _state;

	public DialogueSession(DialogueGraph graph)
	{
		_graph = graph;
		_state = new ReactiveProperty<DialogueState>(DialoguePlayback.Start(graph));
	}

	/// <summary>The current dialogue state; replays its value to each new subscriber.</summary>
	public ReadOnlyReactiveProperty<DialogueState> State => _state;

	/// <summary>Advances the current line; a no-op on a branch or after the end.</summary>
	public void Advance() => _state.Value = DialoguePlayback.Step(_graph, _state.Value, DialogueInput.Advance);

	/// <summary>Selects the branch option at <paramref name="index"/>; a no-op elsewhere or out of range.</summary>
	public void Select(int index) => _state.Value = DialoguePlayback.Step(_graph, _state.Value, DialogueInput.Select(index));

	public void Dispose() => _state.Dispose();
}
