using Godot;

namespace ProjectRondo.Utils;

/// <summary>Conversions between Godot vectors and the <see cref="System.Numerics"/> vectors used by the domain.</summary>
public static class VectorConversions
{
	/// <summary>Converts a Godot 3D vector into its engine-agnostic domain counterpart.</summary>
	public static System.Numerics.Vector3 ToNumerics(this Vector3 value) => new(value.X, value.Y, value.Z);

	/// <summary>Converts a Godot 2D vector into its engine-agnostic domain counterpart.</summary>
	public static System.Numerics.Vector2 ToNumerics(this Vector2 value) => new(value.X, value.Y);

	/// <summary>Converts a domain 3D vector back into a Godot vector for the physics body.</summary>
	public static Vector3 ToGodot(this System.Numerics.Vector3 value) => new(value.X, value.Y, value.Z);

	/// <summary>Converts a domain 2D vector back into a Godot vector.</summary>
	public static Vector2 ToGodot(this System.Numerics.Vector2 value) => new(value.X, value.Y);
}
