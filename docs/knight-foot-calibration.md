# Knight foot calibration (2026-09-06)

The runtime asset is `public/models/knight_web.glb`. It contains `Idle`, `Walk`, `Run`, `Jump` and the one-frame `0_T-Pose`.

## Cause and correction

The shoe geometry in the imported rest pose pointed approximately 10.8 degrees downward from heel to toe. The old `extract_anims.gd` then applied a +20 degree rotation around parent-rest X to both ankles in every motion clip. In this rig that direction lowers the toes. Measured Idle sole pitch was -32.81 degrees on the right and -32.40 degrees on the left.

The calibration first undoes the old 20-degree rotation when processing a legacy export. It then fits a constant rotation in each ankle's own local coordinates against 31 evenly spaced Idle poses. The same correction applies to all four motion clips, preserving their relative angular motion, interpolation, key times and crossfades. Rest and `0_T-Pose` are calibrated separately because they have different ankle rotations.

Only the two foot-node rotations and their ten animation rotation tracks change (739 quaternion keys). Mesh vertices, indices, skin weights, inverse bind matrices, textures, other bones and animation timing remain unchanged. The toe-weight asymmetry in the source was inspected but is not altered by this fix.

## Measurements

Pitch uses the world-space centroids of fixed heel and toe sole-surface vertices after full linear skinning, including both joint/weight sets. Positive values mean toes above heels. The identical original vertex IDs are used before and after.

| Pose | Original right / left | Corrected right / left |
| --- | --- | --- |
| Rest | -10.790 / -10.826 degrees | approximately 0 / 0 degrees |
| T-Pose | -0.842 / -0.889 degrees | approximately 0 / 0 degrees |
| Idle mean | -32.809 / -32.397 degrees | +0.001 / -0.003 degrees |
| Idle range | both near -32 degrees | right -0.389 to +0.328; left -0.497 to +0.428 degrees |

All four clips were sampled at 60 Hz (832 motion samples, plus rest and T-Pose). The verifier requires every rest/T-Pose/Idle measurement to remain within one degree of level. It also checks all motion measurements are finite, every corrected quaternion is normalized, per-key angular changes are preserved, all other animation tracks are identical, and every binary byte outside the corrected quaternion ranges is unchanged. There are 11,868,224 unchanged binary bytes. Maximum adjacent-key quaternion dot-product error was 8.22e-9.

Babylon previews were inspected for Idle, walking on each support leg, a running support pose, and airborne/landing jump poses. This validates the ankle/sole posture correction. It does not implement terrain IK or certify per-frame ground contact: the existing game's vertical seating/terrain logic still owns placement, and normal toe-off and airborne foot pitch remain in the source motions.

## Rebuilding

Follow the README export recipe, including re-running `extract_anims.gd` after this change. The existing `KnightAnims.res` is a cached generated file and may still contain the legacy offset until regenerated.

For a newly exported, texture-optimized GLB from the updated extractor:

```powershell
node tools/knight-feet/calibrate.mjs path/to/raw.glb path/to/fixed.glb 0
node tools/knight-feet/verify.mjs path/to/raw.glb path/to/fixed.glb
```

For an older export made by the previous +20-degree extractor, use `20` as the last calibration argument. The installed asset was produced in that legacy mode. Do not select `20` for a newly rebuilt animation library.

The script refuses an already calibrated GLB. Calibration data and the selected legacy offset are recorded under `asset.extras.knightFootCalibration`. It is specific to the current knight meshes and bone convention; changing character geometry requires renewed measurements and visual review.

The pre-fix working files are backed up under `.superpowers/knight-feet-before-2026-09-06/`, including the GLB, runtime loader, extractor and README. These are the user's actual working files, not versions reset from Git. The current loader uses `?v=10` to refetch the corrected GLB.
