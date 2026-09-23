import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { createArch, createBeveledBox, createColumn, createDome } from './palaceArchitecture';
import { mergePalaceParts, type PalaceMaterials } from './palaceMaterials';
import type { Shadows } from '../babylon/shadows';

/** World-space palace buildings: no scrolling billboards or camera-dependent offsets. */
export function createPalaceDistrict(scene: Scene, shadows: Shadows, materials: PalaceMaterials) {
  let parts: Mesh[] = [];
  const place = (mesh: Mesh, x: number, y: number, z: number, material = materials.stone) => {
    mesh.position.set(x, y, z); mesh.material = material; parts.push(mesh); return mesh;
  };
  const box = (x: number, y: number, z: number, width: number, height: number, depth: number, material = materials.stone, bevel = .06) =>
    place(createBeveledBox('palaceMasonry', { width, height, depth, bevel }, scene), x, y, z, material);
  const column = (x: number, y: number, z: number, height: number, radius: number) =>
    place(createColumn('palaceColumn', { height, radius }, scene), x, y, z, materials.light);
  const arch = (x: number, y: number, z: number, width: number, rise: number, thickness: number, depth: number) =>
    place(createArch('palaceArch', { width, rise, thickness, depth, segments: 24 }, scene), x, y, z, materials.light);
  const flush = (name: string, cast: boolean) => { mergePalaceParts(name, parts, shadows, cast, true); parts = []; };

  // An inhabited lower district gives the tall piers a coherent foundation below the falling zone.
  box(98, -25.5, -32, 240, 3, 110, materials.aged, .18);
  flush('palaceFoundation', false);

  const tower = (x: number, z: number, base: number, width: number, height: number, dome: boolean) => {
    const front = z + width / 2;
    box(x, base + height / 2, z, width, height, width, materials.stone, .13);
    box(x, base + .35, z, width + .6, .7, width + .6, materials.aged);
    box(x, base + height - .35, z, width + .3, .32, width + .3, materials.light);
    box(x, base + height + .1, z, width + .7, .42, width + .7, materials.light);
    for (const dx of [-width / 2 + .22, width / 2 - .22]) {
      box(x + dx, base + height / 2, front + .1, .35, height - .65, .3, materials.light);
    }
    for (let dx = -width / 2 + .45; dx < width / 2; dx += .65) {
      box(x + dx, base + height - .62, front + .16, .20, .30, .32, materials.light, .025);
    }
    for (let y = base + 2.3; y < base + height - 2; y += 3.7) {
      box(x, y - 1.25, z, width + .09, .12, width + .09, materials.aged, .018);
      for (const dx of [-width * .23, width * .23]) {
        const w = Math.min(1.1, width * .2), h = 1.9;
        box(x + dx, y, front + .035, w, h, .09, materials.recess, .02);
        box(x + dx - w / 2 - .08, y, front + .14, .14, h + .25, .26, materials.light, .018);
        box(x + dx + w / 2 + .08, y, front + .14, .14, h + .25, .26, materials.light, .018);
        box(x + dx, y, front + .11, .07, h, .13, materials.light, .012);
        box(x + dx, y - h / 2, front + .21, w + .4, .16, .4, materials.light, .025);
        arch(x + dx, y + h / 2 - .12, front + .14, w, .45, .16, .27);
      }
    }
    if (dome) {
      place(CreateCylinder('palaceDrum', { diameter: width * .88, height: 1.3, tessellation: 40 }, scene), x, base + height + .8, z, materials.light);
      place(createDome('palaceDome', { radius: width * .51, height: width * .62, segments: 40 }, scene), x, base + height + 1.45, z, materials.roof);
      place(CreateCylinder('palaceFinial', { diameterBottom: .25, diameterTop: 0, height: 1.1, tessellation: 16 }, scene), x, base + height + 2 + width * .62, z, materials.gold);
    } else {
      const roof = place(CreateCylinder('palacePavilionRoof', { diameterBottom: width * 1.65, diameterTop: .1, height: width * .7, tessellation: 4 }, scene), x, base + height + width * .35 + .35, z, materials.roof);
      roof.rotation.y = Math.PI / 4;
    }
  };

  // Unequal heights, setbacks and openings make parallax read as a city, not a repeating wall.
  for (const [i, x] of [-12, 21, 57, 88, 121, 151, 183, 213].entries()) {
    const z = -42 - (i % 3) * 7, base = -24, height = 26 + [0, 5, 1, 8][i % 4]!;
    const width = 8 + (i % 2) * 2;
    tower(x, z, base, width, height, true);
    box(x + 11, -12, z + 1, 13, 24, 8, materials.stone, .14);
    box(x + 11, .25, z + 1, 13.5, .5, 8.5, materials.light);
    for (let bay = 0; bay <= 4; bay++) {
      const dx = 6 + bay * 2.8;
      column(x + dx, .5, z + 4.5, 3.8, .25);
      if (bay < 4) arch(x + dx + 1.4, 3.45, z + 4.5, 2.25, 1, .3, .65);
    }
    box(x + 11.6, 4.95, z + 1.5, 14.5, .4, 8.5, materials.light);
    flush('palaceDistantBlock' + i, false);
  }
  for (const [i, x] of [8, 54, 91, 143, 180].entries()) {
    tower(x + 5, -19 - (i % 2) * 3, -24, 6.3, 33 + (i % 2) * 3, i % 2 === 0);
    // Flanking gate towers set behind the play lane do not hide the player or target reticles.
    if (i === 0 || i === 4) tower(x - 6, -21, -24, 5, 30, false);
    flush('palaceMiddleTower' + i, false);
  }

  // Five short open loggias behind broad landing terraces. No foreground wall crosses the route.
  for (const [i, config] of [[3.5, 3, 0], [49.4, 4, 0], [84, 3, 0], [143, 3, 0], [175, 4, 0]].entries()) {
    const [start, bays, floor] = config as [number, number, number];
    const spacing = 3.1, z = -7.4, end = start + bays * spacing;
    box((start + end) / 2, floor - 12, z - 2, end - start + 4.3, 24, 5, materials.aged, .1);
    box((start + end) / 2, floor - .18, z - 2, end - start + 4.5, .36, 5.3, materials.light);
    for (let n = 0; n <= bays; n++) column(start + n * spacing, floor, z, 4.5, .24);
    for (let n = 0; n < bays; n++) arch(start + (n + .5) * spacing, floor + 3.4, z, 2.5, 1.35, .28, .85);
    box((start + end) / 2, floor + 5.17, z - 1.6, end - start + 1, .35, 4.6, materials.light);
    box((start + end) / 2, floor + 5.43, z - 1.6, end - start + 1.15, .18, 4.8, materials.roof);
    // Hanging blue standards and brass rails echo the slate roofs without entering the play lane.
    for (const x of [start + .45, end - .45]) {
      box(x, floor + 3.6, z + .52, 1.05, .07, .10, materials.gold, .012);
      box(x, floor + 2.57, z + .53, .72, 1.95, .06, materials.banner, .015);
      box(x, floor + 1.63, z + .57, .70, .10, .055, materials.gold, .008);
      const seal = box(x, floor + 2.65, z + .58, .22, .22, .055, materials.gold, .015);
      seal.rotation.z = Math.PI / 4;
    }
    for (const x of [start - 1.25, end + 1.25]) {
      box(x, floor + .35, z - .5, 1.15, .7, 1.15, materials.aged, .10);
      box(x, floor + .72, z - .5, 1.28, .14, 1.28, materials.light, .045);
      const crown = CreateLathe('palaceCypress', { shape: [
        new Vector3(0, 0, 0), new Vector3(.30, .1, 0), new Vector3(.44, .45, 0),
        new Vector3(.40, 1.05, 0), new Vector3(.29, 1.9, 0), new Vector3(.16, 2.55, 0), new Vector3(0, 2.95, 0),
      ], tessellation: 20 }, scene);
      place(crown, x, floor + .8, z - .5, materials.foliage);
    }
    flush('palaceLoggia' + i, true);
  }
}
