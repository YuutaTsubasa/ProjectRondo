# Exit confirmation

Goal: follow the requested Cancel/Confirm popup for EXIT. Browser confirmation returns to the white PRESS ANY KEY screen; Tauri confirmation exits the application. Saved data remains intact.

Reuse InformationDialog over the main menu, with the underlying controls inert. Cancel restores EXIT focus. Use a small platform adapter and a native async Tauri command; do not call browser window.close. A failed native request shows a recoverable error with retry/cancel.

- [x] Replace the obsolete browser-close test with confirmation, cancellation, browser return, native exit and failure/retry checks.
- [x] Add the native exit adapter and Tauri command; replace EXIT subpage with the shared dialog.
- [x] Run targeted tests, typecheck, full tests and production build. Check the popup in the browser.
- [ ] Push to the existing Android PR, compile the native command in CI, install the updated test APK on connected AYN Thor without clearing data.

## Follow-up requests in this session
- Town/meadow foot planting: reject distant terrain fallback and probe the capsule footprint when its center misses support; preserve airborne fade and nearby remembered support. Tests cover first-frame ledges, walking along an edge, and center rays hitting the lower terrain.
- Pause and expedition introductions hold a temporary 35% BGM gain, including nested settings and exit animations. Apply at the music bus/mix, retain saved volume/mute, and keep started stage loops playing. Verify both audio backends and overlay teardown.
