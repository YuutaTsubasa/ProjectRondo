using System.Numerics;
using ProjectRondo.Domain.Hub.Character;
using ProjectRondo.Domain.Kernel;

namespace ProjectRondo.Domain.Tests.Hub.Character;

public sealed class CharacterMovementTests
{
	private const int Precision = 3;
	private static readonly MovementConfig Config = MovementConfig.Default;

	private static MovementInput MoveTowards(Vector2 rawDirection, bool jump = false) =>
		new(NormalizedPlanarDirection.From(rawDirection), jump);

	private static float PlanarSpeed(CharacterMotion motion) =>
		new Vector2(motion.Velocity.X, motion.Velocity.Z).Length();

	[Fact]
	public void FullInput_AcceleratesToMaxSpeedAlongInputDirection()
	{
		var result = CharacterMovement.Step(CharacterMotion.Idle, MoveTowards(new Vector2(1f, 0f)), Config, delta: 1f);

		Assert.Equal(Config.MaxSpeed, result.Velocity.X, Precision);
		Assert.Equal(0d, result.Velocity.Z, Precision);
		Assert.Equal(1d, result.Facing.X, Precision);
	}

	[Fact]
	public void NoInput_DeceleratesPlanarVelocityToRest()
	{
		var moving = CharacterMotion.Idle with { Velocity = new Vector3(Config.MaxSpeed, 0f, 0f) };

		var result = CharacterMovement.Step(moving, MovementInput.None, Config, delta: 1f);

		Assert.Equal(0d, result.Velocity.X, Precision);
		Assert.Equal(0d, result.Velocity.Z, Precision);
	}

	[Fact]
	public void DiagonalInput_NeverExceedsMaxSpeed()
	{
		var result = CharacterMovement.Step(CharacterMotion.Idle, MoveTowards(new Vector2(1f, 1f)), Config, delta: 1f);

		Assert.Equal(Config.MaxSpeed, PlanarSpeed(result), Precision);
		Assert.Equal(result.Velocity.X, result.Velocity.Z, Precision);
	}

	[Fact]
	public void GroundedJump_ImpartsUpwardVelocityAndLeavesGround()
	{
		var result = CharacterMovement.Step(CharacterMotion.Idle, MoveTowards(Vector2.Zero, jump: true), Config, delta: 1f / 60f);

		Assert.Equal(Config.JumpSpeed, result.Velocity.Y, Precision);
		Assert.False(result.IsGrounded);
	}

	[Fact]
	public void AirborneJump_IsIgnored()
	{
		var airborne = CharacterMotion.Idle with { IsGrounded = false };

		var result = CharacterMovement.Step(airborne, MoveTowards(Vector2.Zero, jump: true), Config, delta: 0.5f);

		Assert.Equal(-Config.Gravity * 0.5f, result.Velocity.Y, Precision);
		Assert.False(result.IsGrounded);
	}

	[Fact]
	public void Airborne_AppliesGravityOverTime()
	{
		var airborne = CharacterMotion.Idle with { IsGrounded = false };

		var result = CharacterMovement.Step(airborne, MovementInput.None, Config, delta: 0.5f);

		Assert.Equal(-Config.Gravity * 0.5f, result.Velocity.Y, Precision);
	}

	[Fact]
	public void GroundedWithoutJump_RestsWithZeroVerticalVelocity()
	{
		var settling = CharacterMotion.Idle with { Velocity = new Vector3(0f, -5f, 0f) };

		var result = CharacterMovement.Step(settling, MovementInput.None, Config, delta: 0.5f);

		Assert.Equal(0d, result.Velocity.Y, Precision);
		Assert.True(result.IsGrounded);
	}

	[Fact]
	public void NoInput_PreservesPreviousFacing()
	{
		var facingRight = CharacterMotion.Idle with { Facing = new Vector2(1f, 0f) };

		var result = CharacterMovement.Step(facingRight, MovementInput.None, Config, delta: 0.5f);

		Assert.Equal(1d, result.Facing.X, Precision);
		Assert.Equal(0d, result.Facing.Y, Precision);
	}

	[Fact]
	public void PartialInput_AcceleratesTowardScaledTargetSpeed()
	{
		var result = CharacterMovement.Step(CharacterMotion.Idle, MoveTowards(new Vector2(0.5f, 0f)), Config, delta: 1f);

		Assert.Equal(Config.MaxSpeed * 0.5f, result.Velocity.X, Precision);
	}
}
