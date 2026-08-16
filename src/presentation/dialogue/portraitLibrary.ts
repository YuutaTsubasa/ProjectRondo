/**
 * Resolves a PortraitKey to a portrait image URL. Mirrors the Godot `PortraitLibrary` stub: every
 * key falls back to the neutral portrait until per-emotion art exists (fill `byKey` when it does).
 */
const NEUTRAL = '/portraits/knight_idle.png';
const byKey: Record<string, string> = {};

export const resolvePortrait = (key: string): string => byKey[key] ?? NEUTRAL;
