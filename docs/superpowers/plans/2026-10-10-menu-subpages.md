# Main menu inner pages

Goal: adapt the supplied white/blue reference to NEW GAME, LOAD GAME and EXTRA while retaining the live 3D menu portrait.
Approved scope: new game introduction → settings → confirmation, real autosave progress, existing extras only.
Architecture: MenuSubpages owns UI selection/steps and delayed exit. App owns save validation, backup and load. Shared artwork uses an inner-page layout. SettingsScreen is reused in-place.

- [x] Verify NEW GAME always opens a reviewable page, including without a save; confirm alone triggers backup/load.
- [x] Add reusable light inner-page layout, step/category rail, option rows, preview and primary action.
- [x] Show actual autosave chapter and discovered/completed counts without invented timestamps or slots.
- [x] Select EXTRA first and launch explicitly; preserve existing route/retry behavior.
- [x] Add enter/exit and content transitions, keyboard navigation and focus restoration.
- [x] Test save safety, selection, nested settings and reduced motion; typecheck/build and desktop/narrow visual QA.

Validation: 25 tests passed across menu flow, inner pages, settings and menu portrait. Typecheck reports zero errors/warnings. Build passes with existing chunk-size advisory. Desktop 1280×720 and narrow 390px previews inspected; preview fixtures do not read/write game saves.
