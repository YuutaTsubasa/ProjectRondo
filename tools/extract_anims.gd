extends SceneTree

const SRC := {
	"Idle": "res://Assets/Animations/Idle.fbx",
	"Walk": "res://Assets/Animations/Walking.fbx",
}
const FROM := "Skeleton3D:"
const TO := "Armature/Skeleton3D:"
# Inward thigh correction to counter the model's wide A-stance rest pose.
const ADDUCT_DEG := -5.0
const L_THIGH := "Armature/Skeleton3D:LeftUpperLeg"
const R_THIGH := "Armature/Skeleton3D:RightUpperLeg"

# World fore-aft (Z) axis expressed in the thighs' parent frame; the true adduction axis.
var _adduct_axis := Vector3(0, 0, 1)

func _initialize():
	var knight: Node = load("res://Assets/Characters/Knight/knight.glb").instantiate()
	var ksk := _find(knight, "Skeleton3D") as Skeleton3D
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
		for i in anim.get_track_count():
			var p := String(anim.track_get_path(i))
			if p.begins_with(FROM):
				anim.track_set_path(i, NodePath(TO + p.substr(FROM.length())))
		anim.loop_mode = Animation.LOOP_LINEAR
		_adduct(anim, L_THIGH, 1.0)
		_adduct(anim, R_THIGH, -1.0)
		lib.add_animation(name, anim)
		print("added ", name, " tracks=", anim.get_track_count(), " len=", anim.length, " sample=", String(anim.track_get_path(0)))
	var err := ResourceSaver.save(lib, "res://Assets/Animations/KnightAnims.res")
	print("SAVED err=", err)
	quit()

func _adduct(anim: Animation, track_path: String, sign: float) -> void:
	var ti := anim.find_track(NodePath(track_path), Animation.TYPE_ROTATION_3D)
	if ti < 0:
		return
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
