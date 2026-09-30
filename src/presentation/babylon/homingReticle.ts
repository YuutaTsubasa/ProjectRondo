import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vec3 } from '../../domain/math/vec3';
import { CRYSTAL_EXTENT } from './crystals';
import { HOMING_RED_RGB } from './homingColors';
import { HIDDEN_RETICLE, stepReticle, reticleAppearance } from './reticleTiming';

/** Four fine arcs and inward ticks keep the jewel visible through an open centre.
 * Dark keylines retain contrast against both the bright tower and the sky, without bloom.
 */
function reticleTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('homingReticleTex', { width: 512, height: 512 }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const [r, g, b] = HOMING_RED_RGB.map(v => Math.round(v * 255));
  ctx.clearRect(0, 0, 512, 512);
  ctx.translate(256, 256);
  ctx.lineCap = 'round';
  const arc = (radius: number, a: number, width: number, color: string) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(0, 0, radius, a - 0.36, a + 0.36); ctx.stroke();
  };
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2;
    arc(163, angle, 13, 'rgba(15,23,35,0.72)');
    arc(163, angle, 6, `rgb(${r},${g},${b})`);
    arc(155, angle, 2.3, 'rgba(255,237,220,0.9)');
    ctx.save(); ctx.rotate(i * Math.PI / 2);
    for (const [width, color] of [[11, 'rgba(15,23,35,0.75)'], [4, `rgb(${r},${g},${b})`]] as const) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(-12, -184); ctx.lineTo(0, -173); ctx.lineTo(12, -184); ctx.stroke();
    }
    ctx.fillStyle = '#fff2e1';
    ctx.fillRect(-2, -201, 4, 8);
    ctx.restore();
  }
  tex.update(true);
  tex.hasAlpha = true;
  return tex;
}

export interface HomingReticle {
  showAt(p: Vec3): void;
  hide(): void;
}

/** Eligibility still comes exclusively from the existing homing preview in playerController. */
export function createHomingReticle(scene: Scene): HomingReticle {
  const mat = new StandardMaterial('homingReticleMat', scene);
  mat.diffuseTexture = reticleTexture(scene);
  mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true;
  mat.emissiveColor = Color3.White();
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;
  mat.fogEnabled = false;
  mat.disableDepthWrite = true;

  const mesh = CreatePlane('homingReticle', { size: CRYSTAL_EXTENT * 1.16 }, scene);
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.renderingGroupId = 1; // Aim feedback stays legible over the marked crystal.
  mesh.setEnabled(false);
  let state = HIDDEN_RETICLE;
  const apply = () => {
    const appearance = reticleAppearance(state);
    mesh.scaling.setAll(appearance.scale);
    mat.alpha = appearance.alpha;
  };
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!state.target) return;
    state = stepReticle(state, state.target, scene.getEngine().getDeltaTime() / 1000);
    apply();
  });
  // Also release when a caller disposes just this mesh; full level teardown disposes the scene.
  mesh.onDisposeObservable.addOnce(() => scene.onBeforeRenderObservable.remove(observer));
  return {
    showAt(p) {
      state = stepReticle(state, p, 0);
      mesh.position.copyFromFloats(p.x, p.y, p.z);
      apply();
      mesh.setEnabled(true);
    },
    hide() {
      state = HIDDEN_RETICLE;
      mesh.setEnabled(false);
    },
  };
}