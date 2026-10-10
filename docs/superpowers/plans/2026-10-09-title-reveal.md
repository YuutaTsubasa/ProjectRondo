# White title reveal and stronger illustrated idle

User specified the design: pure white title, centered logo, PRESS ANY KEY below; activation shifts white foreground and logo left to reveal the right-hand illustration and menu. Strengthen background and character idle motion.

- [x] Keep one persistent logo across title/menu; interpolate its position from centered to existing left layout.
- [x] Add an opaque white diagonal veil and a separate art reveal wrapper; transition both on phase change, hide decorative/footer content on initial title.
- [x] Replace title blue bar with centered plain PRESS ANY KEY; delay menu entrance slightly to follow the reveal. Preserve menu routes, focus and returning to title.
- [x] Increase automatic scenic drift, mist movement and character breathing/sway independently from pointer parallax; pause hidden/title artwork and honor reduced motion.
- [x] Run existing menu/state tests, typecheck/build; inspect white opening, transition, final composition and narrow layout in browser. Keep server available, no commit/push.

Validation: 9 menu/state tests passed; TypeScript/Svelte 0 errors / 0 warnings; production build passed (existing large chunk advisory). Browser at 1280x720 and 390x844 showed opaque white opening, centered logo, continuous intermediate reveal transforms and final left logo position. Artwork animations were paused on title and running on menu. Console clean; viewport restored.

## User correction: persistent white panel
The white title surface must shrink/morph into the actual left menu polygon, not slide away as a separate veil. Removed the separate veil and art entrance translation. FrontDoorArtwork owns one persistent left-paper element; its seven-point clip-path interpolates from full-screen rectangle to the responsive left panel. Decorative lettering fades in over it. Logo movement and stronger idle remain.
