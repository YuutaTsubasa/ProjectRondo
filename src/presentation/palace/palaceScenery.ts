import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Shadows } from '../babylon/shadows';
import { PALACE_LAYOUT } from '../../domain/palace/palaceLayout';
import type { PalaceRun } from '../../domain/palace/palaceRun';
import { createArch, createArchSpandrel, createBeveledBox, createColumn } from './palaceArchitecture';
import { createPalaceMaterials, mergePalaceParts } from './palaceMaterials';
import { applyStoneUV } from './palaceStoneSurface';
import { createPalaceDistrict } from './palaceDistrict';
import { createPalaceCoins, createCheckpointFeedback } from './palaceCollectibles';

export function createPalaceScenery(scene: Scene, shadows: Shadows) {
  const materials = createPalaceMaterials(scene);
  let parts: Mesh[] = [];
  const box = (name: string, x: number, y: number, z: number, width: number, height: number, depth: number, material = materials.stone, bevel = .035) => {
    const mesh = createBeveledBox(name, { width, height, depth, bevel }, scene);
    mesh.position.set(x, y, z); mesh.material = material; mesh.isPickable = false; parts.push(mesh); return mesh;
  };
  const arch = (name: string, x: number, y: number, z: number, width: number, rise: number, thickness: number, depth: number) => {
    const mesh = createArch(name, { width, rise, thickness, depth, segments: 28 }, scene);
    mesh.position.set(x, y, z); mesh.material = materials.light; parts.push(mesh); return mesh;
  };
  const flush = (name: string) => { mergePalaceParts(name, parts, shadows, true); parts = []; };

  for (const [index, p] of PALACE_LAYOUT.platforms.entries()) {
    const cx = p.x + p.width / 2, depth = 4.5;
    // Keep this surface separate so rendering/collision alignment can be verified directly.
    const top = box('palaceWalkable' + index, cx, p.y - .14, 0, p.width, .28, depth, materials.light, .025);
    parts.pop(); top.metadata = { palaceWalkable: index };
    applyStoneUV(top); top.freezeWorldMatrix(); shadows.cast(top); shadows.receive(top);
    box('palaceDeck', cx, p.y - .69, 0, p.width - .09, .82, depth - .16);
    box('palaceDeckCornice', cx, p.y - .32, 0, p.width - .03, .14, depth - .06, materials.light);
    box('palaceDeckFoot', cx, p.y - p.height + .10, 0, p.width - .05, .2, depth - .10, materials.aged);
    box('palaceFrieze', cx, p.y - .58, depth / 2 - .07, p.width - .3, .055, .07, materials.gold, .008);
    // Masonry joints sit in the side frieze, never as alpha cards over the walking surface.
    for (let x = p.x + 1.6; x < p.x + p.width - .4; x += 1.9) {
      box('palaceStoneJoint', x, p.y - .9, depth / 2 - .075, .014, .34, .024, materials.aged, .002);
    }
    const pierWidth = p.width > 7 ? .9 : .65, inset = pierWidth / 2 + .14;
    const innerWidth = p.width - 2 * (inset + pierWidth / 2), rise = Math.min(4.4, innerWidth * .55);
    const springY = p.y - p.height - rise - .38;
    for (const x of [p.x + inset, p.x + p.width - inset]) {
      const height = springY + 24;
      box('palaceBridgePier', x, -24 + height / 2, 0, pierWidth, height, depth - .3, materials.stone, .075);
      box('palacePierCap', x, springY - .14, 0, pierWidth + .1, .28, depth - .05, materials.light);
      box('palacePierBase', x, -23.6, 0, pierWidth + .5, .8, depth + .2, materials.aged, .1);
      box('palacePierPilaster', x, springY - 4, depth / 2 - .05, pierWidth * .46, 7.5, .2, materials.light, .035);
    }
    const spandrel = createArchSpandrel('palaceBridgeSpandrel', { width: innerWidth, rise, thickness: .42, depth: depth - .4 }, scene);
    spandrel.position.set(cx, springY, 0); spandrel.material = materials.stone; parts.push(spandrel);
    arch('palaceBridgeArch', cx, springY, depth / 2 - .12, innerWidth, rise, .34, .18);
    box('palaceArchKeystone', cx, springY + rise + .1, depth / 2 + .01, .34, .46, .22, materials.light);
    // Coping joints on top provide scale without changing the collision surface.
    for (let x = p.x + 1.5; x < p.x + p.width - .3; x += 1.5) {
      box('palacePavingJoint', x, p.y + .002, 0, .012, .006, depth - .16, materials.aged, .001);
    }
    // Back-edge balustrade adds depth but leaves all jump/landing silhouettes unobstructed.
    if (p.width > 7) {
      box('palaceRearRail', cx, p.y + .98, -depth / 2 + .16, p.width - .7, .16, .3, materials.light);
      for (let x = p.x + .5; x < p.x + p.width - .3; x += .95) {
        box('palaceBalusterFoot', x, p.y + .09, -depth / 2 + .16, .24, .18, .3, materials.light);
        box('palaceBaluster', x, p.y + .52, -depth / 2 + .16, .13, .72, .18, materials.stone, .04);
      }
    }
    flush('palaceBridge' + index);
  }
  createPalaceDistrict(scene, shadows, materials);

  const glow = new StandardMaterial('palaceAzureLight', scene);
  glow.diffuseColor = Color3.FromHexString('#68a8bf'); glow.emissiveColor = new Color3(.11, .3, .4);
  glow.specularColor = Color3.Black();
  const coins = createPalaceCoins(scene, materials);
  const checkpoints = PALACE_LAYOUT.checkpoints.map((p, i) => {
    box('checkpointBase' + i, p.x, p.y + .1, -1.1, .8, .2, .8, materials.aged);
    const stem = createColumn('checkpointStem' + i, { height: 1.45, radius: .14 }, scene);
    stem.position.set(p.x, p.y + .2, -1.1); stem.material = materials.light; parts.push(stem);
    const ring = CreateTorus('checkpointRing' + i, { diameter: .55, thickness: .045, tessellation: 40 }, scene);
    ring.position.set(p.x, p.y + 1.95, -1.1); ring.rotation.x = Math.PI / 2; ring.material = glow;
    return ring;
  });
  const updateCheckpoints = createCheckpointFeedback(scene, checkpoints);
  const goal = PALACE_LAYOUT.goal;
  for (const dx of [-2.2, 2.2]) {
    const column = createColumn('palaceGateColumn', { height: 3.2, radius: .3 }, scene);
    column.position.set(goal.x + dx, goal.y, -1.3); column.material = materials.light; parts.push(column);
  }
  arch('palaceGoalArch', goal.x, goal.y + 2.5, -1.3, 3.8, 2.05, .4, 1);
  box('palaceGateKeystone', goal.x, goal.y + 4.6, -.72, .42, .65, .18, materials.gold);
  const goalRing = CreateTorus('palaceGoal', { diameter: 1.35, thickness: .07, tessellation: 56 }, scene);
  goalRing.position.set(goal.x, goal.y + 1.7, -1.25); goalRing.rotation.x = Math.PI / 2; goalRing.material = glow;
  flush('palaceWaymarkers');

  return { update(run: PalaceRun, _cameraX: number) {
    coins.forEach((mesh, i) => { mesh.setEnabled(!run.collected.includes(i)); mesh.rotation.y = run.elapsed * 1.8 + i * .23; });
    updateCheckpoints(run);
    goalRing.rotation.z = run.elapsed * .3;
  } };
}
