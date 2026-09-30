# Palace Homing passage and lower mist

User request: Homing should pass through walls, and the exposed lower buildings should disappear into fog.

- Palace Homing targeting uses forward direction, live targets and the existing12-unit range, regardless of intervening solids. During a dash, move directly toward the target; normal movement and sword attacks retain solid collision/occlusion. Land the hit at the target's valid position before bouncing. Preserve the air-jump budget. If a dash expires or loses its target inside a solid, restore its last clear position.
- Blend palace materials into pale blue mist by actual world height (-1.5 to -8.5). An opaque cloud sea at y=-9 hides lower foundations from both entrance and elevated cameras; only its distant horizon fades into the sky. Slow drift uses run.elapsed so pause/replay behave consistently. Platforms, pickups and reticles above the mist stay clear. Do not alter geometry, collisions or the shared hub rendering.
- Validate both directions, floor/ledge crossing, cancellation, normal collisions and sword occlusion with domain tests. Inspect entrance and high-tower mist in-browser, including pause/replay, and run existing checks.
