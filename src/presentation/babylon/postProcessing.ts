import { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';

/**
 * Distance fog and (from Task 4) the camera's rendering pipeline — the frame-level half of the
 * atmosphere, as opposed to `environment.ts`, which builds the lights and sky themselves.
 */

/**
 * Fog colour. Matches the sky gradient's horizon stop, because fog is what the distant mountains
 * dissolve *into*: any mismatch shows up as a visible band where they meet the sky.
 */
const FOG_COLOR = Color3.FromHexString('#dcecf7');

/**
 * EXP2 density, chosen from the scene's real distances rather than by eye: the field's half-extent is
 * 50, the mountain ring sits at radius 85, and the barrier confines the player to about 42 — so the
 * far side of the field is up to ~100 units away and the mountains 85–127.
 *
 * With `factor = exp(-(d * density)^2)`, this value leaves ~9 % haze at 40 units (the field the player
 * is actually looking across stays clear) and ~50 % at 110 (the mountains read as far off). Squared
 * falloff rather than linear because aerial perspective builds with distance; linear fog reads as a
 * flat curtain hung in front of the scene.
 */
const FOG_DENSITY = 0.0076;

/** Applies the scene's atmosphere. Call once, after the camera exists. */
export function createAtmosphere(scene: Scene): void {
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = FOG_COLOR;
  scene.fogDensity = FOG_DENSITY;
}
