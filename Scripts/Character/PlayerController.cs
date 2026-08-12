using Godot;
using ProjectRondo.Controls;
using ProjectRondo.Domain.Hub.Character;
using ProjectRondo.Domain.Kernel;
using ProjectRondo.Utils;
using R3;

namespace ProjectRondo.Character;

/// <summary>
/// Drives the third-person hub character. Raw input is translated into an engine-agnostic
/// <see cref="MovementInput"/>, the pure <see cref="CharacterMovement"/> domain computes the next
/// <see cref="CharacterMotion"/>, and the result is applied to this <see cref="CharacterBody3D"/>.
/// </summary>
public partial class PlayerController : CharacterBody3D
{
	private const float MouseSensitivity = 0.005f;
	private const float MinPitch = -1.2f;
	private const float MaxPitch = 0.6f;
	private const float TurnSpeed = 12f;

	private readonly MovementConfig _config = MovementConfig.Default;
	private readonly ReactiveProperty<bool> _isGrounded = new(true);

	private Node3D _visual = null!;
	private SpringArm3D _springArm = null!;
	private Vector2 _facing = new(0f, -1f);
	private float _yaw;
	private float _pitch = -0.35f;

	/// <summary>Emits whenever the grounded state changes; a reactive seam for future gameplay reactions.</summary>
	public ReadOnlyReactiveProperty<bool> IsGrounded => _isGrounded;

	public override void _Ready()
	{
		InputBindings.Ensure();
		_visual = GetNode<Node3D>("Visual");
		_springArm = GetNode<SpringArm3D>("SpringArm");
		_springArm.Rotation = new Vector3(_pitch, _yaw, 0f);
		Input.MouseMode = Input.MouseModeEnum.Captured;
	}

	public override void _ExitTree() => _isGrounded.Dispose();

	public override void _Input(InputEvent @event)
	{
		switch (@event)
		{
			case InputEventMouseMotion motion when Input.MouseMode == Input.MouseModeEnum.Captured:
				RotateCamera(motion.Relative);
				break;
			case InputEventKey { PhysicalKeycode: Key.Escape, Pressed: true }:
				Input.MouseMode = Input.MouseModeEnum.Visible;
				break;
		}
	}

	public override void _PhysicsProcess(double delta)
	{
		var step = (float)delta;
		var motion = CharacterMovement.Step(CurrentMotion(), ReadInput(), _config, step);

		Velocity = motion.Velocity.ToGodot();
		MoveAndSlide();

		_facing = motion.Facing.ToGodot();
		_isGrounded.Value = IsOnFloor();
		FaceMovement(step);
	}

	private CharacterMotion CurrentMotion() =>
		new(Velocity.ToNumerics(), _facing.ToNumerics(), IsOnFloor());

	private MovementInput ReadInput()
	{
		var axis = Input.GetVector(InputBindings.MoveLeft, InputBindings.MoveRight, InputBindings.MoveForward, InputBindings.MoveBack);
		var jump = Input.IsActionJustPressed(InputBindings.Jump);

		return new MovementInput(PlanarDirectionFrom(axis), jump);
	}

	private NormalizedPlanarDirection PlanarDirectionFrom(Vector2 axis)
	{
		if (axis == Vector2.Zero) return NormalizedPlanarDirection.None;

		var basis = _springArm.GlobalTransform.Basis;
		var world = FlattenAndNormalize(basis.X) * axis.X - FlattenAndNormalize(-basis.Z) * axis.Y;

		return NormalizedPlanarDirection.From(new System.Numerics.Vector2(world.X, world.Z));
	}

	private void FaceMovement(float delta)
	{
		var target = Mathf.Atan2(-_facing.X, -_facing.Y);
		_visual.Rotation = _visual.Rotation with { Y = Mathf.LerpAngle(_visual.Rotation.Y, target, TurnSpeed * delta) };
	}

	private void RotateCamera(Vector2 relative)
	{
		_yaw -= relative.X * MouseSensitivity;
		_pitch = Mathf.Clamp(_pitch - relative.Y * MouseSensitivity, MinPitch, MaxPitch);
		_springArm.Rotation = new Vector3(_pitch, _yaw, 0f);
	}

	private static Vector3 FlattenAndNormalize(Vector3 value) => new Vector3(value.X, 0f, value.Z).Normalized();
}
