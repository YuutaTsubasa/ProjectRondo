import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator';
// Side-effect: registers the shadow-map render component. Without it BOTH generators below produce
// no shadows at all, silently — the same class of failure as the StandardMaterial shader import.
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';

/** Per-cascade resolution. Four of these is roughly an 8 MB half-float texture array. */
const MAP_SIZE = 1024;
/** Babylon's DEFAULT_CASCADES_COUNT is also 4; set explicitly so the memory note above reads. */
const CASCADES = 4;
/** Split distribution: 1 is fully logarithmic (resolution hugs the camera), 0 fully uniform. */
const LAMBDA = 0.8;
/** Shadows stop here. Beyond ~120 units the fog (density 0.0076) has already taken ~60% of the contrast. */
const SHADOW_MAX_Z = 120;
/** Fraction of each cascade blended into the next, hiding the seam. First knob to drop for frame time. */
const CASCADE_BLEND = 0.1;
/**
 * Starting values only — Task 3 replaces them with a measured pair.
 *
 * `bias` is an offset in the light's NORMALIZED depth range, not in world units, so its world-space
 * size scales with the light frustum's depth. That is what broke shadows before this module existed:
 * 0.002 over an auto-extended 83.7-unit ortho box was ~0.2 world units and swallowed every shadow.
 */
const BIAS = 0.0005;
const NORMAL_BIAS = 0.02;
/** 0 is an opaque black shadow, 1 is no shadow. Lifted slightly so shadows are not crushed. */
const DARKNESS = 0.15;
/** Single-map fallback resolution when cascades are unavailable (WebGL1). */
const FALLBACK_MAP_SIZE = 2048;

export interface Shadows {
  /** The live generator — CascadedShadowGenerator, or a plain ShadowGenerator on WebGL1. */
  readonly generator: ShadowGenerator;
  cast(...meshes: readonly AbstractMesh[]): void;
  receive(...meshes: readonly AbstractMesh[]): void;
}

/**
 * Builds the sun's shadow generator and hands back the only two verbs the rest of the scene needs.
 *
 * Must be called AFTER `scene.activeCamera` is set: cascade splits are derived from the camera, and
 * `CascadedShadowGenerator.IsSupported` reads `EngineStore.LastCreatedEngine`, so the engine has to
 * exist too. `hubScene.ts` orders it that way on purpose.
 */
export function createShadows(sun: DirectionalLight, camera: Camera): Shadows {
  let generator: ShadowGenerator;
  if (CascadedShadowGenerator.IsSupported) {
    const csm = new CascadedShadowGenerator(MAP_SIZE, sun, false, camera);
    csm.numCascades = CASCADES;
    csm.lambda = LAMBDA;
    csm.shadowMaxZ = SHADOW_MAX_Z;
    // The camera never stops moving in a third-person game; without stabilization the cascade
    // edges shimmer against the grass every frame, which reads worse than the resolution it costs.
    csm.stabilizeCascades = true;
    csm.cascadeBlendPercentage = CASCADE_BLEND;
    generator = csm;
  } else {
    console.warn('[shadows] cascaded shadow maps unavailable — falling back to a single shadow map.');
    generator = new ShadowGenerator(FALLBACK_MAP_SIZE, sun);
  }

  // CascadedShadowGenerator accepts only FILTER_NONE, FILTER_PCF and FILTER_PCSS; anything else is
  // logged as an error and silently downgraded to FILTER_NONE.
  generator.usePercentageCloserFiltering = true;
  generator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  generator.bias = BIAS;
  generator.normalBias = NORMAL_BIAS;
  generator.setDarkness(DARKNESS);

  // Zero-vertex meshes are boundary walls, collider proxies and glTF __root__ nodes. They would
  // render nothing into the map but still cost a draw call per cascade.
  const hasGeometry = (mesh: AbstractMesh) => mesh.getTotalVertices() > 0;

  return {
    generator,
    cast: (...meshes) => {
      for (const mesh of meshes) if (hasGeometry(mesh)) generator.addShadowCaster(mesh);
    },
    receive: (...meshes) => {
      for (const mesh of meshes) if (hasGeometry(mesh)) mesh.receiveShadows = true;
    },
  };
}
