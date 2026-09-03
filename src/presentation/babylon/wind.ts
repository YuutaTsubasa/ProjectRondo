import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';

/**
 * The hub's one wind direction, in the XZ plane, unit length — (0.8, 0.6) is exactly 1. Module-private:
 * nothing here is exported. The other two effects in this phase are meant to agree with it, but neither
 * imports it: the clouds (`clouds.ts`) agree by a visual check of their drift direction against this
 * one, and the butterflies agree via a deliberately hand-kept copy of these two values in
 * `src/domain/hub/butterfly.ts`, which may not import from the presentation layer. A copy kept in step
 * by hand is a maintenance hazard — changing the direction here means changing it there too.
 */
const WIND_DIR_X = 0.8;
const WIND_DIR_Z = 0.6;

/** Radians of phase per world unit along the wind direction. The visible result is the wavelength of
 *  a gust travelling over the field: 2*PI / 0.35 is ~18 units, so roughly five gusts span the 100-unit
 *  hub. Larger values shorten the wave until neighbouring tufts fight each other and it reads as noise
 *  rather than wind. Tuned in the browser (Step 5); re-tune there, not by arithmetic. */
const SPATIAL_FREQ = 0.35;

/** Radians of phase per second — how fast a gust travels. */
const SPEED = 1.1;

/** Peak horizontal displacement of a fully-bent tip, in WORLD units. Deliberately world-space and not
 *  scaled per instance: wind is a property of the air, so a small tuft and a large one are pushed the
 *  same distance (spec §3c). At 0.06 a 0.5-unit grass card leans about 12% of its height. */
const AMPLITUDE = 0.06;

/** The single source of wind time, in seconds. Every plugin instance binds this same value, so the
 *  whole field shares one phase; nothing else may write it. */
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
 * NOT replicated into the shadow map, and it cannot be: `shadowMap.vertex` exposes only
 * `CUSTOM_VERTEX_DEFINITIONS` — there is no injection point between `positionUpdated` and `worldPos`
 * on that path. Grass and flowers do not cast, so they are unaffected; trees do (spec §3e, Task 2).
 */
export function applyWind(material: Material, bendHeight: number): void {
  new WindPlugin(material, bendHeight);
}

class WindPlugin extends MaterialPluginBase {
  private readonly bendHeight: number;

  constructor(material: Material, bendHeight: number) {
    // Priority 200: after Babylon's own built-in plugins, which sit well below 200.
    super(material, 'Wind', 200, { WIND: true });
    this.bendHeight = bendHeight;
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
    uniformBuffer.updateFloat4('windPhase', WIND_DIR_X, WIND_DIR_Z, SPATIAL_FREQ, field.time * SPEED);
    uniformBuffer.updateFloat2('windBend', AMPLITUDE, this.bendHeight);
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
