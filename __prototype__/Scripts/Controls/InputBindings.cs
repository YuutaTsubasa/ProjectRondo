using Godot;
using ProjectRondo.Utils;
using ZLinq;

namespace ProjectRondo.Controls;

/// <summary>
/// Registers the hub input actions programmatically so bindings live in code and survive Godot version
/// changes, instead of relying on hand-authored serialization inside <c>project.godot</c>.
/// </summary>
public static class InputBindings
{
	public const string MoveForward = "move_forward";
	public const string MoveBack = "move_back";
	public const string MoveLeft = "move_left";
	public const string MoveRight = "move_right";
	public const string Jump = "jump";
	public const string Interact = "interact";

	private static readonly (string Action, Key[] Keys)[] Actions =
	{
		(MoveForward, new[] { Key.W, Key.Up }),
		(MoveBack, new[] { Key.S, Key.Down }),
		(MoveLeft, new[] { Key.A, Key.Left }),
		(MoveRight, new[] { Key.D, Key.Right }),
		(Jump, new[] { Key.Space }),
		(Interact, new[] { Key.E }),
	};

	/// <summary>Idempotently registers every hub action; safe to call from more than one scene.</summary>
	public static void Ensure() =>
		Actions
			.AsValueEnumerable()
			.ForEach(action => Register(action.Action, action.Keys));

	private static void Register(string action, Key[] keys)
	{
		if (InputMap.HasAction(action)) return;

		InputMap.AddAction(action);
		keys
			.AsValueEnumerable()
			.Select(key => new InputEventKey { PhysicalKeycode = key })
			.ForEach(binding => InputMap.ActionAddEvent(action, binding));
	}
}
