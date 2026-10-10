# Results return loading

User requested the established Loading page design after results. Reuse FrontDoorArtwork in loading pose and LoadingScreen in a full-screen LoadingPage wrapper for RegionSession loading transitions. Keep the original progress indicator indeterminate and show destination-specific copy. App-level startup already supplies the same design, so only mount the region page after initial readiness to avoid duplicate portrait renderers. Preserve actual onReady/onFailure handling, progression, and immediate in-memory retry.

Validation: deferred world readiness test covers returning after completion, blocked world input, loading design and destination copy, and automatic dialogue focus after readiness. Check session/menu regressions, typecheck/build, and browser preview.
