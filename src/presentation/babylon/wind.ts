import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { WIND_DIRECTION_X, WIND_DIRECTION_Z } from '../../domain/hub/windDirection';

/** Radians of phase per world unit along the wind direction. The visible result is the wavelength of
 *  a gust travelling over the field: 2*PI / 0.35 is ~18 units, so roughly five gusts span the 100-unit
 *  hub. Larger values shorten the wave until neighbouring tufts fight each other and it reads as noise
 *  rather than wind.
 *
 *  **Untuned**: 0.35 is the value this was written with, and nobody has watched the field move. The
 *  wavelength above is arithmetic, not an observation. Re-tune by looking at the running scene. */
const SPATIAL_FREQ = 0.35;

/** Radians of phase per second — how fast a gust travels. Untuned, on the same footing as
 *  {@link SPATIAL_FREQ}. */
const SPEED = 1.1;

/**
 * The shader gust envelope's second-sine multiplier, kept as an exact fraction rather than the decimal
 * 2.3 so {@link GUST_PERIOD} can be *computed* from it instead of separately restated. `getCustomCode`
 * below interpolates this same constant into the GLSL template literal — a JS value, not prose — so
 * the shader and {@link GUST_PERIOD} cannot drift apart the way a hand-copied `2.3` in both places
 * could. Reduced already (gcd(23, 10) = 1), which is what makes the period below exact.
 */
const GUST_HARMONIC_NUM = 23;
const GUST_HARMONIC_DEN = 10;
/** = 2.3. The value that actually reaches the shader; see {@link GUST_HARMONIC_NUM}. */
const GUST_HARMONIC = GUST_HARMONIC_NUM / GUST_HARMONIC_DEN;

/**
 * The gust envelope's exact period in phase radians, used to wrap the phase before it is bound.
 *
 * The envelope is `sin(t) + 0.5*sin(GUST_HARMONIC*t + 1.7)`. Because `GUST_HARMONIC` is the reduced
 * fraction 23/10, the two terms come back into step after `2*PI*10` (10 turns of the first sine, 23 of
 * the second — the denominator is exactly the turn count), and subtracting a multiple of it from the
 * phase is an identity, not an approximation — no seam, no drift. This is *why* the fraction form
 * above exists rather than the bare decimal: the period falls out of the denominator instead of being
 * a second number someone has to keep matching to the first.
 *
 * It has to be wrapped because the phase reaches the shader through a **float32** uniform while the
 * clock behind it only grows. A float32's ULP at a value in `[2^e, 2^(e+1))` is `2^(e-23)`, so at 8 h
 * of uptime the phase is `28800 * 1.1` = 31680 rad, which lies in [2^14, 2^15) and therefore steps by
 * 2^-9 ≈ 0.00195 rad — against a 144 Hz frame's 1.1/144 ≈ 0.00764 rad, that is **3.9 ULP**, so the
 * gust already moves in visible stair-steps. By 24 h the phase is 95040 rad, in [2^16, 2^17), ULP
 * 2^-7 ≈ 0.0078: the same frame step is now 0.98 ULP and the wind quantises into a stall. Wrapping
 * holds the bound value under `20*PI` ≈ 62.8, in [2^5, 2^6), where a ULP is 2^-18 ≈ 3.8e-6 rad, for
 * any uptime.
 *
 * `clouds.ts` reads the same clock and takes its own wrap, `% 1` on the texture offset. It is not
 * exempt and the scale factor is no reason to think it would be: the step-to-ULP ratio is
 * `(V / 2^exponent) * 2^23 * dt / t`, which the constant drops out of, so 0.004 buys nothing. At the
 * 8 h above its offset steps 3.6 ULP against this phase's 3.9 — the same stair-stepping at the same
 * hour. An earlier version of this comment claimed the scaling excused it; it does not.
 */
const GUST_PERIOD = 2 * Math.PI * GUST_HARMONIC_DEN;

/** The single source of wind time, in seconds. Every plugin instance binds this same value, so the
 *  whole field shares one phase; nothing else may write it. `createWind` is the only writer — the
 *  clouds read it through {@link windTime} rather than integrating their own clock, so both effects
 *  agree on "now" even though each still runs its own per-frame observer to apply its own motion. */
const field = { time: 0 };

/**
 * Starts the wind. Registers exactly ONE per-frame observer for the whole scene — the plugins are
 * passive readers, so adding a second caller here would double the wind speed rather than fail.
 *
 * Time accumulates from `getDeltaTime()` rather than `performance.now()`: a wall clock keeps running
 * while the scene does not, so a paused or backgrounded tab would jump the field forward on resume.
 *
 * The clock is module-global but the scene it clocks is disposable — `App.svelte`'s unmount disposes
 * the engine and a remount builds a fresh scene against this same module instance — so it is reset
 * here rather than merely accumulated. Without the reset the second scene would open at whatever the
 * first one had reached: the grass mid-gust, and the cloud dome at an arbitrary point of its 250 s
 * loop. Resetting is safe precisely because this function is the clock's only writer.
 */
export function createWind(scene: Scene): void {
  field.time = 0;
  scene.onBeforeRenderObservable.add(() => {
    field.time += scene.getEngine().getDeltaTime() / 1000;
  });
}

/** The shared wind clock, in seconds — the same value every wind-bent material binds this frame.
 *  Read-only from outside this module: `clouds.ts` calls this instead of accumulating its own elapsed
 *  time, so P4's moving effects share one clock rather than several that merely start in step and
 *  drift apart across a scene teardown. */
export function windTime(): number {
  return field.time;
}

/**
 * Bends a material's geometry with the shared wind.
 *
 * Injected at `CUSTOM_VERTEX_UPDATE_WORLDPOS`, which is the only usable hook — verified against the
 * installed 9.21.0, see spec §3b. `CUSTOM_VERTEX_UPDATE_POSITION` runs *before*
 * `#include<instancesVertex>`, where `finalWorld` does not exist yet, so a thin instance cannot know
 * where it is and all 16 000 grass tufts would sway in the same phase. At UPDATE_WORLDPOS `worldPos`
 * is computed and `positionUpdated` is still in scope, which is exactly the pair this needs, and the
 * hook sits before both `gl_Position` and `vPositionW = vec3(worldPos)` so lighting and fog see the
 * displaced position too.
 *
 * `bendHeight` is LOCAL-space height, and must be finite and strictly positive — the shader divides
 * `positionUpdated.y` by it. Zero clamps every vertex's weight to 1 (the mesh translates rigidly
 * instead of bending) or produces NaN (the geometry disappears), and a negative height inverts the
 * weight so the root swings while the tip stands still. That is checked HERE rather than at each
 * caller: `trees.ts` measures its height off a bounding box and can legitimately meet a degenerate
 * mesh, so it screens those out before calling, but a caller passing a constant has no such screen
 * and this boundary is what covers it. The thin-instance matrix and any parent scaling are applied
 * later in `finalWorld`, so one value per material is correct across instances of different sizes.
 *
 * `amplitude` is checked HERE too, and for the reason given above verbatim: a non-finite value makes
 * `windBend.x` NaN, `worldPos.xz` NaN and the geometry vanish — the same failure as a NaN `bendHeight`,
 * reached by the same route of a call site passing a module constant that nothing else screens. Only
 * finiteness is required, unlike `bendHeight`: 0 is a legitimate "this material does not move", and a
 * negative value is just the gust in antiphase, neither of which is an invalid state.
 *
 * `amplitude` is the per-sine scale fed into the shader's gust envelope, in WORLD units — NOT the peak
 * displacement. The envelope `sin(x) + 0.5*sin(2.3x + 1.7)` peaks at ~1.4999, so a fully-bent tip moves
 * about 1.5x `amplitude`. It is a per-material argument rather than one shared constant because wind is
 * a property of the air (spec §3c: every surface is pushed the same world distance, not scaled by its
 * own size) — but "the same world distance" cannot be one number for both a flower's card and a tree's
 * canopy, so each call site picks the value for its own surface and records the reasoning next to its
 * own constant, against its own card/canopy size, rather than here where a restated number would drift
 * out of step with it:
 * - grass and wildflowers: `SCATTER_WIND_AMPLITUDE` in `scatter.ts`, next to `GRASS_CARD_SIZE` and
 *   `FLOWER_CARD_SIZE`.
 * - trees: `TREE_WIND_AMPLITUDE` in `trees.ts`, which also carries the two sightings that bracket it.
 *
 * **Do not tune the trees by matching the grass's proportional lean.** That was tried and the project
 * owner reported it as visibly too much — see `TREE_WIND_AMPLITUDE` for the value and the report. The
 * reasoning was wrong, not just the number: it treats a tree as a giant blade of grass. A grass card is
 * uniformly flexible along its whole length, whereas a tree's trunk is rigid and only the crown gives,
 * so a real tree in a breeze deflects a few percent of its height where grass bends tens of percent.
 * Matching the two proportions guarantees a tree that looks like it is in a gale.
 *
 * NOT replicated into the shadow map, and it cannot be: `shadowMap.vertex` exposes only
 * `CUSTOM_VERTEX_DEFINITIONS` — there is no injection point between `positionUpdated` and `worldPos`
 * on that path. Grass and flowers do not cast, so they are unaffected; trees do (spec §3e, Task 2).
 */
export function applyWind(material: Material, bendHeight: number, amplitude: number): void {
  if (!(bendHeight > 0) || !Number.isFinite(bendHeight)) {
    throw new RangeError(`applyWind: bendHeight must be finite and > 0 (material '${material.name}' got ${bendHeight})`);
  }
  if (!Number.isFinite(amplitude)) {
    throw new RangeError(`applyWind: amplitude must be finite (material '${material.name}' got ${amplitude})`);
  }
  new WindPlugin(material, bendHeight, amplitude);
}

class WindPlugin extends MaterialPluginBase {
  private readonly bendHeight: number;
  private readonly amplitude: number;

  constructor(material: Material, bendHeight: number, amplitude: number) {
    // Priority 200: after Babylon's own built-in plugins, which sit well below 200.
    super(material, 'Wind', 200, { WIND: true });
    this.bendHeight = bendHeight;
    this.amplitude = amplitude;
    // The plugin carries no toggleable property of its own, so it has to be enabled explicitly.
    this._enable(true);
  }

  getClassName(): string {
    return 'WindPlugin';
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'windPhase', size: 4, type: 'vec4' },
        { name: 'windBend', size: 2, type: 'vec2' },
      ],
      // Used only where the engine has no uniform buffers; harmless otherwise.
      vertex: `#ifdef WIND
uniform vec4 windPhase;
uniform vec2 windBend;
#endif`,
    };
  }

  bindForSubMesh(uniformBuffer: UniformBuffer): void {
    // Wrapped, not raw: see GUST_PERIOD — the float32 uniform loses phase resolution as the clock
    // grows, and the envelope is exactly periodic, so this costs nothing and is invisible.
    const phase = (field.time * SPEED) % GUST_PERIOD;
    uniformBuffer.updateFloat4('windPhase', WIND_DIRECTION_X, WIND_DIRECTION_Z, SPATIAL_FREQ, phase);
    uniformBuffer.updateFloat2('windBend', this.amplitude, this.bendHeight);
  }

  getCustomCode(shaderType: string) {
    if (shaderType !== 'vertex') return null;
    return {
      // Braced so the locals cannot collide with anything else injected at this point.
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef WIND
{
  // Squared, not linear: a linear weight lifts the root off the ground, and on an alpha-test card
  // that reads as the tuft detaching from the terrain.
  float windW = clamp(positionUpdated.y / windBend.y, 0.0, 1.0);
  windW *= windW;
  // Phase from world XZ, so neighbours are out of step and gusts travel across the field.
  float windTheta = dot(worldPos.xz, windPhase.xy) * windPhase.z - windPhase.w;
  // Two incommensurate sines: one alone reads as a metronome. The harmonic below is GUST_HARMONIC
  // interpolated from JS, not a hand-copied literal — it sets GUST_PERIOD, and the two stay in step
  // because both come from the same TS constant rather than two numbers someone has to keep matching.
  float windGust = sin(windTheta) + 0.5 * sin(windTheta * ${GUST_HARMONIC} + 1.7);
  // XZ only. Vertical motion separates a card from its own ground contact and it has no
  // thickness to hide the gap.
  worldPos.xz += windPhase.xy * (windGust * windBend.x * windW);
}
#endif`,
    };
  }
}
