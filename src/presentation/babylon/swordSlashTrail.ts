import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SWORD_ACTIVE_START, SWORD_ACTIVE_END } from '../../domain/hub/character/swordAttack';

const CAPACITY = 16;
const LIFETIME = .10;
interface BladeSample { seconds: number; heel: Vector3; tip: Vector3 }

/** A world-space ribbon swept by the blade itself, independent of model facing or swing plane. */
export function createSwordSlashTrail(scene: Scene) {
  const mesh = new Mesh('swordSlashArc', scene);
  const material = new StandardMaterial('slashArcMaterial', scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.FromHexString('#b9f8ff');
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.hasVertexAlpha = true;
  const positions = new Float32Array(CAPACITY * 6);
  const colors = new Float32Array(CAPACITY * 8);
  const indices: number[] = [];
  for (let i = 0; i < CAPACITY - 1; i++) indices.push(i*2, i*2+1, i*2+2, i*2+1, i*2+3, i*2+2);
  mesh.setVerticesData('position', positions, true);
  mesh.setVerticesData('color', colors, true);
  mesh.setIndices(indices);
  mesh.setEnabled(false);
  const samples: BladeSample[] = [];
  return {
    mesh,
    update(seconds: number | null, heel: Vector3, tip: Vector3) {
      if (seconds === null || seconds < SWORD_ACTIVE_START || seconds > SWORD_ACTIVE_END) {
        samples.length = 0; mesh.setEnabled(false); return;
      }
      const previous = samples.at(-1);
      // Reset on a new swing, time discontinuity, or teleport rather than joining unrelated poses.
      if (previous && (seconds < previous.seconds || seconds - previous.seconds > LIFETIME ||
          Vector3.Distance(previous.tip, tip) > 2)) samples.length = 0;
      else if (previous?.seconds === seconds) samples.pop();
      samples.push({ seconds, heel: heel.clone(), tip: tip.clone() });
      while (samples.length > CAPACITY || (samples.length > 1 && seconds - samples[0].seconds > LIFETIME)) samples.shift();
      mesh.setEnabled(samples.length > 1);
      for (let i = 0; i < CAPACITY; i++) {
        // Unused triangles collapse to the newest edge; no stale geometry survives a shorter swing.
        const sample = samples[Math.min(i, samples.length - 1)];
        sample.heel.toArray(positions, i * 6); sample.tip.toArray(positions, i * 6 + 3);
        const opacity = i < samples.length ? Math.max(0, 1 - (seconds - sample.seconds) / LIFETIME) : 0;
        colors.set([1,1,1,opacity*.18, 1,1,1,opacity], i * 8);
      }
      mesh.updateVerticesData('position', positions, true);
      mesh.updateVerticesData('color', colors);
      material.alpha = .6 * Math.sin(Math.PI * (seconds - SWORD_ACTIVE_START) / (SWORD_ACTIVE_END - SWORD_ACTIVE_START));
    },
    dispose() { samples.length = 0; mesh.dispose(); material.dispose(); },
  };
}
