# Multidevice input implementation plan

Goal: Complete the existing game flow with keyboard/mouse, standard-mapped gamepads and touch, using the owner-approved bindings. Remapping and custom touch placement are deferred.

Architecture: Retain existing gameplay and modal callbacks; a shared input hub owns external movement, actions, device identity and lifecycle. The keyboard adapter joins this hub at the rig boundary. A UI navigator operates only the visible top input scope, activating real controls and their existing callbacks. Touch uses pointer capture with independent movement/look pointers. Device hints subscribe to the shared device store. All suspension, blur, disposal and disconnect paths clear transient actions.

- [x] Core: add tests/presentation/deviceInput.test.ts covering dead zone, one-shot edges, neutral rearm, disconnect, UI/game isolation. Run to observe missing module, implement src/presentation/input/deviceInput.ts, rerun.
- [x] Gameplay: connect babylon/input.ts and followCamera.ts to the hub, retaining legacy keyboard tests; mouse attacks require the gameplay canvas and 3D pointer lock. Add mouse and external-device regression tests.
- [x] UI: add src/presentation/input/uiNavigation.ts and runtime.ts. Scope focus to visible dialogs/front-door/AVG, provide confirm/back, shoulders for sequential focus, directional navigation, range/select adjustment, map pan/zoom and backlog scroll. Add behavioral DOM tests.
- [x] Touch: add InputLayer.svelte mounted by App; left captured movement, right captured look, separate jump/attack/interact, walk, map/pause. Clear on pointer cancel, modal changes and blur. Add component tests with simultaneous pointers.
- [x] Hints: InputHint.svelte and reactive device labels in HUD/menu/map/AVG; retain clickable native UI for touch. Display controls reference in Settings.
- [x] Music: docs/audio/bgm-prompts.txt with standalone House prompts for existing regional areas, expeditions, three story moods and results/failure, plus reuse policy for overlays/loading.
- [x] Verify targeted tests, typecheck and production build; inspect menu/touch UI in browser; report real gamepad/touch hardware validation limits accurately. Keep changes uncommitted with current work.

Validation: 94 tests across 19 related suites passed; typecheck zero errors/warnings and production build passed (existing bundle-size advisory). Browser preview verified real palace movement with the virtual stick, pause/resume, controls settings and 844x390 landscape layout. Hardware gamepad and native multitouch feel still require device testing.
