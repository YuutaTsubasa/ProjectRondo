using System.Collections.Immutable;
using R3;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>
/// A running dialogue as reactive state: wraps the pure <see cref="DialoguePlayback"/> so the presentation
/// layer binds to <see cref="State"/> (and its derived streams) instead of polling. Invalid input is a
/// no-op that returns the same <see cref="DialogueState"/>, so R3's equality check suppresses the emission.
/// </summary>
public sealed class DialogueSession : IDisposable
{
	private readonly DialogueGraph _graph;
	private readonly ReactiveProperty<DialogueState> _state;

	public DialogueSession(DialogueGraph graph)
	{
		_graph = graph;
		_state = new ReactiveProperty<DialogueState>(DialoguePlayback.Start(graph));
		Speaker = _state.Select(NodeOf).Select(node => node.Speaker).DistinctUntilChanged();
		Line = _state.Select(NodeOf).Select(node => node.Line).DistinctUntilChanged();
		Portrait = _state.Select(NodeOf).Select(node => node.Portrait).DistinctUntilChanged();
		Choices = _state.Select(state => state.IsAwaitingChoice ? state.AsAwaitingChoice.Choices : []).DistinctUntilChanged();
		IsFinished = _state.Select(state => state.IsEnded).DistinctUntilChanged();
	}

	/// <summary>The current dialogue state; replays its value to each new subscriber.</summary>
	public ReadOnlyReactiveProperty<DialogueState> State => _state;

	/// <summary>The speaker of the current line.</summary>
	public Observable<Speaker> Speaker { get; }

	/// <summary>The text of the current line.</summary>
	public Observable<string> Line { get; }

	/// <summary>The portrait key of the current line.</summary>
	public Observable<PortraitKey> Portrait { get; }

	/// <summary>The current choices; empty unless awaiting a selection.</summary>
	public Observable<ImmutableArray<DialogueChoice>> Choices { get; }

	/// <summary>True once the dialogue has ended.</summary>
	public Observable<bool> IsFinished { get; }

	/// <summary>Advances the current line; a no-op on a branch or after the end.</summary>
	public void Advance() => _state.Value = DialoguePlayback.Step(_graph, _state.Value, DialogueInput.Advance);

	/// <summary>Selects the branch option at <paramref name="index"/>; a no-op elsewhere or out of range.</summary>
	public void Select(int index) => _state.Value = DialoguePlayback.Step(_graph, _state.Value, DialogueInput.Select(index));

	public void Dispose() => _state.Dispose();

	private static DialogueNode NodeOf(DialogueState state) =>
		state.Match(speaking => speaking.Current, awaiting => awaiting.Current, ended => ended.Last);
}
