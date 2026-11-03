# Walkable city expansion

User correction: the royal city must be large enough to explore, rather than a distant city silhouette. Extend the approved outdoor prototype into three connected districts. Keep existing story and expedition anchors. No interiors, new quests, or new generated assets in this pass.

- [x] Verify a continuous loop from the old square through market, residential terrace, palace forecourt and back via a second ascent. Shared surfaces drive physics and ground sampling.
- [x] Add broad districts and paired ramps; open the north parapet at both approaches. Keep the old flat foundation restricted to its original bounds.
- [x] Replace distant residential rows with collidable street blocks, doors, shop awnings, planting and seating. Keep clear central and side streets and a palace-facing forecourt. Relocate distant palace/hills beyond playable space.
- [x] Expand safe bounds and district names, recapture the map, update the visible muted preview. Verify full loop in browser, collision support with ray tests, typecheck and build.

Implementation files: domain/town/townTerraces.ts holds surfaces and walking route; domain/town/townDistricts.ts holds footprints; presentation/town/townDistricts.ts builds physical buildings and merged decoration. Existing townScenery integrates meshes/camera solids. regionLayout, regionTerrain and townBackdrop update the envelope and scenery. Regression tests sample route height and rendered support, including rail/building clearance.

## Verified 2026-10-12

- Three new outdoor districts, twenty collidable buildings, paired ascent roads and a 456 m walking route. Existing quests and entrances retained; palace interior is not implemented.
- Browser physics walk completed all ten waypoints, returning to (30.13, 1.13, 50.11), no reported errors.
- Review caught decorative terrain protruding through terrace edges. Regression ray test reproduced y7.52 above y6 paving, then passed after lowering the city envelope with a 4 m buffer.
- Atlas recaptured from createRegionScene; 1024 px, SHA-256 0664cea1de0b, bounds match the expanded region.
- Full regression: 180 files / 1,127 tests pass. Typecheck/build pass; existing large-chunk warning remains.
- Local muted preview: http://127.0.0.1:5173/.superpowers/city-slice.html . Desktop browser observed 60 fps during route; Android not measured. Street architecture remains a blockout for layout review. Not committed or pushed.
