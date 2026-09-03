import type { Scene } from '@babylonjs/core/scene';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect: registers the StandardMaterial shader (tree-shaken deep imports need this).
import '@babylonjs/core/Materials/standardMaterial';
import { Material } from '@babylonjs/core/Materials/material';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { butterflyAt } from '../../domain/hub/butterfly';
import { rng } from '../../domain/math/rng';
import { terrainHeight } from './terrainHeight';

/** Enough to find one wherever you stand, few enough that the field does not read as infested. */
const COUNT = 10;
/** Wingspan in world units. A real one is ~0.07; this is scaled up so it reads at walking distance. */
const SIZE = 0.35;

/**
 * Ambient butterflies: billboards driven by the pure path in `src/domain/hub/butterfly.ts`.
 *
 * Deliberately NOT registered with `shadows`. A butterfly's shadow is invisible at this size, and the
 * frame measurement (spec §2) puts every shadow caster at four extra draw calls — the knight's 47
 * meshes alone cost 1.73 ms. Not pickable and no physics either: nothing in the game interacts with
 * them.
 *
 * Ten ordinary meshes rather than thin instances, on purpose. Thin-instancing needs a per-frame matrix
 * buffer rewrite to animate, which is more machinery than ten draw calls are worth — and spec §2's
 * ~0.4 ms resolution floor means the difference is very unlikely to be measurable. Measure before
 * changing it.
 */
export function createButterflies(scene: Scene): void {
  const mat = wingMaterial(scene);
  const rand = rng(21);
  // A stable per-butterfly seed, drawn once so the layout is identical every run.
  const seeds = Array.from({ length: COUNT }, () => rand() * 1000);

  const wings = seeds.map((_, i) => {
    const w = CreatePlane(`butterfly_${i}`, { size: SIZE }, scene);
    w.material = mat;
    w.isPickable = false;
    // BILLBOARDMODE_Y, not ALL: a butterfly that pitches to face a camera looking down at it reads as
    // a sticker. Yaw-only keeps it upright in the world.
    w.billboardMode = Mesh.BILLBOARDMODE_Y;
    // Always active: they roam the whole field, and re-testing ten tiny meshes against the frustum
    // each frame buys nothing. Same reasoning as the scatter cards.
    w.alwaysSelectAsActiveMesh = true;
    return w;
  });

  let elapsed = 0;
  scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000;
    for (let i = 0; i < wings.length; i++) {
      const s = butterflyAt(seeds[i], elapsed);
      wings[i].position.set(s.x, terrainHeight(s.x, s.z) + s.heightAboveGround, s.z);
      // The wingbeat, as a horizontal squash: a billboard has no third dimension to fold, so scaling
      // x toward 0 and back is what a pair of wings opening and closing looks like edge-on.
      wings[i].scaling.x = 0.25 + 0.75 * Math.abs(Math.cos(s.wingPhase * Math.PI * 2));
    }
  });
}

/** Two pale wings on a dark body, drawn into an alpha-cutout texture. Cutout, not blended, for the
 *  same reason `scatter.ts` gives: no transparency sorting to get wrong. */
function wingMaterial(scene: Scene): StandardMaterial {
  const size = 64;
  const tex = new DynamicTexture('butterflyWings', { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f2e6a8';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(size / 2 + dir * size * 0.18, size * 0.42, size * 0.17, size * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(size / 2 + dir * size * 0.14, size * 0.66, size * 0.12, size * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#3b2f1e';
  ctx.fillRect(size / 2 - size * 0.03, size * 0.28, size * 0.06, size * 0.46);
  tex.update(true);
  tex.hasAlpha = true;

  const mat = new StandardMaterial('butterflyMat', scene);
  mat.diffuseTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.transparencyMode = Material.MATERIAL_ALPHATEST;
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0, 0, 0);
  // The same trick the grass and the canopy use: without a floor, the side turned away from the sun
  // goes black under ACES, and a black butterfly reads as a fly.
  mat.emissiveColor = new Color3(0.35, 0.32, 0.22);
  return mat;
}
