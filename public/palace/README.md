# White Palace source assets

White Palace 1-1 is adapted from [ProjectAlmost](https://github.com/YuutaTsubasa/ProjectAlmost), pinned to revision `76b9ca1c680e98e27ac9f51871bf4feffb3f0bbc`.

- Layout: `src/domain/gameplay/gameplayStageSources.ts`, entry `1-1`. The 9600 × 1080 source stage contains 16 platforms, 8 guards, 25 coins and 3 checkpoints. Rondo maps 50 source pixels to one world unit and converts surface height with `(512 - y) / 50`.
- Backgrounds: `public/assets/maps/white_palace_{sky,far_bg,mid_bg_loop}.webp`.
- Platform detail: `public/assets/tiles/white_palace_platform_tiles.webp`.
- Imported reference props: `public/assets/props/white_palace_checkpoint.webp` and `white_palace_goal_idle.webp`. The current scene uses 3D checkpoint and goal structures instead of displaying these two sprites.
- Music: `public/assets/audio/world01_bgm.mp3`; effects: `public/assets/audio/sfx/{coin,hit,checkpoint,goal}.wav`.
- Enemy model: local `3DModel/knight-parkour/dist/assets/knight.glb`, copied as `guard.glb`; 59 joints with Idle, Run and Jump clips. The player continues using Rondo's configured v20 model and equipment.

`source-receipt.json` records the source revision, original knight path, byte sizes and SHA-256 hashes. This file documents provenance; it does not grant or change the source assets' licensing.

To reproduce the import from the repository root, with authenticated GitHub CLI access and the local model available:

```powershell
node tools/palace/import.mjs "C:/Users/User/Repo/3DModel/knight-parkour/dist/assets/knight.glb"
```

The importer reads pinned source files through GitHub's base64 contents/blob APIs to preserve binary bytes on Windows. Source projects are not modified. Updating the source revision intentionally requires checking the layout, receipt and traversal tests again.
