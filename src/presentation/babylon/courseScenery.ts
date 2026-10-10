import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { COURSE_PLATFORMS, COURSE_GATES } from '../../domain/course/courseLayout';
import { createArch, createArchSpandrel, createBeveledBox, createColumn, createDome } from '../palace/palaceArchitecture';
import { createPalaceMaterials } from '../palace/palaceMaterials';
import { applyStoneUV } from '../palace/palaceStoneSurface';
import { createCourseCloudScenery } from '../course/courseCloudScenery';

/** Same authored supports and jump gaps; all ornament is nonphysical and outside the running lane. */
export function createCourseScenery(scene: Scene): { casters: Mesh[]; receivers: Mesh[]; update(elapsed: number): void } {
  const casters: Mesh[] = [], receivers: Mesh[] = [];
  const materials = createPalaceMaterials(scene);
  let parts: Mesh[] = [];
  const add = (mesh: Mesh, x: number, y: number, z: number, material = materials.light) => {
    mesh.position.set(x, y, z); mesh.material = material; mesh.isPickable = false;
    parts.push(mesh); return mesh;
  };
  const box = (name: string, x: number, y: number, z: number, width: number, height: number, depth: number, material = materials.stone, bevel = .035) =>
    add(createBeveledBox(name, { width, height, depth, bevel }, scene), x, y, z, material);
  const column = (name: string, x: number, y: number, z: number, height: number, radius: number) =>
    add(createColumn(name, { height, radius }, scene), x, y, z);
  const arch = (name: string, x: number, y: number, z: number, width: number, rise: number, depth: number, rotation = 0) => {
    const mesh = add(createArch(name, { width, rise, thickness: .32, depth, segments: 20 }, scene), x, y, z);
    mesh.rotation.y = rotation; return mesh;
  };
  // Keep separate buildings/platforms independently culled; one draw per material in each batch.
  const flush = (name: string, cast = true) => {
    const groups = new Map<PBRMaterial, Mesh[]>();
    for (const part of parts) {
      part.removeVerticesData(VertexBuffer.UVKind);
      const material = part.material as PBRMaterial;
      const group = groups.get(material) ?? [];
      group.push(part); groups.set(material, group);
    }
    for (const [material, meshes] of groups) {
      const mesh = Mesh.MergeMeshes(meshes, true, true, undefined, false, false)!;
      mesh.name = `${name}:${material.name}`; mesh.material = material; mesh.isPickable = false;
      if (material.bumpTexture) applyStoneUV(mesh);
      mesh.freezeWorldMatrix();
      if (cast) casters.push(mesh);
      receivers.push(mesh);
    }
    parts = [];
  };

  for (const p of COURSE_PLATFORMS) {
    const { x, y, z } = p.center, w = p.width, d = p.depth;
    const support = CreateBox(`courseSupport_${p.id}`, { width: w, depth: d, height: 3 }, scene);
    support.position.set(x, y - 1.5, z); support.isVisible = false; support.isPickable = false;
    new PhysicsAggregate(support, PhysicsShapeType.BOX, { mass: 0, friction: .8 }, scene);
    // The top stays separate so its actual mesh bounds can be checked against the collider.
    const top = box(`courseGround_${p.id}`, x, y - .14, z, w, .28, d, materials.light, .018);
    parts.pop(); applyStoneUV(top); top.freezeWorldMatrix(); casters.push(top); receivers.push(top);
    box('terraceDeck', x, y - .77, z, w - .1, .98, d - .1);
    box('terraceUpperCornice', x, y - .36, z, w - .03, .16, d - .03, materials.light);
    box('terraceLowerCornice', x, y - 1.22, z, w - .06, .2, d - .06, materials.light);
    for (const side of [-1, 1]) {
      box('terraceGiltFrieze', x + side * (w / 2 - .047), y - .62, z, .025, .055, d - .5, materials.gold, .003);
      // Long arcades support the side walls, with real open arches visible from any camera angle.
      const bays = Math.max(1, Math.round(d / 6)), bay = (d - .8) / bays;
      const spring = y - 5.7, rise = 4.25, opening = bay - .7;
      const sx = x + side * (w / 2 - .65);
      for (let b = 0; b <= bays; b++) {
        const sz = z - d / 2 + .4 + b * bay;
        box('terracePier', sx, -14 + (spring + 14) / 2, sz, 1.15, spring + 14, .7);
        box('terracePierCapital', sx, spring - .1, sz, 1.35, .24, .88, materials.light);
        box('terracePierPilaster', sx + side * .56, spring - 3.2, sz, .18, 6.1, .38, materials.light);
        if (b < bays) {
          const archZ = sz + bay / 2;
          const spandrel = add(createArchSpandrel('terraceSpandrel', { width: opening, rise, thickness: .2, depth: 1.12, segments: 20 }, scene), sx, spring, archZ, materials.stone);
          spandrel.rotation.y = Math.PI / 2;
          arch('terraceArchivolt', sx + side * .59, spring, archZ, opening, rise, .16, Math.PI / 2);
          box('terraceArchKey', sx + side * .7, spring + rise + .02, archZ, .18, .46, .35, materials.light);
        }
      }
      // Low side balustrades terminate before takeoff/landing edges, never across a gap.
      const railX = x + side * (w / 2 - .25), railDepth = d - 3.2;
      box('terraceHandrail', railX, y + .98, z, .34, .14, railDepth, materials.light);
      for (let rz = z - railDepth / 2 + .2; rz <= z + railDepth / 2; rz += 1.3) {
        box('terraceBaluster', railX, y + .49, rz, .17, .84, .2, materials.light, .04);
      }
      if (w >= 14) {
        const colX = x + side * (w / 2 - 1.1), spacing = 5.4;
        const count = Math.max(2, Math.floor((d - 6) / spacing) + 1);
        const length = (count - 1) * spacing;
        for (let i = 0; i < count; i++) {
          const colZ = z - length / 2 + i * spacing;
          column('terraceColonnade', colX, y, colZ, 4.5, .24);
          if (i + 1 < count) arch('terraceUpperArcade', colX, y + 4.5, colZ + spacing / 2, spacing - .7, 1.65, .5, Math.PI / 2);
          if (i % 2 === 0) {
            // Banners face inward and outward along the route's sides, clear of the central lane.
            box('terraceBlueBanner', colX, y + 2.95, colZ + .6, .075, 2.2, .85, materials.banner, .005);
            box('terraceBannerBorder', colX, y + 1.94, colZ + .6, .085, .08, .85, materials.gold, .005);
            box('terraceBannerRod', colX, y + 4.1, colZ + .6, .1, .08, 1.1, materials.gold);
          }
        }
        box('terraceColonnadeCornice', colX, y + 6.5, z, .9, .2, length + 1, materials.light);
      }
    }
    // Recessed paving lines and pale edge bands make the exact jump boundary legible.
    for (let pz = z - d / 2 + 2; pz < z + d / 2 - .2; pz += 2) {
      box('terracePavingJoint', x, y + .001, pz, w - .35, .003, .016, materials.aged, .001);
    }
    for (const edge of [-1, 1]) {
      box('terraceLandingInlay', x, y + .002, z + edge * (d / 2 - .28), w - .22, .004, .21, materials.gold, .001);
    }
    flush(`courseTerrace_${p.id}`);
  }

  for (const [i, gate] of COURSE_GATES.entries()) {
    const y = gate.center.y - 1, x = gate.center.x, z = gate.center.z;
    for (const side of [-1, 1]) {
      const px = x + side * (gate.halfWidth + .6);
      box('gatePedestal', px, y + .13, z, .9, .26, .9, materials.light);
      column('gateColumn', px, y + .26, z, 2.3, .2);
      box('gateAzureInset', px, y + 1.5, z - .3, .22, .9, .07, materials.banner);
      add(createDome('gateFinial', { radius: .22, height: .32, segments: 16 }, scene), px, y + 2.56, z, materials.gold);
    }
    if (i === COURSE_GATES.length - 1) {
      for (const side of [-1, 1]) column('goalColumn', x + side * 5.8, y, z + 3.8, 5.6, .4);
      arch('goalTriumphalArch', x, y + 5.6, z + 3.8, 10.7, 3.5, 1.2);
      box('goalCrownKey', x, y + 9.13, z + 3.14, .65, .85, .15, materials.gold);
    }
    flush(`coursePalaceGate_${i}`);
  }

  // Separate tower batches preserve frustum culling and leave the two crystal chasms entirely open.
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (34 + (i % 3) * 14), z = -20 + Math.floor(i / 2) * 49;
    const width = 8 + (i % 3) * 2, top = 8 + (i % 4) * 4, base = -22;
    box('palaceTowerBody', x, (base + top) / 2, z, width, top - base, width);
    for (const y of [top - 7, top - 1, top]) {
      box('palaceTowerCornice', x, y, z, width + .7, .38, width + .7, materials.light);
    }
    // Four true facades, not camera-facing cards; the follow camera can orbit freely.
    for (const face of [-1, 1]) {
      for (const offset of [-width * .25, width * .25]) {
        for (const y of [top - 4.6, top - 11.2]) {
          box('palaceTowerWindow', x + offset, y, z + face * (width / 2 + .025), 1.15, 3, .08, materials.recess);
          arch('palaceTowerWindowArch', x + offset, y + 1.5, z + face * (width / 2 + .1), 1.15, .65, .14);
          box('palaceTowerWindow', x + face * (width / 2 + .025), y, z + offset, .08, 3, 1.15, materials.recess);
          arch('palaceTowerWindowArch', x + face * (width / 2 + .1), y + 1.5, z + offset, 1.15, .65, .14, Math.PI / 2);
        }
      }
    }
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      column('palaceTowerLanternColumn', x + dx * width * .3, top + .2, z + dz * width * .3, 3.4, .25);
    }
    box('palaceTowerLanternCrown', x, top + 3.7, z, width * .83, .35, width * .83, materials.light);
    add(createDome('palaceTowerRoof', { radius: width * .43, height: width * .37, segments: 24 }, scene), x, top + 3.85, z, materials.roof);
    column('palaceTowerSpire', x, top + 3.85 + width * .37, z, 1.5, .09).material = materials.gold;
    flush(`coursePalaceTower_${i}`, false);
  }
  const clouds = createCourseCloudScenery(scene);
  return { casters, receivers, update: clouds.update };
}
