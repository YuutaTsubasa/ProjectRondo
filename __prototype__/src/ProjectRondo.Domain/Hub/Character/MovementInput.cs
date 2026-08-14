using ProjectRondo.Domain.Kernel;

namespace ProjectRondo.Domain.Hub.Character;

/// <summary>A single frame of player intent: the desired planar direction and whether a jump was requested.</summary>
public readonly record struct MovementInput(NormalizedPlanarDirection Direction, bool JumpRequested)
{
	/// <summary>No directional input and no jump.</summary>
	public static MovementInput None => new(NormalizedPlanarDirection.None, JumpRequested: false);
}
