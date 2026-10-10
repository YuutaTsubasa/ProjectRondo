# Reference menu entries

User requested exact main menu order: NEW GAME, LOAD GAME, EXTRA, SETTINGS, EXIT.

- Replace primary entries, relocate existing course/palace/town routes under EXTRA and restore focus on panel return.
- NEW GAME begins fresh region progress; existing valid progress requires an in-game confirmation and a backup before loading. Avoid resetting the current save on import failure. LOAD GAME previews/continues the existing validated auto-save and is unavailable when none exists.
- EXIT shows a user-operated close control plus a browser-blocked-close explanation and return options.
- Verify navigation order, extras routing, save preservation/new-game intent, exit fallback, typecheck/build and actual menu composition.

Implemented and verified: five menu entries and panels, fresh/resume distinction with backup, exit fallback. Full regression: 847 tests / 132 files pass. User follow-up: morph reduced to 0.65 s and menu entrance delay to 0.2 s; generated transparent PROJECT RONDO logo v2 removes the detached slash.
