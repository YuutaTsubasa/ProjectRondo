/**
 * Resolves a PortraitKey to portrait art. Mirrors the Godot `PortraitLibrary` stub: every key falls
 * back to the neutral portrait until per-emotion art exists (fill the maps when it does).
 *
 * Three forms per key, because the neutral portrait is an animated idle and no single encoding is
 * both small and universal:
 *
 * - `resolvePortrait` — the **still**. Always available, always correct. Shown immediately while
 *   the engine is being probed, and permanently under `prefers-reduced-motion`, since an `<img>`
 *   animation cannot be paused.
 * - `resolvePortraitWebm` — VP9 in WebM, about a sixth the bytes of the WebP, but only where the
 *   engine honours VP9's alpha. WKWebView does not, and `tauri.conf.json` bundles `all` with an
 *   `.icns`, so macOS and iOS are real targets. Gated behind `supportsVp9Alpha()`.
 * - `resolvePortraitAnimated` — animated WebP. Carries alpha in Safari 14+, Chromium and Firefox
 *   alike, so it is the answer whenever the probe says no or cannot say.
 *
 * The WebP is the baseline and the WebM is the upgrade, never the other way round: a wrong or slow
 * probe then costs bytes rather than painting a black rectangle over the scene.
 */
const NEUTRAL_STILL = '/portraits/knight_idle_still.webp';
const NEUTRAL_ANIMATED = '/portraits/knight_idle.webp';
const NEUTRAL_WEBM = '/portraits/knight_idle.webm';

const stillByKey: Record<string, string> = {};
const animatedByKey: Record<string, string> = {};
const webmByKey: Record<string, string> = {};

export const resolvePortrait = (key: string): string => stillByKey[key] ?? NEUTRAL_STILL;

export const resolvePortraitAnimated = (key: string): string | undefined =>
  animatedByKey[key] ?? NEUTRAL_ANIMATED;

export const resolvePortraitWebm = (key: string): string | undefined =>
  webmByKey[key] ?? NEUTRAL_WEBM;
