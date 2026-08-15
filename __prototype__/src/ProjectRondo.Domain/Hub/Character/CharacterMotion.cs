using System.Numerics;

namespace ProjectRondo.Domain.Hub.Character;

/// <summary>
/// The kinematic state of the character: world-space velocity, the planar (X/Z) facing direction
/// and whether the character is currently standing on the ground.
/// </summary>
public readonly record struct CharacterMotion(Vector3 Velocity, Vector2 Facing, bool IsGrounded)
{
	/// <summary>A grounded, motionless character facing forward (negative Z).</summary>
	public static CharacterMotion Idle => new(Vector3.Zero, -Vector2.UnitY, IsGrounded: true);
}
