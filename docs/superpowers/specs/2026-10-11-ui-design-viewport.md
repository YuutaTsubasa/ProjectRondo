# Shared 1080p UI canvas

Use 1920×1080 as the design baseline. Uniform scale is min(viewport width / 1920, viewport height / 1080). Extend the logical canvas on the spare axis for other aspect ratios; never crop UI or letterbox the world. UI percentages follow this canvas. Replace viewport lengths with container lengths and viewport size queries with named UI container queries, so small browser windows do not reflow independently. Keep reduced-motion / forced-colors preferences as real media queries.

Wrap UI groups at session boundaries, not the gameplay canvas. Menus, HUD, AVG, pause, map, result and dialogs share this rule. Touch controls retain physical screen sizes for usable finger targets. Preserve DOM hit testing, focus navigation and map dragging through native CSS transforms. Validate at 1920×1080, 1280×720, 960×540 and a wide mobile landscape viewport.
