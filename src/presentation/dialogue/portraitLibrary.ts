/**
 * Resolves a PortraitKey to portrait art. Mirrors the Godot `PortraitLibrary` stub: every key falls
 * back to the neutral portrait until per-emotion art exists (fill `byKey` when it does).
 *
 * Two forms per key, because the neutral portrait is an animated idle:
 *
 * - `resolvePortrait` is the **still**, and is always available. It is what
 *   `prefers-reduced-motion` shows, and what any future non-animated key resolves to.
 * - `resolvePortraitMotion` is the **animated** art, or `undefined` when a key has none.
 *
 * Both are animated WebP / WebP rather than a `<video>`. VP9-in-WebM would be a third the bytes,
 * but WKWebView (macOS and iOS Tauri targets — `tauri.conf.json` bundles `all` and ships an
 * `.icns`) does not support VP9's alpha channel, so the removed background would come back as an
 * opaque black box there. Animated WebP carries alpha in Safari 14+, Chromium and Firefox alike,
 * and renders in a plain `<img>` — no codec probe, no autoplay policy, no per-platform branch.
 */
const NEUTRAL_STILL = '/portraits/knight_idle_still.webp';
const NEUTRAL_MOTION = '/portraits/knight_idle.webp';

const stillByKey: Record<string, string> = {};
const motionByKey: Record<string, string> = {};

export const resolvePortrait = (key: string): string => stillByKey[key] ?? NEUTRAL_STILL;

export const resolvePortraitMotion = (key: string): string | undefined =>
  motionByKey[key] ?? NEUTRAL_MOTION;
