using System.Collections.Immutable;
using OneOf;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>
/// The observable state of a running dialogue: showing a line, awaiting a choice, or ended.
/// The presentation layer binds to this (e.g. R3 <c>ReactiveProperty&lt;DialogueState&gt;</c>).
/// </summary>
public sealed class DialogueState : OneOfBase<Speaking, AwaitingChoice, Ended>
{
	private DialogueState(OneOf<Speaking, AwaitingChoice, Ended> input) : base(input) { }

	public static implicit operator DialogueState(Speaking value) => new(value);
	public static implicit operator DialogueState(AwaitingChoice value) => new(value);
	public static implicit operator DialogueState(Ended value) => new(value);

	public bool IsSpeaking => IsT0;
	public bool IsAwaitingChoice => IsT1;
	public bool IsEnded => IsT2;

	public Speaking AsSpeaking => AsT0;
	public AwaitingChoice AsAwaitingChoice => AsT1;
	public Ended AsEnded => AsT2;
}

/// <summary>Showing <see cref="Current"/>'s line, awaiting an <see cref="AdvanceInput"/>.</summary>
public readonly record struct Speaking(DialogueNode Current);

/// <summary>Showing <see cref="Current"/>'s line and awaiting a selection among <see cref="Choices"/>.</summary>
public readonly record struct AwaitingChoice(DialogueNode Current, ImmutableArray<DialogueChoice> Choices);

/// <summary>The dialogue has ended; <see cref="Last"/> is the final line shown.</summary>
public readonly record struct Ended(DialogueNode Last);
