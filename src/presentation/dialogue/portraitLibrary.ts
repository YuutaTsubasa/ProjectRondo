//
// Resolves a PortraitKey to portrait art. Mirrors the Godot `PortraitLibrary` stub: every key falls
// back to the neutral portrait until per-emotion art exists (add a whole set to the map for each).
//
// Three forms per key, because the neutral portrait is an animated idle and no single encoding is
// both small and universal. The WebP is the baseline and the WebM is the upgrade, never the other
// way round: a wrong or slow probe then costs bytes rather than painting a black rectangle over the
// scene. Each accessor says which is which.
//

/**
 * All three encodings of one portrait, together.
 *
 * They are one value rather than three maps because the three are the same drawing, and a key that
 * had only some of them would be a bug nothing could see: an angry still under a neutral animation
 * puts two different frames of art on screen in the same beat, chosen by which branch the engine
 * happened to take. Whole sets make that unrepresentable — adding a key means supplying all three.
 */
type PortraitSet = { readonly still: string; readonly animated: string; readonly webm: string };

const NEUTRAL = {
  still: '/portraits/knight_idle_still.webp',
  animated: '/portraits/knight_idle.webp',
  webm: '/portraits/knight_idle.webm',
} as const satisfies PortraitSet;

const byKey: Record<string, PortraitSet> = {};

const setFor = (key: string): PortraitSet => byKey[key] ?? NEUTRAL;

/**
 * The **still**. Always available, always correct.
 *
 * Shown immediately while the engine is being probed, and permanently under
 * `prefers-reduced-motion`, since an `<img>` animation cannot be paused. Also the `<video>` poster.
 */
export const resolvePortrait = (key: string): string => setFor(key).still;

/**
 * Animated WebP: the baseline animation.
 *
 * Carries alpha in Safari 14+, Chromium and Firefox alike, so it is the answer whenever the probe
 * says no or cannot say. About six times the bytes of the WebM.
 */
export const resolvePortraitAnimated = (key: string): string => setFor(key).animated;

/**
 * VP9 in WebM: the upgrade, and only where the engine honours VP9's alpha.
 *
 * WKWebView does not — it plays the file and ignores the channel — and that is the engine Tauri
 * renders through on macOS, which `tauri.conf.json` bundles for. Gated behind `supportsVp9Alpha()`;
 * reaching for it ungated is the black-rectangle bug.
 */
export const resolvePortraitWebm = (key: string): string => setFor(key).webm;
