using System.Collections.Immutable;
using Godot;
using ProjectRondo.Domain.Dialogue;
using R3;

namespace ProjectRondo.Dialogue;

/// <summary>Presents a <see cref="DialogueSession"/>: speaker name, portrait, a typewritten line, and choice buttons.</summary>
public partial class DialogueBox : Control
{
	private const float CharactersPerSecond = 40f;

	private Label _name = null!;
	private RichTextLabel _line = null!;
	private VBoxContainer _choices = null!;
	private TextureRect _portrait = null!;
	private PortraitLibrary _library = null!;

	private DialogueSession? _session;
	private readonly List<IDisposable> _bindings = new();
	private float _revealed;
	private bool _typing;

	public override void _Ready()
	{
		_name = GetNode<Label>("%NameLabel");
		_line = GetNode<RichTextLabel>("%LineText");
		_choices = GetNode<VBoxContainer>("%ChoiceContainer");
		_portrait = GetNode<TextureRect>("%PortraitRect");
		_library = PortraitLibrary.Neutral();
		Hide();
	}

	/// <summary>Binds and shows the dialogue for <paramref name="session"/>.</summary>
	public void Open(DialogueSession session)
	{
		Close();
		_session = session;
		_bindings.Add(session.Speaker.Subscribe(speaker => _name.Text = speaker.Name));
		_bindings.Add(session.Portrait.Subscribe(key => _portrait.Texture = _library.Resolve(key)));
		_bindings.Add(session.Line.Subscribe(StartTypewriter));
		_bindings.Add(session.Choices.Subscribe(RebuildChoices));
		_bindings.Add(session.IsFinished.Subscribe(finished => { if (finished) Close(); }));
		Show();
	}

	public override void _Process(double delta)
	{
		if (!_typing) return;

		_revealed += CharactersPerSecond * (float)delta;
		_line.VisibleCharacters = (int)_revealed;
		if (_revealed >= _line.Text.Length)
		{
			CompleteLine();
		}
	}

	public override void _UnhandledInput(InputEvent @event)
	{
		var advance = @event.IsActionPressed("ui_accept")
			|| @event is InputEventMouseButton { Pressed: true, ButtonIndex: MouseButton.Left };
		if (!advance || _session is null) return;

		if (_typing)
		{
			CompleteLine();
		}
		else
		{
			_session.Advance();
		}
		GetViewport().SetInputAsHandled();
	}

	private void StartTypewriter(string line)
	{
		_line.Text = line;
		_line.VisibleCharacters = 0;
		_revealed = 0f;
		_typing = line.Length > 0;
	}

	private void CompleteLine()
	{
		_line.VisibleCharacters = -1;
		_typing = false;
	}

	private void RebuildChoices(ImmutableArray<DialogueChoice> choices)
	{
		foreach (var child in _choices.GetChildren())
		{
			child.QueueFree();
		}

		for (var index = 0; index < choices.Length; index++)
		{
			var captured = index;
			var button = new Button { Text = choices[index].Label };
			button.Pressed += () => _session?.Select(captured);
			_choices.AddChild(button);
		}

		_choices.Visible = choices.Length > 0;
	}

	private void Close()
	{
		foreach (var binding in _bindings)
		{
			binding.Dispose();
		}
		_bindings.Clear();
		_session = null;
		Hide();
	}

	public override void _ExitTree() => Close();
}
