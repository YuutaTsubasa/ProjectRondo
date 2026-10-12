# WhitePalace modular model wishlist

The current slice is playable outdoor city blockout art. Preserve the bright ivory stone, blue slate and banners, warm wood, planted terraces and clear sea views of a coastal Japanese RPG town. Buildings have closed decorative doors; no asset in this list implies a playable interior.

## Reused now

- `public/town/house.glb`, `shop.glb`, `tower.glb`, `gate.glb`, `arcade.glb`: existing imported building set, instanced from the same containers in the old town and overlook. Keep these available until replacements pass visual and collision QA.
- Authored district building shells, pitched roofs, window surrounds, blue awnings, shared limestone textures, benches and planting: procedural geometry already placed in the market, residential quarter and royal forecourt.
- Shared terrace and ramp surfaces: these are the authoritative ground for visible paving, Havok collision and player height. Do not replace them with an uneven generated ground slab.
- New batched street detail kit: citrus counters, shutters, shop emblems, blue banners, benches, shrub planters, lanterns and flush drainage trim. These are usable placeholders, not newly commissioned Tripo models. Lantern glow is material emission; no additional point lights.

## Generate or commission next

Dimensions are width × depth × height in metres. Each item is a separate reusable module, not a complete city generated in one mesh. Priorities describe visual impact and replacement order.

| Priority | Module | Target envelope | Needed variants and use | LOD0 triangle target |
| --- | --- | --- | --- | --- |
| P0 | Coastal shop frontage kit | 6 × 1 × 4 | Two plaster/limestone façades with framed display windows, closed 1.6 m door, separate timber sign; tile two across a 12 m block. Avoid painted lettering. | 4,000 per façade |
| P0 | Blue canvas awning | 5 × 2.6 × 0.7 | Plain and striped cloth; separate wall brackets and optional slim poles. Keep lowest cloth above 2.8 m when installed. | 1,200 |
| P0 | Produce counter / crate kit | 3 × 1.15 × 1.5 | Citrus, bread and pottery variants, plus one empty crate. Keep fruit clustered in one mesh/material atlas. Preserve door access and street width. | 1,500 per stocked counter |
| P0 | Residential façade kit | 6 × 0.8 × 5 | Two window/shutter/balcony treatments, closed doors, continuous cornice. Balconies are façade decoration above pedestrian head height. | 4,000 |
| P1 | Street lantern with banner bracket | 1.5 × 0.6 × 4.3 | Brass/painted iron, warm frosted lantern, detachable blue cloth; one shared emissive mask. No baked surrounding light or shadow. | 1,200 |
| P1 | Stone planter and shrub | 2.4 × 1.6 × 1.35 | Rectangular planter, low evergreen foliage; separate compact cypress variant for larger existing planters. | 1,500 |
| P1 | Timber and iron bench | 3 × 1.05 × 1.25 | Sea-facing and courtyard versions with the same footprint; seat height 0.55 m. | 1,000 |
| P1 | Corner/cornice/roof kit | 3 × 1 × 1 per trim piece | Straight, inner/outer corner, 6 m roof slope and ridge sections; shared blue slate texture. | 800 per trim piece |
| P2 | Royal forecourt column / arch | 4 × 1 × 6 | Limestone with restrained blue/gold accent, matching straight coping. Real open arch aperture, no opaque backing. Keep route apertures at least 3 m wide and 3 m high. | 3,000 |
| P2 | Drain, curb and paving decals | 3 × 0.3 × 0.03 | Grate, joint and worn stone variation. Flat overlays with no decorative physics; do not form steps across the ramps. | 150 |
| P2 | Palace silhouette roof/tower kit | 10 × 10 × 20 | Distant roof, turret and spire pieces matching the existing ivory/blue skyline; preserve the forecourt view. | 3,000 |

## Delivery contract for Tripo output and manual cleanup

- Export GLB in metres, Y up, front toward +Z, transforms applied, scale 1. Place the root pivot at ground-centre `(0, 0, 0)`; façade/awning attachment modules additionally include a wall-centre attachment marker. Keep all installed offsets in scene placement data.
- Deliver clean closed solids for masonry, timber, crates and furniture. Remove internal floating fragments, intersecting debris, stray vertices, duplicate surfaces and inverted normals. Cloth is a thin closed shell with a finished back; arches have actual openings and thickness. Inspect both sides instead of relying on globally disabled back-face culling.
- Keep dimensions and silhouette consistent between variants. Avoid scan-like lumpy walls and melted window geometry. Use straight plinths and aligned cornices so modules snap on a 0.5 m grid. Drain overlays have a flush lower face.
- Supply a separate simplified collision proxy: one box for a bench/counter/planter, one narrow box or capsule for a lamp, and a few boxes for an architectural shell. Keep overhead awnings outside the walking envelope. Do not use the high-detail render mesh as static convex collision or seal an arch opening with a single box. Ground-level collision must start at the authored surface height; matching camera bounds must cover solid architecture.
- Target one material per small prop, at most two per façade, shared 1024 px atlases where possible. Deliver base colour, normal and packed ORM maps; 2048 px only when justified by a close-view façade. No embedded lighting, camera, animation or environment maps. Avoid alpha-blended foliage; prefer opaque stylized clumps or restrained alpha-test cards.
- Supply LOD0 within the per-module table budget, LOD1 around 40% of LOD0 and LOD2 around 15%, with the same pivot/material slots and preserved openings. Small props may disappear at distance. The current runtime does not automatically install these LODs; wire up and test distances when importing them.
- Preserve reuse: shared geometry and material instances; merge or instance repeated stationary objects by material and local district. The added street kit currently has a regression cap of 10 render meshes, 24 static bodies and 9,000 triangles. Replacement art must fit that aggregate allowance or be measured and rebudgeted before integration.
- Acceptance requires local finite-bounds and dimensions checks, normal/backface inspection, a full marker route walk, and camera checks beside props and at both ramps. Run desktop and Android GPU/frame-time measurements on the actual target devices; passing mesh budgets alone is not a mobile performance result.

## Protected walking space

Reserve a 2 m radius around market `(-30, 76)`, residential `(-10, 130)`, forecourt `(-10, 188)` and belvedere `(-74, 52)`. Keep both ascent roads centred at X = -70 and X = 50 unobstructed. The authored `CITY_EXPLORATION_ROUTE` uses the western road for ascent/descent and returns via the old square to the existing coastal ramps; the full `CITY_LOOP` still uses both roads. These data and route-clearance tests take precedence over decorative placement.
