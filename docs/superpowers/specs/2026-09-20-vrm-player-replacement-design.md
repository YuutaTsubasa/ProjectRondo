# V20 VRM player replacement — proposed design

Date: 2026-09-20. Status: approved by the owner on 2026-09-20; implementation in progress.

## Scope

Replace the 3D player in both the hub and climbing tower with the owner's V20 model.
The owner explicitly selected 3D-only replacement: AVG portraits stay as they are.
Keep existing movement, collisions, jump timing, homing attack, checkpoints and level routing.
Make subsequent model revisions repeatable through an import command that takes a source path.

## Inspected inputs

Source directory: `C:/Users/User/Repo/ProjectVtuber/projects/vrm-model/output/new-vtuber-v20`.

- `knight_new_vrm1.vrm`: 209,152,080 bytes, one 55-joint skin, 22 meshes, 14 materials,
  humanoid bone mapping in `VRMC_vrm`, MToon parameters in `VRMC_materials_mtoon`.
- `knight_new_vrm0.vrm`: 123,995,332 bytes, the same character in the older VRM format.
- The source README describes 52 facial expressions and the V20 shoulder-strap fixes.
- The inspected VRMs contain no game locomotion animations.
- Current `public/models/knight_web.glb`: 12,033,624 bytes, 100-joint skin, 42 meshes,
  one material and the existing Idle, Walk, Run, Jump and FlyingKick clips, plus a reference pose.

The source model's bones have different names and rest transforms. Renaming animation targets
alone is insufficient. Current face materials, shadow selection and offline boot calibration
also refer to the previous model's mesh names and must not be applied blindly to V20.

## Approaches

1. **Recommended: prepare a game asset from VRM before deployment.** Use VRM 1 as the canonical
   input because its humanoid map and material parameters are structured in the inspected file.
   Optimize texture payloads, map the existing animations to the new rest skeleton, and produce
   assets that the game's existing loader and animation driver can consume. Capture source hashes
   and conversion settings for later revisions. The source VRM remains untouched.
2. **Full VRM runtime.** Add a VRM loader/material integration, retain VRM-specific runtime features,
   and retarget clips at load time. This has a larger integration and maintenance surface; it is
   useful if live expressions, tracking or spring-bone behavior becomes a game requirement.
3. **Manual one-off conversion.** Export and retarget in a DCC tool for this revision only. It can
   produce a working model, but makes the next revision depend on repeating manual settings.

## Proposed behavior and asset contract

- Both levels continue to use `loadKnight` through the shared character rig.
- The new model has all five required clips with the names and playback semantics the animation
  driver expects. Retarget rotations using source and destination rest transforms, and account for
  body proportions in hip translation. Validate every required target; missing bones stop conversion
  with a named error rather than silently dropping a limb's tracks.
- Keep visual height at the existing 1.9 world-unit target. Verify forward orientation, sole height,
  animation blending, shoulder straps, and floor/platform contact against actual rendered poses.
- Preserve V20's face, hair, eyes, armor and texture colors. Do not apply the old armor roughness map
  to the new UV layout. Material mapping is specific to the imported material metadata, not old
  `Mesh_1` / `Mesh_23` names. MToon lighting and outlines need explicit adaptation: a normal GLB
  import alone does not constitute visual verification. Compare the result to the supplied neutral
  and posed reference images before accepting it; do not claim pixel-identical MToon rendering.
- The derivative may omit inactive facial morph targets to reduce game download and memory costs;
  preserve the neutral mesh and retain all expressions in the original source. Facial performance
  and new expression gameplay are outside this replacement.
- Reuse the current physics and gameplay numbers. Retire old-model visual corrections only where
  the new model makes them inapplicable; avoid changes to movement rules to compensate for art errors.

## Repeatable update workflow

Provide one documented command accepting a VRM source path. It validates the input, produces the
game asset in temporary storage, verifies the output, and only then replaces the active asset.
Record the source SHA-256, converter settings, bone map, clip set, and output SHA-256 in a receipt.
The app reads a single asset configuration containing its URL/version and relevant model metadata.
Future source revisions must either satisfy the same contract or fail with a useful explanation.
Runtime loading must use repository assets; it must not depend on the external ProjectVtuber path.

Do not edit the ProjectVtuber source files, export a modified VRM back into that project, or change
the original `.blend` files. The repository history retains the previous game model for rollback.

## Verification

1. Test bone mapping and rest-pose transfer with a deliberately rotated destination skeleton, not
   just identical source/destination transforms. Assert required clip coverage and finite transforms.
2. Verify the generated asset is binary GLB, all referenced textures are available, material groups
   resolve, and no required animation target was lost. Record byte size against the 12 MB old asset.
3. Run typecheck, relevant asset/animation/rig tests, the full suite, and production build.
   Existing baseline: 538/540 tests passed. The two portrait-asset failures are in unchanged AVG
   scope and arise in FFmpeg/ffprobe invocations on this machine; report them separately.
4. In a visible browser, inspect front/back/side appearance and idle, walk, run, jump and homing kick.
   Check feet on flat ground and pedestal/platforms, then enter and exit the tower. Inspect load
   errors and disposal. Record screenshots and measured frame costs at a stated resolution.
5. Repeat the import with the same source and compare receipts/output hashes. Document any tool
   nondeterminism rather than asserting reproducibility without evidence.

## Research references

The installed Babylon 9.21 declarations include `AnimatorAvatar.retargetAnimationGroup`, with
name mapping, rest-transform adjustment and root-position options. This is a candidate for reusing
engine-supported retargeting rather than maintaining an independent animation solver:
[Babylon animation retargeting](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/animation/animationRetargeting.md).

Full VRM integration is a distinct alternative, not an installed dependency. The inspected
[Babylon VRM port](https://github.com/h-yanagawa/babylon-vrm) documents MToon support and Babylon
8/9 peers, but requires building from its repository rather than installing published npm packages.
Any such dependency would need its own compatibility check before adoption.
