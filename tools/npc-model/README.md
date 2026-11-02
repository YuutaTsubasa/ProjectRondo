# NPC model game derivative

Member characters enter the game as NPCs. Their authoring VRM stays in ProjectVtuber; the game loads a GLB derivative from `public/models/` whose JSON receipt records the source and output SHA-256, the humanoid bone map, look-at range, morph targets and conversion settings.

## Current NPCs

| Runtime file | Character | Source |
| --- | --- | --- |
| `public/models/ichimoku-gen.glb` | 一目元 (member01), host of 白石台麻館 | ProjectVtuber `projects/character-models/ichimoku-gen/vrm/ichimoku-gen_v03_vrm1.vrm` (SHA-256 `51cae21c…dca5`) |

## Update

```powershell
node tools/npc-model/import.mjs C:/path/to/model_vrm1.vrm [public/models/<name>.glb]
pnpm test tests/presentation/ichimokuModelAsset.test.ts
```

Unlike the player importer there is no retargeting: an NPC keeps its own skeleton and the scene poses it procedurally (`src/presentation/parlor/ichimokuMotion.ts`). The importer drops the authoring-only `VRMC_vrm`, `VRMC_springBone` and `VRMC_materials_mtoon` blocks (MToon falls back to the glTF unlit base color it already carries), keeps the skin, every node and the source morph targets, and re-encodes textures as WebP capped at 1024 px. Geometry is not decimated or quantized. The receipt hash changes the runtime URL automatically.

Review the character in the parlor after every update: hover height, tentacle sway, the eye following the player within the VRM look-at range, and blinking.
