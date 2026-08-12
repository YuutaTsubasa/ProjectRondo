namespace ProjectRondo.Domain.Hub.Character;

/// <summary>Default tuning values for grounded character movement, expressed in metres and seconds.</summary>
public static class MovementConstants
{
	/// <summary>Top planar speed in metres per second.</summary>
	public const float MaxSpeed = 6f;

	/// <summary>Planar acceleration towards the target velocity in metres per second squared.</summary>
	public const float Acceleration = 40f;

	/// <summary>Planar deceleration towards rest when there is no input, in metres per second squared.</summary>
	public const float Deceleration = 50f;

	/// <summary>Downward acceleration applied while airborne, in metres per second squared.</summary>
	public const float Gravity = 24f;

	/// <summary>Upward speed granted at the moment of a jump, in metres per second.</summary>
	public const float JumpSpeed = 9f;
}
