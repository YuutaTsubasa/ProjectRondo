# Layered coastal title illustration

User approved trying illustrated key art with subtle layered motion, retaining the supplied-reference UI.

- [x] Generate city background, identity-referenced rear three-quarter protagonist and transparent sea mist with built-in image_gen. Save original assets and prompts in public/title.
- [x] Integrate in FrontDoorArtwork: preserve white diagonal UI geometry; center distant palace; place protagonist at right foreground, gazing left into the world.
- [x] Add restrained mouse parallax (background smaller than foreground), slow drifting mist, reduced-motion handling and hidden-tab suspension. Keep input handlers scoped to the mounted front door and dispose on exit.
- [x] Verify actual title/menu composition, keyboard/settings behavior, narrow layout, asset loading and build/typecheck. Save screenshot and keep local preview available.

The illustration is aspirational key art, not an in-game capture. No additional town geometry or gameplay changes in this pass.

Validation: 9 menu/state tests passed; TypeScript/Svelte 0 errors / 0 warnings; production build passed with the pre-existing large chunk advisory. Browser confirmed all four image instances loaded, pointer movement updated the bounded parallax CSS values, mist animation active, and 390x844 composition remained readable. Viewport override restored.
