# Player model game derivative

The authoring VRM stays outside this repository. The game loads `public/models/player-v20.glb`; its matching JSON receipt records the input/output checksums and all conversion settings.

## Update the player

From the project root, with dependencies installed:

```powershell
node tools/player-model/import.mjs C:/path/to/new-model.vrm
node tools/player-model/verify.mjs C:/path/to/new-model.vrm
pnpm test tests/tools/playerModel.test.ts tests/tools/playerBlinkImport.test.ts tests/presentation/playerModelAsset.test.ts
```

An optional second argument selects a different output `.glb`. Its receipt uses the same basename. Review the five animations in the game before shipping an updated model. In particular, retargeting preserves motion and timing but cannot guarantee foot contact across different body proportions.

The importer preserves neutral positions, normals, UVs, indices, joint weights and inverse bind matrices. It retains only the original continuous VRM1 preset `blink`, combining its weighted POSITION/NORMAL/TANGENT deltas into one `playerBlink` target per participating primitive. All targets start at zero (open eyes); one shared influence from 0 to 1 closes all bound face/eye/mouth pieces together. Other expression targets and unused data are removed, and resizes textures to at most 2048 pixels using WebP quality 90. It does not decimate or quantize geometry. glTF-Transform may omit rest-transform components within float precision of identity; verification allows 1e-6 for TRS while requiring exact geometry and skin accessor bytes.

`animations.glb` is the immutable, render-free donor: 26 skeleton nodes and the original Idle, Walk, Run, Jump and FlyingKick curves. Importing a new VRM never reads the currently active player as its donor. Its provenance records the archived original's SHA256. The one-time `--extract-donor <original.glb>` mode refuses to replace an existing donor. It removes RL_BoneRoot's known corrupt orientation channel and undoes the old mesh's embedded ankle calibration before extracting motion; those shoe-specific offsets are not applied to this player.

Rotations transfer through each rig's parent and bone rest-world frames. The target keeps its own neutral bone axes and proportions. Hips displacement from the donor rest position is scaled by the target/source hips height ratio; key times and interpolation stay unchanged. Unmapped animated bones fail conversion.

The importer classifies materials through explicit mesh roles: `Armor` is body; named face, hair, eye, neck and mouth pieces are head. A future unknown mesh name fails with a request to update this policy. MToon factors are retained in `material.extras.playerMaterial`; base-color factors/textures remain ordinary glTF material data. Unsupported active rim effects, UV animation, shade-shift textures, independent shade textures, non-world outlines and transparency fail conversion. Authoring VRM extension blocks are removed. The safe baseline remains unlit; the game's material adapter applies its toon lighting.

`asset.extras.playerModel` contains schema version, hips/root names, orientation, material roles, humanoid bone map, donor/source hashes, motion scale and settings. The sidecar adds output SHA256, byte count, texture sizes and clip durations. Conversion checks references, clip presence, finite accessors and increasing key times before publishing. Each file is written to a temporary sibling and renamed into place; the GLB and receipt are not a two-file transaction. Compare the receipt checksum if a run was interrupted between the two renames. Repeated runs with the same inputs and dependency lockfile are byte-identical.

The Windows dependency override keeps direct and glTF-Transform's transitive sharp versions aligned; loading two libvips versions in one process can break encoding. Keep that alignment when upgrading dependencies.

## Relaxed gameplay pose

After retargeting, `relaxedPose.mjs` widens the V20 idle stance by 4.5 degrees per hip and counter-rotates
the ankles to limit boot roll. Walking and running use 6.6-degree hip spread plus ankle roll
compensation and a 12-degree outward foot-heading correction. This counters the narrow/crossing
foot paths produced by transferring the old rig to the V20 straight bind legs. Jump and kick curves,
upper-body curves and original key times remain unchanged.
The donor has no finger animation: constant relaxed curls are added to each clip for available VRM
finger joints (30/45/20 degrees, thumb 8/12/8). Authored finger tracks take precedence if supplied by a
future donor. This changes animation curves only, retaining the neutral mesh, bind transforms and
immutable donor. These authoring-world-axis settings suit the current V20 T-pose and must be visually
reviewed for future models. The receipt records the settings and the updated asset hash.

## Blink import policy

A source must contain a nonempty VRM1 preset `blink` with finite morph weights in [0,1]. Binary, material-color, texture-transform, instanced-mesh, invalid accessor and missing target bindings fail clearly. Sparse morph accessors are expanded before weighted consolidation. The source file is never modified. Neutral mesh data, bind transforms, skeletal retargeting and the relaxed pose are unchanged by blinking.

The receipt records the source preset, source bind count, affected node names and output primitive count; `settings.morphTargets` is `preset-blink-only`. `verify.mjs` independently reads every original blink binding and compares its weighted closed-eye delta arrays with the output, in addition to checking exact neutral geometry and skin data. Review fully open/closed eyes and automatic blinks after each source update, checking lashes, irises, sclera and face details together. The durable runtime target name is `playerBlink`; do not rename it without updating the scene adapter.

## Mouth material seam

V20's rebuilt lip patch shares positions and normals with the lower-face surface but uses a different color texture. `lipSeam.mjs` records a local vertex color blend on both sides of that boundary, with a 6mm fade and neighboring skin samples. It adds linear RGB plus a blend weight to COLOR_0; the game material adapter interprets alpha as a surface weight, not opacity. A separate shader varying preserves that weight while vertex transparency is disabled. Face silhouette outlines are disabled on these two surfaces to avoid redrawing the internal split; hair and armor outlines remain.

This is a game derivative correction. Original images, UVs, material factors, geometry, skin weights, morphs and the source VRM are unchanged. The existing source verifier still checks them. The receipt records the correction version, materials and boundary count, and the runtime URL changes with the generated hash. Other source models without this exact material pair are left alone and require visual review.
