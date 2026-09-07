# Knight foot calibration (2026-09-07)

The runtime asset is `public/models/knight_web.glb`. It contains `Idle`, `Walk`, `Run`, `Jump`, `FlyingKick` and the one-frame `0_T-Pose`.

## Cause and correction

The shoe geometry in the imported rest pose points approximately 10.8 degrees downward from heel to toe, and the retargeted `Idle` compounds that to about -13.2 degrees: the knight stands on his heels with his toes in the air. Every clip is retargeted mocap baked into one exported GLB, so there is nothing upstream in this repository to fix — the correction is applied to the exported file.

For each ankle, `tools/knight-feet/calibrate.mjs` fits the single constant rotation, in that ankle's own local coordinates, that drives the mean sole pitch to zero, and composes it with the ankle's rest rotation and with every key of every rotation track that targets it. A constant rotation composed with each key preserves the clip as motion: key times, interpolation mode, the angular step between adjacent keys, and therefore the crossfades the runtime builds from them. Rest, `0_T-Pose` and the motion clips are fitted separately, because they do not share an ankle rotation; the motion fit is taken over 31 evenly spaced `Idle` poses and applied to every motion clip.

Only the two foot-node rotations and their twelve animation rotation tracks change (828 quaternion keys). Mesh vertices, indices, skin weights, inverse bind matrices, textures, other bones and animation timing remain unchanged. The toe-weight asymmetry in the source was inspected but is not altered by this fix.

## The pre-rotation argument, and what is not known about it

`calibrate.mjs` takes a third argument: a fixed pre-rotation in degrees, which left-multiplies every motion-clip ankle key by a rotation of `-degrees` about parent-frame X before the constant correction is fitted and applied. **The shipped GLB is built with `0`**, recorded in its own `asset.extras.knightFootCalibration.undoParentPitchDegrees`. An earlier build of this asset used `20`.

An earlier version of this document, of `calibrate.mjs` and of the README explained that `20` as undoing a "+20 degree" ankle rotation baked by a previous `extract_anims.gd`. **That explanation is withdrawn.** No revision of `__prototype__/tools/extract_anims.gd` in this repository's history applies any ankle or foot rotation. Checked on every branch, and back through the rename that moved the script under `__prototype__/tools/`: every revision constructs exactly one rotation quaternion, the -5 degree `ADDUCT_DEG` thigh correction the script still carries. There is nothing here for the `20` to undo, and where it came from is not recorded anywhere in this repository. It is a fixed pre-rotation that the shipped asset happens to have been built with, and nothing more.

**A fresh export uses `0`, and this one did.** Re-exporting for the homing attack's `FlyingKick` clip settled the question the paragraph above could not: the fresh export's `Idle` sole sits at **-13.2 / -12.6 degrees**, where the export the `20` build came from sat at **-32.8 / -32.4**. The difference is almost exactly the 20 degrees that mode was compensating — so the old *file* really did carry an extra parent pitch, even though no committed revision of `extract_anims.gd` puts one there. What produced it is still not recorded anywhere in this repository; what is now certain is that an export from the committed pipeline does not need it.

The earlier note compared the two modes on a reconstruction of that older export, and its figures are kept below as a record of that comparison. They describe an input this repository can no longer produce.

| Clip | Largest per-sample sole-pitch difference, `20` vs `0` |
| --- | --- |
| Rest, `0_T-Pose` | 0 (the pre-rotation never reaches them) |
| Idle | 0.30 degrees |
| Walk | 1.75 degrees |
| Jump | 2.11 degrees |
| Run | **2.73 degrees** (the worst case anywhere) |

`0` is the smaller intervention: it applies only the fitted local correction, where `20` also rewrites every motion key with a pre-rotation nothing in this repository asks for. `20` is kept reachable solely so the shipped asset can be reproduced from its source export.

## Measurements

Pitch uses the world-space centroids of fixed heel and toe sole-surface vertices after full linear skinning. Positive values mean toes above heels. The identical original vertex IDs are used before and after.

| Pose | Original right / left | Corrected right / left |
| --- | --- | --- |
| Rest | -10.790 / -10.826 degrees | 1.5e-8 / -5.8e-8 degrees |
| T-Pose | -0.842 / -0.889 degrees | 1.8e-6 / -6.9e-7 degrees |
| Idle mean | -13.246 / -12.608 degrees | +0.0007 / -0.0026 degrees |
| Idle range | right -13.634 to -12.923; left -12.992 to -12.216 | right -0.389 to +0.328; left -0.497 to +0.428 degrees |

All five motion clips were sampled at 60 Hz, plus rest and T-Pose. The verifier requires every rest/T-Pose/Idle measurement to remain within one degree of level. It also checks all motion measurements are finite, every corrected quaternion is normalized, per-key angular changes are preserved, all other animation tracks are identical, and every binary byte outside the corrected quaternion ranges is unchanged. There are 11,887,720 unchanged binary bytes across 828 corrected keys in 12 channels, and the maximum adjacent-key quaternion dot-product error is 7.0e-9.

Babylon previews were inspected for Idle, walking on each support leg, a running support pose, and airborne/landing jump poses. This validates the ankle/sole posture correction. It does not implement terrain IK or certify per-frame ground contact: the existing game's vertical seating/terrain logic still owns placement, and normal toe-off and airborne foot pitch remain in the source motions.

## Guarding it

`tests/presentation/knightFootCalibration.test.ts` re-measures the shipped GLB on every `pnpm test` run: it reads `asset.extras.knightFootCalibration` off the file and, more importantly, re-skins both boots and asserts the rest, `0_T-Pose` and `Idle` soles are still level. `verify.mjs` and `integrity.mjs` are the deeper checks, but they need the uncalibrated intermediate, which is never committed — so they can only be run by hand at rebuild time, and the test is what stands between an uncalibrated export and a `?v` bump.

## Rebuilding

Follow the README export recipe. For a newly exported, texture-optimized GLB:

```powershell
node tools/knight-feet/calibrate.mjs path/to/raw.glb path/to/fixed.glb 0
node tools/knight-feet/verify.mjs path/to/raw.glb path/to/fixed.glb
```

Pass `20` only to reproduce the shipped asset from its own source export; see the section above.

The script refuses an already calibrated GLB. Calibration data and the selected pre-rotation are recorded under `asset.extras.knightFootCalibration`. It is specific to the current knight meshes and bone convention; changing character geometry requires renewed measurements and visual review, and `tools/knight-feet/sole.mjs`'s hard-coded boot mesh names and vertex thresholds are the first thing that will stop matching.
