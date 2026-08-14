namespace ProjectRondo.Domain.Hub.Character;

/// <summary>Immutable tuning parameters that drive <see cref="CharacterMovement"/>.</summary>
public sealed record MovementConfig(
	float MaxSpeed,
	float Acceleration,
	float Deceleration,
	float Gravity,
	float JumpSpeed)
{
	/// <summary>The default tuning, drawn from <see cref="MovementConstants"/>.</summary>
	public static MovementConfig Default => new(
		MovementConstants.MaxSpeed,
		MovementConstants.Acceleration,
		MovementConstants.Deceleration,
		MovementConstants.Gravity,
		MovementConstants.JumpSpeed);
}
