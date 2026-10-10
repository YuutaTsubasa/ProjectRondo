# Gameplay HUD implementation plan

Goal: Adapt the supplied white/blue RPG HUD to existing playable systems. Defer mobile virtual controls.
Architecture: Region HUD owns minimap, compass and mission; a shared decoration owns seamless outward-rotated location text. Existing controls, saves and modal behavior remain functional.
Tech: Svelte 5, SVG, CSS; camera direction sampled with existing 10 Hz HUD position reports.

- [x] Add tested bearing projection; show real region trails, buildings and tracked destination in a north-up circular map.
- [x] Restyle region HUD as transparent edge-aligned navigation and keyboard actions, without invented party/HP/skill systems.
- [x] Add left +90/right -90 outlined, gapless location marquees; pause when hidden/inert and respect reduced motion. Share with town and expeditions.
- [x] Verify existing Space/map/pause controls, heading and destination updates, small viewport layout, actual game rendering; run typecheck and relevant tests.

Scope: gameplay overlays only. Existing pause/results and game mechanics remain. Navigation markers use world units as existing region map does; no fictional percentages or cooldowns. Main region uses 白色王城 across town districts and actual regional names beyond its bounds.

Validation: 52 tests in seven relevant suites pass. Typecheck clean; production build passes with existing chunk-size advisory. Browser: live 1280x720 region scene, tracked target switch to coast and distance update, 390x844 bounds without overflow, pause stops both marquee tracks. Reduced-motion has a static CSS fallback. Preview is isolated from saves at /.superpowers/gameplay-hud-qa.html.

Refinement: user corrected the reading direction; reverse both sides, remove inherited text/drop shadows and direct font-contour stroke. Use merged glyph alpha dilation minus original alpha for clean outlines with no overlapping-stroke seams. Add white-only, gently animated bottom wave ribbons to all four HUDs. Reduced motion, visibility and inert pause behavior also cover the waves.
