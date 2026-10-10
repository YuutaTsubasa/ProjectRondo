# Android PWA implementation plan

1. Add regression tests for service-worker navigation fallback and explicit update activation.
2. Add manifest, portrait icons, standalone metadata and a branded offline page.
3. Emit a versioned service worker at build time; cache only the offline shell and icons.
4. Add install/update actions to the main menu, with no forced gameplay reloads.
5. Run tests, typecheck, production build and browser checks; document installation and device limitations.
