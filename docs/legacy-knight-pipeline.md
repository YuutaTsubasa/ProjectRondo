# Archived pre-V20 knight pipeline

Historical instructions only. The reference GLB now lives at `tools/knight-feet/reference.glb`. These material fixes are not part of the current player runtime.

### Regenerating the knight GLB

The knight model + retargeted animations live in the Godot prototype. Re-export and optimize with:

```bash
# 0. Rebuild the AnimationLibrary when a clip, .import, or extract_anims.gd changes.
#    Godot can serve a stale import — delete .godot/imported/<Name>.fbx-* first or the bone
#    renaming silently does not apply.
Godot --headless --path __prototype__ --import
Godot --headless --path __prototype__ --script res://tools/extract_anims.gd

# 1. Export a GLB (mesh + Idle/Walk/Run/Jump/FlyingKick) from Godot headless
Godot --headless --path __prototype__ --script res://tools/export_web_glb.gd

# 2. Texture-only optimization (do NOT simplify/quantize/resample — it corrupts the skeletal animation)
gltf-transform resize __prototype__/knight_web.glb /tmp/k.glb --width 1024 --height 1024
gltf-transform webp /tmp/k.glb /tmp/knight-uncalibrated.glb --quality 80

# 3. Level heel-to-toe pitch in rest/T-Pose/Idle and correct the ankle offset in every motion clip.
#    This took a third argument, a fixed pre-rotation in degrees; it has been removed and passing
#    one is now an error. Nothing in this repository bakes an ankle offset for it to cancel.
node tools/knight-feet/calibrate.mjs /tmp/knight-uncalibrated.glb public/models/knight_web.glb
node tools/knight-feet/verify.mjs /tmp/knight-uncalibrated.glb public/models/knight_web.glb
```

See [foot calibration and validation](docs/knight-foot-calibration.md) for the measurements and for
what was known about the retired pre-rotation argument.

Bump the `?v=N` query on the GLB URL in `src/presentation/babylon/knight.ts` after rebuilding so
browsers refetch it. Then delete the 68 MB `__prototype__/knight_web.glb` intermediate and the
`knight_web*.png` / `.import` side files Godot's next scan drops next to it.

**Known defect in the currently shipped GLB: the `gltf-transform` pass writes default-valued scalars
as `0` instead of omitting them, and at least three of them ship this way.** `extensionsUsed` includes
`KHR_materials_emissive_strength`, and the material's `pbrMetallicRoughness`/`extensions` blocks read:

- `normalTexture: {"index": 1, "scale": 0}` — the base commit's GLB had no `scale` key at all (the
  glTF spec default, 1); `0` zeroes out the armour's normal map entirely (`knight.ts`'s
  `correctSharedNormalScale` corrects it at load time, before `applyBodyPbr`/`applyFaceMaterial` ever
  run — see `source.bumpTexture.level` there — and warns when it has to).
- `extensions.KHR_materials_emissive_strength.emissiveStrength: 0` (spec default 1) — Babylon maps
  this straight to `emissiveIntensity = 0`, which trips `swapHeadMaterial`'s guard in `knight.ts` on
  every load and would zero `FACE_EMISSIVE` if that guard did not pin it back to 1.
- `pbrMetallicRoughness.metallicFactor: 0` (spec default 1) — `applyBodyPbr` overwrites `metallic` only
  from inside its metallic/roughness texture's `onLoad` callback (see `knight.ts`), so this `0` is still
  in force before that map arrives and stays in force forever on a permanently failed fetch; it is
  currently benign on both those paths only because the GLB ships no `roughnessFactor` key, so
  roughness stays at the spec default 1, and metallic 0 with roughness 1 reads matte. It is the same
  defect as the other two above and would surface the moment a regeneration or reorder changed that.

Because this is a systematic property of the export pass and not three coincidences, **no scalar in
this GLB should be trusted without checking it against the glTF spec default** — do not stop at
`normalTexture` when regenerating. Neither `export_web_glb.gd` nor `knight.fbx.import` sets any of
these anywhere, so the values are coming from somewhere in step 1 or 2 above that has not been isolated
(Godot's glTF exporter, or the `gltf-transform` pass itself). Check every scalar in the freshly
exported GLB's JSON chunk against its spec default before shipping a regeneration, and drop the
corresponding load-time correction in `knight.ts` once a regenerated file ships the correct defaults
(or no key at all) on its own.
