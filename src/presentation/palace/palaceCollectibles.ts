import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { PALACE_LAYOUT } from '../../domain/palace/palaceLayout';
import type { PalaceRun } from '../../domain/palace/palaceRun';
import type { PalaceMaterials } from './palaceMaterials';
import { createBeveledBox } from './palaceArchitecture';

/** A minted disc, raised rim and a two-sided diamond seal, all one gold draw per coin. */
export function createPalaceCoins(scene: Scene, materials: PalaceMaterials) {
  return PALACE_LAYOUT.coins.map((p, i) => {
    const disc = CreateCylinder('coinDisc', { diameter: .5, height: .075, tessellation: 40 }, scene);
    disc.rotation.x = Math.PI / 2;
    const parts = [disc];
    for (const side of [-1, 1]) {
      const rim = CreateTorus('coinRim', { diameter: .445, thickness: .024, tessellation: 40 }, scene);
      rim.rotation.x = Math.PI / 2; rim.position.z = side * .043; parts.push(rim);
      const seal = createBeveledBox('coinSeal', { width: .19, height: .19, depth: .024, bevel: .014 }, scene);
      seal.rotation.z = Math.PI / 4; seal.position.z = side * .043; parts.push(seal);
      for (const x of [-.165, .165]) {
        const stroke = createBeveledBox('coinStroke', { width: .02, height: .11, depth: .02, bevel: .004 }, scene);
        stroke.position.set(x, 0, side * .045); parts.push(stroke);
      }
    }
    parts.forEach(m => m.removeVerticesData(VertexBuffer.UVKind));
    const coin = Mesh.MergeMeshes(parts, true, true)!;
    coin.name = 'palaceCoin' + i; coin.material = materials.gold; coin.isPickable = false;
    coin.position.set(p.x, p.y, 0); return coin;
  });
}

/** One reusable burst follows the newest checkpoint; its clock is the paused game clock. */
export function createCheckpointFeedback(scene: Scene, markers: Mesh[]) {
  const light = (name: string, color: string) => {
    const material = new StandardMaterial(name, scene);
    material.disableLighting = true; material.emissiveColor = Color3.FromHexString(color);
    material.diffuseColor = Color3.Black(); material.specularColor = Color3.Black(); return material;
  };
  const dormant = light('palaceCheckpointDormant', '#758da5');
  const active = light('palaceCheckpointActive', '#88d9ff');
  const burst = light('palaceCheckpointBurst', '#b8e7ff');
  const pulse = CreateTorus('palaceCheckpointPulse', { diameter: 1, thickness: .045, tessellation: 64 }, scene);
  pulse.material = burst; pulse.isPickable = false; pulse.setEnabled(false);
  const motes = Array.from({ length: 12 }, (_, i) => {
    const mote = CreateSphere('checkpointMote' + i, { diameter: .07, segments: 6 }, scene);
    mote.material = burst; mote.isPickable = false; mote.setEnabled(false); return mote;
  });
  let previous = -1, started: number | null = null, previousTime = 0;
  return (run: PalaceRun) => {
    if (run.elapsed < previousTime || run.checkpoint < previous) { previous = -1; started = null; }
    if (run.checkpoint > previous) {
      started = run.elapsed;
      const point = PALACE_LAYOUT.checkpoints[run.checkpoint]!;
      pulse.position.set(point.x, point.y + .04, 0);
    }
    previous = run.checkpoint; previousTime = run.elapsed;
    markers.forEach((mesh, i) => {
      mesh.material = i <= run.checkpoint ? active : dormant;
      mesh.rotation.z = run.elapsed * .35;
    });
    const age = started === null ? Infinity : run.elapsed - started;
    const visible = age >= 0 && age < 1.65;
    pulse.setEnabled(visible); pulse.scaling.setAll(1 + Math.min(age, 1.65) * 3.2);
    pulse.visibility = Math.max(0, 1 - age / 1.65);
    motes.forEach((mote, i) => {
      mote.setEnabled(visible);
      if (!visible) return;
      const angle = i * Math.PI * 2 / motes.length, radius = .25 + age * .85;
      mote.position.set(pulse.position.x + Math.cos(angle) * radius,
        pulse.position.y + .2 + age * (1.4 + (i % 3) * .22), Math.sin(angle) * radius);
      mote.visibility = pulse.visibility; mote.scaling.setAll(1 + age * .4);
    });
  };
}
