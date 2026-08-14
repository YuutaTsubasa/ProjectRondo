using OneOf;

namespace ProjectRondo.Domain.Dialogue;

/// <summary>Player intent while a dialogue is running: advance the current line, or select a branch option.</summary>
public sealed class DialogueInput : OneOfBase<AdvanceInput, SelectInput>
{
	private DialogueInput(OneOf<AdvanceInput, SelectInput> input) : base(input) { }

	/// <summary>Request to move past the current line.</summary>
	public static DialogueInput Advance { get; } = new(new AdvanceInput());

	/// <summary>Select the branch option at <paramref name="index"/>.</summary>
	public static DialogueInput Select(int index) => new(new SelectInput(index));
}

/// <summary>Advance past the current line.</summary>
public readonly record struct AdvanceInput;

/// <summary>Select the branch option at <see cref="Index"/>.</summary>
public readonly record struct SelectInput(int Index);
