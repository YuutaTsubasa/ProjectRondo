extends SceneTree

func _initialize():
	DirAccess.make_dir_recursive_absolute("res://Assets/Retarget")
	_make("res://Assets/Retarget/cc_base_humanoid.tres", {
		"Hips": "CC_Base_Hip", "Spine": "CC_Base_Waist", "Chest": "CC_Base_Spine01",
		"UpperChest": "CC_Base_Spine02", "Neck": "CC_Base_NeckTwist01", "Head": "CC_Base_Head",
		"LeftShoulder": "CC_Base_L_Clavicle", "LeftUpperArm": "CC_Base_L_Upperarm",
		"LeftLowerArm": "CC_Base_L_Forearm", "LeftHand": "CC_Base_L_Hand",
		"RightShoulder": "CC_Base_R_Clavicle", "RightUpperArm": "CC_Base_R_Upperarm",
		"RightLowerArm": "CC_Base_R_Forearm", "RightHand": "CC_Base_R_Hand",
		"LeftUpperLeg": "CC_Base_L_Thigh", "LeftLowerLeg": "CC_Base_L_Calf",
		"LeftFoot": "CC_Base_L_Foot", "LeftToes": "CC_Base_L_ToeBase",
		"RightUpperLeg": "CC_Base_R_Thigh", "RightLowerLeg": "CC_Base_R_Calf",
		"RightFoot": "CC_Base_R_Foot", "RightToes": "CC_Base_R_ToeBase",
	})
	_make("res://Assets/Retarget/mixamo_humanoid.tres", {
		"Hips": "mixamorig_Hips", "Spine": "mixamorig_Spine", "Chest": "mixamorig_Spine1",
		"UpperChest": "mixamorig_Spine2", "Neck": "mixamorig_Neck", "Head": "mixamorig_Head",
		"LeftShoulder": "mixamorig_LeftShoulder", "LeftUpperArm": "mixamorig_LeftArm",
		"LeftLowerArm": "mixamorig_LeftForeArm", "LeftHand": "mixamorig_LeftHand",
		"RightShoulder": "mixamorig_RightShoulder", "RightUpperArm": "mixamorig_RightArm",
		"RightLowerArm": "mixamorig_RightForeArm", "RightHand": "mixamorig_RightHand",
		"LeftUpperLeg": "mixamorig_LeftUpLeg", "LeftLowerLeg": "mixamorig_LeftLeg",
		"LeftFoot": "mixamorig_LeftFoot", "LeftToes": "mixamorig_LeftToeBase",
		"RightUpperLeg": "mixamorig_RightUpLeg", "RightLowerLeg": "mixamorig_RightLeg",
		"RightFoot": "mixamorig_RightFoot", "RightToes": "mixamorig_RightToeBase",
	})
	quit()

func _make(path: String, mapping: Dictionary) -> void:
	var bm := BoneMap.new()
	bm.profile = SkeletonProfileHumanoid.new()
	for profile_bone in mapping:
		bm.set_skeleton_bone_name(profile_bone, mapping[profile_bone])
	var err := ResourceSaver.save(bm, path)
	print("saved ", path, " err=", err)
