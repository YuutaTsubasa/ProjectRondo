extends SceneTree

# Headless exporter: bakes the retargeted Idle/Walk animations onto the knight and
# writes a single web-ready GLB (mesh + skeleton + AnimationGroups) for babylon.js.
# Run: godot --headless --path <__prototype__> --script res://tools/export_web_glb.gd

func _initialize() -> void:
	var knight: Node = load("res://Assets/Characters/WebKnight/knight.fbx").instantiate()

	var ap := AnimationPlayer.new()
	knight.add_child(ap)
	ap.owner = knight
	var lib: AnimationLibrary = load("res://Assets/Animations/KnightAnims.res")
	ap.add_animation_library("", lib)
	print("animations to export: ", ap.get_animation_list())

	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	var append_err := doc.append_from_scene(knight, state)
	print("append_from_scene err=", append_err)
	var write_err := doc.write_to_filesystem(state, "res://knight_web.glb")
	print("write_to_filesystem err=", write_err)
	quit()
