using System.Numerics;
using ProjectRondo.Domain.Kernel;

namespace ProjectRondo.Domain.Tests.Kernel;

public sealed class NormalizedPlanarDirectionTests
{
	private const int Precision = 3;

	[Fact]
	public void From_VectorLongerThanUnit_IsClampedToUnitLength()
	{
		var direction = NormalizedPlanarDirection.From(new Vector2(3f, 4f));

		Assert.Equal(1d, direction.Value.Length(), Precision);
		Assert.Equal(0.6d, direction.Value.X, Precision);
		Assert.Equal(0.8d, direction.Value.Y, Precision);
	}

	[Fact]
	public void From_VectorShorterThanUnit_IsPreservedForAnalogInput()
	{
		var direction = NormalizedPlanarDirection.From(new Vector2(0.5f, 0f));

		Assert.Equal(0.5d, direction.Value.X, Precision);
		Assert.Equal(0d, direction.Value.Y, Precision);
		Assert.False(direction.IsZero);
	}

	[Fact]
	public void From_ZeroVector_IsZero()
	{
		Assert.True(NormalizedPlanarDirection.From(Vector2.Zero).IsZero);
		Assert.True(NormalizedPlanarDirection.None.IsZero);
	}

	[Fact]
	public void From_DiagonalOverflow_PreservesDirectionAtUnitLength()
	{
		var direction = NormalizedPlanarDirection.From(new Vector2(1f, 1f));

		Assert.Equal(1d, direction.Value.Length(), Precision);
		Assert.Equal(direction.Value.X, direction.Value.Y, Precision);
	}
}
