# Light Front Door Implementation Plan

Use superpowers:subagent-driven-development for the independent audio-settings task; parent owns front-door flow, UI and integration.

**Goal:** Deliver Title → Main Menu → current game, preserving flexibility in the eventual opening.
**Architecture:** Lazy-mounted GameSession keeps existing gameplay lifetime intact. Pure front-door transitions feed the Svelte shell. Audio preferences persist through a validated store consumed by existing busGain.
**Tech Stack:** Svelte 5, TypeScript, Babylon audio, local assets, Vitest.

- [x] Tests first: guarded navigation/start/ready/failure/retry, front-door DOM focus/keyboard and settings behavior.
- [x] Audio settings: create validated persisted audioPreferences store; apply on audio graph creation and updates, unsubscribe on disposal. Test blocked/corrupt storage and bus gain wiring.
- [x] UI: FrontDoor.svelte with shared Light artwork, title, main menu, settings, loading/error screens; responsive and reduced-motion, real controls only.
- [x] Integration: move existing App session into GameSession.svelte; App lazily mounts it after Start, handles readiness/failure and retry disposal.
- [x] Review and verify full tests, typecheck/build, browser title/menu/settings/start/intro plus mobile/keyboard. Update handoff and leave Title ready.

Verification: 632 tests / 88 files, zero typecheck errors/warnings, successful build. Browser desktop + 390px menu/settings, persistence/reset, keyboard focus, Start/intro/hub all verified. Independent review's Havok retry and focus/false Esc hints corrected. Existing large-chunk build warning retained.

## Motion follow-up

User requested page transitions and a bottom marquee. Key the content section by phase so each navigation replays a 380ms fade/slide with staggered child entry; the shared portrait transitions position without remounting. Hover/focus arrows and pressed buttons add small feedback. Entering the game fades its ready wrapper in over 500ms. The footer uses two equal-width copies in a persistent track, translating one copy width over 32 seconds; hover pauses it. All added animation/transition rules respect prefers-reduced-motion.

Verified 6 front-door flow/UI tests, full typecheck (zero errors/warnings), successful production build (existing large-chunk warning). Browser measured changing marquee transforms across menu/settings/back; equal1627px groups and3254px track confirm a half-track seamless repeat. Page opacity settles to1 and focus returns to Settings after quick navigation. No transition timer/input locks were introduced.
