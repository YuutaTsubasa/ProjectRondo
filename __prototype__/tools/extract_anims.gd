extends SceneTree

const SRC := {
	"Idle": "res://Assets/Animations/Idle.fbx",
	"Walk": "res://Assets/Animations/Walking.fbx",
	"Run": "res://Assets/Animations/Running.fbx",
	"Jump": "res://Assets/Animations/Jump.fbx",
}
# Jump is a one-shot arc (crouch, launch, land); looping it would snap the knight
# back to the crouch mid-air. Every other clip is a cycle.
const NON_LOOPING := ["Jump"]
# Inward thigh correction to counter the model's wide A-stance rest pose.
const ADDUCT_DEG := -5.0
const L_THIGH := "Skeleton3D:LeftUpperLeg"
const R_THIGH := "Skeleton3D:RightUpperLeg"

# Foot calibration is applied to the exported GLB by tools/knight-feet/calibrate.mjs.
# The former +20 degree parent-space rotation pointed the toes DOWN. Do not bake it again.

# World fore-aft (Z) axis expressed in the thighs' parent frame; the true adduction axis.
var _adduct_axis := Vector3(0, 0, 1)
func _initialize():
	var knight: Node = load("res://Assets/Characters/WebKnight/knight.fbx").instantiate()
	var ksk := _find(knight, "Skeleton3D") as Skeleton3D
	# `export_web_glb.gd` parents the baked AnimationPlayer directly on this same knight root, so every
	# track path below ("Skeleton3D:...", used verbatim from the source clips — see the loop) resolves
	# relative to `knight` at export time. That only holds if the skeleton really sits there; `_find`
	# locates *a* Skeleton3D anywhere in the tree, and would accept one nested under an Armature node
	# just as readily. Assert the path directly rather than assume it, so a future re-import that nests
	# the skeleton fails loudly here instead of exporting a GLB whose animations silently drive no bones.
	assert(
		String(knight.get_path_to(ksk)) == "Skeleton3D",
		"expected Skeleton3D directly under the knight root (export_web_glb.gd parents the AnimationPlayer there); got %s" % knight.get_path_to(ksk),
	)
	var pelvis := ksk.find_bone("CC_Base_Pelvis")
	var parent_basis: Basis = ksk.get_bone_global_rest(pelvis).basis if pelvis >= 0 else Basis()
	_adduct_axis = (parent_basis.inverse() * Vector3(0, 0, 1)).normalized()
	print("adduct axis (parent frame)=", _adduct_axis)

	var lib := AnimationLibrary.new()
	for name in SRC:
		var scene: Node = load(SRC[name]).instantiate()
		var ap := _find(scene, "AnimationPlayer") as AnimationPlayer
		var src_name: String = ap.get_animation_list()[0]
		var anim: Animation = ap.get_animation(src_name).duplicate()
		# Track paths in the source clips already read "Skeleton3D:...", which is exactly the path
		# asserted above for the export target — nothing to rewrite.
		anim.loop_mode = Animation.LOOP_NONE if name in NON_LOOPING else Animation.LOOP_LINEAR
		_adduct(anim, L_THIGH, 1.0)
		_adduct(anim, R_THIGH, -1.0)
		lib.add_animation(name, anim)
		print("added ", name, " tracks=", anim.get_track_count(), " len=", anim.length, " sample=", String(anim.track_get_path(0)))
	var err := ResourceSaver.save(lib, "res://Assets/Animations/KnightAnims.res")
	print("SAVED err=", err)
	quit()

func _adduct(anim: Animation, track_path: String, sign: float) -> void:
	var ti := anim.find_track(NodePath(track_path), Animation.TYPE_ROTATION_3D)
	# Same invariant as the Skeleton3D path assert in _initialize(): the very re-import that would
	# change this prefix out from under `_adduct` is the case that assert exists to catch loudly. A
	# silent `return` here would drop the -5° A-stance correction from all four clips while
	# `_initialize` still prints "added … tracks=…" and "SAVED err=0", with no other signal.
	assert(ti >= 0, "expected a ROTATION_3D track at %s to apply the A-stance correction; got none" % track_path)
	var dq := Quaternion(_adduct_axis, deg_to_rad(ADDUCT_DEG) * sign)
	for k in anim.track_get_key_count(ti):
		var q: Quaternion = anim.track_get_key_value(ti, k)
		anim.track_set_key_value(ti, k, (dq * q).normalized())

func _find(node: Node, cls: String) -> Node:
	if node.is_class(cls):
		return node
	for c in node.get_children():
		var r := _find(c, cls)
		if r != null:
			return r
	return null
