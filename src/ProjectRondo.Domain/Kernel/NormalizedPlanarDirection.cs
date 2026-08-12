using System.Numerics;

namespace ProjectRondo.Domain.Kernel;

/// <summary>
/// A planar (X/Z) direction guaranteed to have a magnitude of at most one, so that analog input
/// keeps its intended strength while diagonal input can never exceed unit length.
/// </summary>
public readonly record struct NormalizedPlanarDirection
{
	private NormalizedPlanarDirection(Vector2 value) => Value = value;

	/// <summary>The clamped direction vector, whose length is always in the range [0, 1].</summary>
	public Vector2 Value { get; }

	/// <summary>The absence of any directional input.</summary>
	public static NormalizedPlanarDirection None => new(Vector2.Zero);

	/// <summary>True when there is no directional input.</summary>
	public bool IsZero => Value == Vector2.Zero;

	/// <summary>
	/// Clamps <paramref name="raw"/> to unit length, leaving shorter vectors untouched so that
	/// partial analog input retains its magnitude.
	/// </summary>
	public static NormalizedPlanarDirection From(Vector2 raw) =>
		raw.LengthSquared() > 1f ? new(Vector2.Normalize(raw)) : new(raw);
}
