# Palace guard performance implementation plan

Goal: stop rendering and solving offscreen knight rigs without changing 2D patrol, combat or checkpoint simulation.
Architecture: keep authored skinned bounds override for nearby knights; use the active camera frustum with a conservative 8m margin to disable distant holders. Accumulate traveled distance so pose is restored before entering view. No camera means retain existing always-visible test behavior.

- [x] Reproduce 1-4, then user-corrected 1-5, with the muted adventures QA harness, capture 10-second baseline and render-only A/B counters.
- [x] Add behavioral regression in tests/presentation/palaceGuardMotion.test.ts: camera travels away, rig disables and pose stops, domain state unchanged, returning restores accumulated stride, defeated guards stay hidden and reset revives them. Run `node node_modules/vitest/vitest.mjs run tests/presentation/palaceGuardMotion.test.ts` and observe failure.
- [x] In src/presentation/palace/palaceGuards.ts derive camera planes once per update; test guard foot center plus 1m against each plane with 8m radius. Set holder enabled only if in range and alive/fading. Accumulate travel offscreen; reset stride lazily when shown. Keep domain simulation untouched.
- [x] Rerun guard/asset/domain palace tests; compare identical browser benchmark and execute the actual input routes through 1-4 and 1-5.
- [x] Full typecheck/tests/build with parallel city work integrated; document measured scope and device limitation, commit only validated changes.

Final evidence: see docs/qa/2026-10-21-white-city-public-spaces.md. 199 suites / 1,236 tests passed; typecheck and production build verified.
