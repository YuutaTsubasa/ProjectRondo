# Windward Ruins first course

User approved run/jump + Homing traversal on 2026-09-21. This is an independent playable course opened by a new main-menu action. Existing Start retains the dialogue/hub/tower flow.

The route has four readable beats: safe grassland approach, broken bridge jumps, checkpoint and crystal crossing, mixed final traversal ending at a ruin arch. Aim for 2–3 minutes on a first exploratory attempt; no artificial time limit. Natural JRPG grass/stone palette, distant goal silhouette, clear landing areas and cyan crystal path. Reuse current player, controls, shadows and homing visuals. No enemies or new combat system.

Progress is spatial and ordered, requires grounded arrival inside a checkpoint/finish area (not merely crossing a world Z plane), and cannot finish without intermediate checkpoints. Falling below the course kill height respawns at the last reached checkpoint and clears velocity/homing using Player.teleport, then snaps the camera. Timer uses active rendered dt; retry count increases once per fall. A completed run freezes gameplay/timer and displays elapsed time, falls, Replay, Main Menu. Escape pauses with Resume/Restart/Main Menu. Hidden browser tab pauses without charging hidden time.

CourseSession owns engine and scene lifetime separately from the existing GameSession. Scene build failures use the front-door error/retry path, unmount during async creation disposes the result before disposing its engine. Restart resets progress and player without refetching assets. HUD uses existing Light fonts/colors, white selected buttons and restrained motion with reduced-motion support.

Validate checkpoint ordering, airborne rejection, fall recovery, finish latching, timer pause, fresh restart; menu routing/retry; scene asset loading and teardown; browser playthrough including a fall and replay. Preserve existing tests and build.

## Verification and pacing adjustment (2026-09-21)

The implemented course is deliberately a compact first playable trial. With the final wider camera, an in-browser input driver traversed the authored route in 22 seconds without teleporting, with six ordinary gap jumps, two launch jumps and eight Homing hits; zero falls and zero browser errors. This is an ideal scripted run, not a human first-attempt timing. The original 2–3 minute target was not met by clean traversal, and this version does not pad the route to claim it was. Further route length/difficulty can follow player feedback.

Browser checks also verified replay resets timer/checkpoint, a diagnostic fall returns to checkpoint 2 with falls=1, keyboard Space opens Pause without jumping, timer remains stopped, Resume works, Return Main Menu works, and original Start still opens the AVG dialogue. Diagnostic teleport was used only to isolate the fall/checkpoint check, not the full route traversal. Ground lighting corrected packed texture data to the linear detail channel. Camera/initial facing adjusted only for this course.

Full verification: 651 tests across 94 files pass; TypeScript/test TypeScript and Svelte check pass with zero diagnostics; production build passes with the existing large-chunk warning. Independent spec review passed; quality review found two pause issues, both fixed and covered by real-input/real-animation regressions.
