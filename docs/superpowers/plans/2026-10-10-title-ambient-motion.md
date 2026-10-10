# Title ambient motion implementation plan

**Goal:** Make PRESS ANY KEY and the main menu visibly alive while preserving the white title composition.
**Approved direction:** Pale blue drifting light on the existing white sheet; more visible scenic drift, mist and sunlight after menu reveal. Keep logo, text and controls steady. No change to stage results.
**Architecture:** CSS transforms/opacity in FrontDoorArtwork; reuse its visibility and reduced-motion state. Maintain the existing sheet morph.
**Tech stack:** Svelte, CSS.

- [x] Add two subtle light layers to the white sheet, with continuous alternate motion.
- [x] Shorten scenic/mist/light cycles and slightly increase background travel.
- [x] Pause light layers in hidden tabs; disable animation for reduced motion.
- [x] Verify title/menu visually, existing frontend tests and typecheck/build.

Follow-ups approved in the same session: repeat glints on STAGE CLEAR and rank, and X/Square for contextual world interaction plus AVG advancement. Both implemented; A confirms menus and B returns. CSS motion verified through changing computed transforms/background positions and screenshots. 1,009 tests pass; typecheck clean; build passes with existing chunk advisory.

Visibility follow-up: original broad 12 s light was too faint and mostly clipped outside the menu sheet. Increased blue-white band contrast, added a narrow second edge, shortened sweep to 6 s and gave the active-menu sheet its own layer bounds. Verified in the browser; reduced-motion and hidden-tab pause are retained. Build passes.

Art-direction follow-up: user rejected visible diagonal streaks as cheap-looking. Replaced hard-edged linear gradients with two diffuse radial atmospheric layers (13/17 s), plus six small low-opacity drifting motes away from the central logo. Logo and controls stay still; white-sheet morph, visibility pause and reduced-motion handling remain.

Owner follow-up: replace drifting motes with a small bottom wave. Reuse HudWaves with a default-off subtle variant: no side waves, 48–86 px bottom height, pale blue fill, six fine ribbons, slow 7/10 s breathing and 9 s current. It lives inside the white sheet so the menu reveal remains coherent. Existing gameplay waves keep their original settings.
