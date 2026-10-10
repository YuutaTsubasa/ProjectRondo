# Painterly Menu Portrait

User requests the existing ProjectVtuber painterly treatment over the entire live 3D character to harmonize with the illustrated background. Keep this presentation change in menu/Loading.

Reference: ProjectVtuber/projects/vrm-model/scripts/trial_painterly_portrait.py (native Blender material and masked anisotropic Kuwahara study). Port the cold-shadow/warm-light palette and UV-anchored fine grain; use a bounded edge-directed sector filter for real-time Babylon instead of claiming pixel equivalence with Blender. Apply to all body/hair/skin surfaces while protecting eye/mouth details through a per-material render mask. Preserve original model/UV/texture/bones/morphs and rendered alpha.

- [x] Test material categories, shared-material handling, untouched geometry/textures, and pipeline disposal.
- [x] Add presentation-only material plugin plus masked painterly postprocess, using existing imported materials.
- [x] Attach after menu material adaptation; retain the current Idle/blink/cameras.
- [x] Verify actual WebGL shaders, whole-body and close-up appearance, transparent edges, resize and disposal. Run focused tests, full regression, typecheck and build.

No changes to ProjectVtuber sources or gameplay renderer. No new AI images or texture edits.

Validation: focused tests passed, full suite 856/135 passed, typecheck clean, build passed. Real WebGL shaders and both compositions inspected.
