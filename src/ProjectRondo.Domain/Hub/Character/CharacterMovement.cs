using System.Numerics;

namespace ProjectRondo.Domain.Hub.Character;

/// <summary>
/// Pure, engine-agnostic character movement. Given the previous <see cref="CharacterMotion"/>,
/// one frame of <see cref="MovementInput"/> and the <see cref="MovementConfig"/> tuning, it computes
/// the next motion. The presentation layer is responsible for applying the result to a physics body.
/// </summary>
public static class CharacterMovement
{
	/// <summary>Advances the character motion by a single frame of duration <paramref name="delta"/> seconds.</summary>
	public static CharacterMotion Step(CharacterMotion motion, MovementInput input, MovementConfig config, float delta)
	{
		var planar = NextPlanarVelocity(motion, input, config, delta);
		var justJumped = motion.IsGrounded && input.JumpRequested;
		var verticalSpeed = NextVerticalSpeed(motion, justJumped, config, delta);
		var facing = input.Direction.IsZero ? motion.Facing : Vector2.Normalize(input.Direction.Value);

		return new CharacterMotion(
			new Vector3(planar.X, verticalSpeed, planar.Y),
			facing,
			IsGrounded: motion.IsGrounded && !justJumped);
	}

	private static Vector2 NextPlanarVelocity(CharacterMotion motion, MovementInput input, MovementConfig config, float delta)
	{
		var current = new Vector2(motion.Velocity.X, motion.Velocity.Z);
		var target = input.Direction.Value * config.MaxSpeed;
		var rate = input.Direction.IsZero ? config.Deceleration : config.Acceleration;

		return MoveToward(current, target, rate * delta);
	}

	private static float NextVerticalSpeed(CharacterMotion motion, bool justJumped, MovementConfig config, float delta) =>
		(motion.IsGrounded, justJumped) switch
		{
			(true, true) => config.JumpSpeed,
			(true, false) => 0f,
			(false, _) => motion.Velocity.Y - config.Gravity * delta
		};

	private static Vector2 MoveToward(Vector2 current, Vector2 target, float maxDelta)
	{
		var offset = target - current;
		var distance = offset.Length();

		return distance <= maxDelta || distance == 0f
			? target
			: current + offset / distance * maxDelta;
	}
}
