import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { WIND_DIRECTION_X, WIND_DIRECTION_Z } from '../../domain/hub/windDirection';

/** Radians of phase per world unit along the wind direction. The visible result is the wavelength of
 *  a gust travelling over the field: 2*PI / 0.35 is ~18 units, so roughly five gusts span the 100-unit
 *  hub. Larger values shorten the wave until neighbouring tufts fight each other and it reads as noise
 *  rather than wind. Tuned in the browser (Step 5); re-tune there, not by arithmetic. */
const SPATIAL_FREQ = 0.35;

/** Radians of phase per second — how fast a gust travels. */
const SPEED = 1.1;

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
 */
export function createWind(scene: Scene): void {
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
 * `bendHeight` is LOCAL-space height. The thin-instance matrix and any parent scaling are applied
 * later in `finalWorld`, so one value per material is correct across instances of different sizes.
 *
 * `amplitude` is the per-sine scale fed into the shader's gust envelope, in WORLD units — NOT the peak
 * displacement. The envelope `sin(x) + 0.5*sin(2.3x + 1.7)` peaks at ~1.4999, so a fully-bent tip moves
 * about 1.5x `amplitude`. It is a per-material argument rather than one shared constant because wind is
 * a property of the air (spec §3c: every surface is pushed the same world distance, not scaled by its
 * own size) — but "the same world distance" cannot be one number for both a 0.22-unit flower and a
 * 6-unit tree, so each call site picks the value for its own surface:
 * - grass (`scatter.ts`, 0.5-unit card): 0.06 — peak ~0.09, ~18% of the card's height (~26% on the
 *   smallest 0.7-scaled tufts).
 * - wildflowers (`scatter.ts`, 0.22-unit card): 0.06 — peak ~0.09, ~41% of the card's height.
 * - trees (`trees.ts`, ~6-unit canopy): 0.2 — peak ~0.30, ~5% of tree height. Observed, not derived;
 *   see TREE_WIND_AMPLITUDE for the two sightings that bracket it.
 *
 * **Do not tune the trees by matching the grass's proportional lean.** That was tried — 0.6, putting
 * the canopy at ~15% against the grass's ~18% — and the project owner reported it as visibly too much.
 * The reasoning was wrong, not just the number: it treats a tree as a giant blade of grass. A grass
 * card is uniformly flexible along its whole length, whereas a tree's trunk is rigid and only the
 * crown gives, so a real tree in a breeze deflects a few percent of its height where grass bends tens
 * of percent. Matching the two proportions guarantees a tree that looks like it is in a gale.
 *
 * NOT replicated into the shadow map, and it cannot be: `shadowMap.vertex` exposes only
 * `CUSTOM_VERTEX_DEFINITIONS` — there is no injection point between `positionUpdated` and `worldPos`
 * on that path. Grass and flowers do not cast, so they are unaffected; trees do (spec §3e, Task 2).
 */
export function applyWind(material: Material, bendHeight: number, amplitude: number): void {
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
    uniformBuffer.updateFloat4('windPhase', WIND_DIRECTION_X, WIND_DIRECTION_Z, SPATIAL_FREQ, field.time * SPEED);
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
  // Two incommensurate sines: one alone reads as a metronome.
  float windGust = sin(windTheta) + 0.5 * sin(windTheta * 2.3 + 1.7);
  // XZ only. Vertical motion separates a card from its own ground contact and it has no
  // thickness to hide the gap.
  worldPos.xz += windPhase.xy * (windGust * windBend.x * windW);
}
#endif`,
    };
  }
}
