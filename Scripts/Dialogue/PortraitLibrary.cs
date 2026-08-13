using Godot;
using ProjectRondo.Domain.Dialogue;

namespace ProjectRondo.Dialogue;

/// <summary>
/// Resolves a <see cref="PortraitKey"/> to a portrait texture, falling back to a default when the key has
/// no dedicated art yet. Card #4 fills the key map with per-emotion textures; until then every key
/// resolves to the neutral portrait.
/// </summary>
public sealed class PortraitLibrary
{
	private const string NeutralPath = "res://Assets/Portraits/knight_idle.png";

	private readonly Dictionary<string, Texture2D> _byKey = new();
	private readonly Texture2D _fallback;

	private PortraitLibrary(Texture2D fallback) => _fallback = fallback;

	/// <summary>The stub library used until card #4 supplies per-emotion portraits.</summary>
	public static PortraitLibrary Neutral() => new(GD.Load<Texture2D>(NeutralPath));

	/// <summary>The texture for <paramref name="key"/>, or the fallback when the key is unmapped.</summary>
	public Texture2D Resolve(PortraitKey key) => _byKey.TryGetValue(key.Value, out var texture) ? texture : _fallback;
}
