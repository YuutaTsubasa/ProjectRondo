# White Palace mahjong parlor and 一目元 — design

## Goal

Make one White Palace townhouse enterable as a Taiwanese mahjong parlor (白石台麻館) with the first member character, 一目元 (member01), as its NPC. Rondo adds new members only; the Virtual series keeps its cast. Playable mahjong is out of scope (a later arcade cabinet may embed the Virtual web game).

## Decisions

- **House:** `east-house-1`, the middle east townhouse on Ivory Street. Its street-facing door is in the centre of the town walk, between the gate and the tower square. The entrance spot stands 4.6 m in front of the house centre, clear of the sidewalk lamp.
- **Interior as its own scene, hosted by RegionWorld.** The town exterior has no modelled interior and the generated house mesh has no inside. A separate 12 × 10 m room scene is simpler than hiding a room inside the region physics world, and reusing `RegionWorld` keeps the existing readiness, pause, hidden-tab and paused-resize handling. The parlor scene implements `RegionScene` with no-op water and objective markers.
- **Update 2026-11-03 (user decision): no loading page.** The room now lives inside the region world at a far, enclosed offset and the door is a short fade plus teleport. This supersedes the two bullets below.
- **Transitions follow expeditions:** `RegionSession` changes `mode` to `parlor` and bumps the epoch; the loading page covers the swap. While indoors the region save keeps the door as the safe position. Leaving spawns at the door facing the street (the default south-facing camera would sit inside the sidewalk trees).
- **NPC model:** the VRM stays in ProjectVtuber, as the player VRM does. A small importer writes a GLB derivative (VRM extensions removed, WebP textures ≤1024 px, skeleton and eyelid morphs kept) plus a receipt. The VRM has no clips, so the scene poses it procedurally.
- **Dialogue:** `.dlg` files under `content/dialogue/parlor/`. First talk introduces 一目元; later talks rotate three topics. Talks never touch chapter progress; a separate validated LocalStorage count (`rondo.parlor.v1`) remembers the introduction.
- **Character:** adult, lewd, earnest to a fault, lazy, and calmly tells obvious lies. Lines stay mild (no explicit content). It claims to be the parlor owner.

## Testing

- Domain: entrance/return geometry against the town layout, room bounds, table/chair layout and clear aisle, spot detection, recovery, talk rotation.
- Content: graphs valid, only the two speakers, every route terminates.
- App: RegionSession enters, talks, leaves and returns to the gate with fixture worlds; RegionWorld builds the parlor scene for `interior="parlor"`; talk count save.
- Presentation: room colliders keep the door-to-host walk clear and close every wall (NullEngine); procedural motion bounds; NPC asset receipt/URL contract.
- Browser: door prompt, enter, plaque/sign legibility, talk, leave facing the street, no console errors.
