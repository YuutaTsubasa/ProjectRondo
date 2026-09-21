import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { COURSE_PLATFORMS, COURSE_GATES, type CoursePlatform } from '../../domain/course/courseLayout';
import { rng } from '../../domain/math/rng';
import { createNaturalFoliage, type FoliagePatch } from './naturalFoliage';

/** Everything physical is built before the character is created. Shadow registration waits for its camera. */
export function createCourseScenery(scene: Scene): { casters: Mesh[]; receivers: Mesh[] } {
  const casters: Mesh[] = [], receivers: Mesh[] = [];
  const random = rng(921);
  const material = (name: string, color: Color3) => {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.11);
    mat.specularColor = new Color3(0.025, 0.025, 0.02);
    return mat;
  };
  const stone = material('courseLimestone', new Color3(0.58, 0.58, 0.48));
  const stoneLight = material('courseWornEdges', new Color3(0.72, 0.70, 0.58));
  const rock = material('courseCliffRock', Color3.White());
  rock.backFaceCulling = false;
  const grass = material('courseMeadow', Color3.White());
  // This asset packs scalar detail channels, not an sRGB albedo image. Using it as diffuse
  // multiplies the entire meadow by dark grey and makes the running line nearly disappear.
  const detail = new Texture('/textures/meadow-detail.png', scene);
  detail.gammaSpace = false;
  detail.anisotropicFilteringLevel = 8;
  grass.detailMap.texture = detail;
  grass.detailMap.diffuseBlendLevel = 1.15;
  grass.detailMap.bumpLevel = 0;
  grass.detailMap.isEnabled = true;
  grass.specularColor = Color3.Black();
  const bark = material('courseBark', new Color3(0.30, 0.26, 0.17));
  const marker = material('courseGateLight', new Color3(0.26, 0.66, 0.77));
  marker.emissiveColor = new Color3(0.13, 0.37, 0.43);
  const shrubs: FoliagePatch[] = [];
  const grassPositions: number[] = [], grassNormals: number[] = [], grassColors: number[] = [], grassIndices: number[] = [];
  const flowerPositions: number[] = [], flowerColors: number[] = [], flowerIndices: number[] = [];
  const box = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat = stone) => {
    const mesh = CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z); mesh.material = mat; mesh.isPickable = false;
    casters.push(mesh); receivers.push(mesh);
    return mesh;
  };

  COURSE_PLATFORMS.forEach((platform, index) => {
    const { center, width, depth } = platform;
    // The exact rectangular support envelope is separate from the chipped decorative cliff skirt.
    const support = CreateBox(`courseSupport_${platform.id}`, { width, depth, height: 3 }, scene);
    support.position.set(center.x, center.y - 1.5, center.z);
    support.isVisible = false; support.isPickable = false;
    new PhysicsAggregate(support, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene);
    const cliff = cliffSkirt(scene, platform, index);
    cliff.material = rock; cliff.isPickable = false;
    casters.push(cliff); receivers.push(cliff);
    const top = CreateGround(`courseGround_${platform.id}`, { width, height: depth, subdivisions: 18 }, scene);
    top.position.set(center.x, center.y + 0.008, center.z);
    top.material = grass; top.isPickable = false;
    const points = top.getVerticesData(VertexBuffer.PositionKind)!;
    const colors: number[] = [], uvs: number[] = [];
    for (let vertex = 0; vertex < points.length; vertex += 3) {
      const x = points[vertex], z = points[vertex + 2];
      const patch = 0.5 + 0.5 * Math.sin(x * 0.39 + index) * Math.cos(z * 0.24);
      const path = Math.max(0, 1 - Math.abs(x - Math.sin((z + center.z) * 0.12) * 0.55) / 1.9);
      const tint = Color3.Lerp(new Color3(0.34 + patch * 0.09, 0.45 + patch * 0.10, 0.25 + patch * 0.05), new Color3(0.62, 0.57, 0.43), path * 0.75);
      colors.push(tint.r, tint.g, tint.b, 1);
      uvs.push((x + center.x) / 5, (z + center.z) / 5);
    }
    top.setVerticesData(VertexBuffer.ColorKind, colors);
    top.setVerticesData(VertexBuffer.UVKind, uvs);
    receivers.push(top);

    // Worn coping makes the two sides of every gap readable without concealing its drop.
    for (const end of [-1, 1]) {
      const z = center.z + end * (depth / 2 - 0.32);
      box(`courseLandingLip_${index}_${end}`, center.x, center.y + 0.035, z, width - 0.45, 0.07, 0.55, stoneLight);
    }
    // Broken bridge foundations and occasional columns give the stepping stones a shared ruin history.
    if (index >= 1 && index <= 3) {
      for (const side of [-1, 1]) {
        const x = center.x + side * (width / 2 - 0.7);
        const pillar = box(`courseBrokenParapet_${index}_${side}`, x, center.y + 0.65, center.z - 1.6, 0.8, 1.3, 0.8);
        pillar.rotation.y = side * 0.08;
        box(`courseParapetCap_${index}_${side}`, x, center.y + 1.35, center.z - 1.6, 1.05, 0.16, 1.05, stoneLight);
      }
    }

    // Clumped grass follows the broad meadow shoulders, leaving a generous central running line.
    const count = Math.floor(width * depth * 1.1);
    for (let i = 0; i < count; i++) {
      const x = (random() - 0.5) * (width - 1.2), z = (random() - 0.5) * (depth - 1.2);
      if (Math.abs(x) < 2.5 || random() < 0.22) continue;
      const wx = x + center.x, wz = z + center.z, y = center.y + 0.012;
      for (let blade = 0; blade < 3; blade++) {
        const angle = random() * Math.PI * 2, height = 0.15 + random() * 0.28, w = 0.035;
        const dx = Math.cos(angle) * w, dz = Math.sin(angle) * w;
        const start = grassPositions.length / 3;
        grassPositions.push(wx - dx, y, wz - dz, wx + dx, y, wz + dz, wx + 0.08, y + height, wz + 0.06);
        grassNormals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        const tone = random() * 0.08;
        for (let v = 0; v < 3; v++) grassColors.push(0.29 + tone, 0.43 + tone, 0.18 + tone * 0.5, 1);
        grassIndices.push(start, start + 1, start + 2);
      }
      if (random() < 0.09) {
        const start = flowerPositions.length / 3, h = 0.2 + random() * 0.13, r = 0.07;
        flowerPositions.push(wx - r, y + h, wz, wx, y + h + 0.04, wz - r, wx + r, y + h, wz, wx, y + h - 0.02, wz + r);
        const color = random() > 0.5 ? [0.68, 0.72, 0.88] : [0.91, 0.79, 0.46];
        for (let v = 0; v < 4; v++) flowerColors.push(...color, 1);
        flowerIndices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }
    }
    if (width >= 14) {
      for (const side of [-1, 1]) {
        for (let n = 0; n < 3; n++) {
          shrubs.push({ center: [center.x + side * (width / 2 - 1.05), center.y + 0.35, center.z + (n - 1) * depth * 0.29], radius: [0.95, 0.65, 1.45], sprays: 12 });
        }
      }
    }
  });
  const tufts = new Mesh('courseGrassTufts', scene);
  const blades = new VertexData();
  blades.positions = grassPositions; blades.normals = grassNormals; blades.colors = grassColors; blades.indices = grassIndices;
  blades.applyToMesh(tufts);
  const bladeMaterial = material('courseGrassBlades', Color3.White()); bladeMaterial.backFaceCulling = false;
  tufts.material = bladeMaterial; tufts.isPickable = false; receivers.push(tufts);
  const flowers = new Mesh('courseMeadowFlowers', scene);
  const petals = new VertexData();
  petals.positions = flowerPositions; petals.colors = flowerColors; petals.indices = flowerIndices;
  petals.normals = flowerPositions.map((_, i) => i % 3 === 1 ? 1 : 0); petals.applyToMesh(flowers);
  const flowerMaterial = material('coursePetals', Color3.White()); flowerMaterial.backFaceCulling = false;
  flowers.material = flowerMaterial; flowers.isPickable = false;
  const bushes = createNaturalFoliage(scene, 'courseShrubs', shrubs, 823);
  receivers.push(bushes); casters.push(bushes);

  // A handful of open crowns frames each safe bank; trunks stay outside the six-metre running corridor.
  for (const [i, entry] of [[0, -1], [0, 1], [4, -1], [5, 1], [7, 1], [8, -1], [8, 1]].entries()) {
    const p = COURSE_PLATFORMS[entry[0]], side = entry[1];
    const x = p.center.x + side * (p.width / 2 - 1.6), z = p.center.z + (i % 2 ? 3 : -3);
    const trunk = CreateCylinder(`courseTreeTrunk_${i}`, { height: 4.8, diameterBottom: 0.55, diameterTop: 0.25, tessellation: 7 }, scene);
    trunk.position.set(x, p.center.y + 2.4, z); trunk.material = bark; trunk.isPickable = false;
    new PhysicsAggregate(trunk, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
    const leaves = createNaturalFoliage(scene, `courseTreeCrown_${i}`, [
      { center: [x, p.center.y + 5.2, z], radius: [2.7, 1.7, 2.4], sprays: 36 },
      { center: [x + side * 1.1, p.center.y + 4.4, z + 0.7], radius: [1.9, 1.15, 1.6], sprays: 20 },
    ], 900 + i);
    casters.push(trunk, leaves); receivers.push(trunk, leaves);
  }

  for (const [i, gate] of COURSE_GATES.entries()) {
    const top = gate.center.y - 1;
    for (const side of [-1, 1]) {
      const x = gate.center.x + side * (gate.halfWidth + 0.8);
      box(`courseGatePlinth_${i}_${side}`, x, top + 0.18, gate.center.z, 1.05, 0.36, 1.05, stoneLight);
      box(`courseGateStone_${i}_${side}`, x, top + 1.1, gate.center.z, 0.6, 1.5, 0.65);
      box(`courseGateInset_${i}_${side}`, x, top + 1.24, gate.center.z - 0.335, 0.22, 0.65, 0.025, marker);
    }
    // A flat inlaid stripe is inside the actual checkpoint volume.
    box(`courseGateThreshold_${i}`, gate.center.x, top + 0.015, gate.center.z, gate.halfWidth * 2, 0.03, 0.24, stoneLight);
  }
  arch(scene, 0, 0.8, 199, 1, stone, stoneLight, casters, receivers);
  // Inaccessible layered landforms and ruined silhouettes give the route a landscape beyond its edges.
  const distant = material('courseDistantSage', new Color3(0.37, 0.48, 0.39));
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    const hill = CreateIcoSphere(`courseDistantHill_${i}`, { radius: 1, subdivisions: 2, flat: true }, scene);
    hill.position.set(side * (47 + random() * 23), -9 + random() * 4, -10 + Math.floor(i / 2) * 48);
    hill.scaling.set(22 + random() * 12, 12 + random() * 10, 35 + random() * 14);
    hill.material = distant; hill.isPickable = false;
  }
  arch(scene, -34, -4, 168, 1.8, stone, stoneLight, [], []);
  const valley = CreateGround('courseValleyMist', { width: 650, height: 650 }, scene);
  valley.position.set(0, -24, 100);
  valley.material = material('courseValleyBlue', new Color3(0.39, 0.55, 0.56));
  valley.isPickable = false;
  return { casters, receivers };
}

/** Angular strata taper into the valley instead of presenting the platform as a suspended box. */
function cliffSkirt(scene: Scene, p: CoursePlatform, seed: number): Mesh {
  const random = rng(seed + 741), w = p.width / 2, d = p.depth / 2, cut = 0.45;
  const outline = [[-w + cut, -d], [w - cut, -d], [w, -d + cut], [w, d - cut], [w - cut, d], [-w + cut, d], [-w, d - cut], [-w, -d + cut]];
  const rings = [0, 1, 2].map((ring) => outline.map(([x, z]) => new Vector3(
    x * (ring === 1 ? 1.02 : ring === 2 ? 0.76 : 1),
    ring === 0 ? -0.025 : ring === 1 ? -1.6 - random() * 0.7 : -6.2 - random() * 2,
    z * (ring === 1 ? 1.01 : ring === 2 ? 0.89 : 1),
  )));
  const positions: number[] = [], indices: number[] = [], normals: number[] = [], colors: number[] = [];
  for (let band = 0; band < 2; band++) for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8, points = [rings[band][i], rings[band][next], rings[band + 1][next], rings[band + 1][i]];
    const normal = Vector3.Cross(points[1].subtract(points[0]), points[2].subtract(points[0])).normalize();
    const mid = points[0].add(points[1]);
    if (normal.x * mid.x + normal.z * mid.z < 0) normal.scaleInPlace(-1);
    const start = positions.length / 3, tint = 0.88 + random() * 0.18;
    for (const point of points) {
      positions.push(point.x, point.y, point.z); normals.push(normal.x, normal.y, normal.z);
      colors.push((band ? 0.34 : 0.46) * tint, (band ? 0.37 : 0.47) * tint, (band ? 0.32 : 0.37) * tint, 1);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const data = new VertexData(); data.positions = positions; data.normals = normals; data.indices = indices; data.colors = colors;
  const mesh = new Mesh(`courseCliff_${p.id}`, scene); data.applyToMesh(mesh);
  mesh.position.set(p.center.x, p.center.y, p.center.z);
  return mesh;
}

function arch(scene: Scene, x: number, y: number, z: number, scale: number, stone: StandardMaterial, cap: StandardMaterial, casters: Mesh[], receivers: Mesh[]): void {
  const block = (name: string, bx: number, by: number, w: number, h: number, rotation = 0) => {
    const mesh = CreateBox(name, { width: w * scale, height: h * scale, depth: 1.35 * scale }, scene);
    mesh.position.set(x + bx * scale, y + by * scale, z); mesh.rotation.z = rotation;
    mesh.material = name.includes('cap') ? cap : stone; mesh.isPickable = false;
    casters.push(mesh); receivers.push(mesh);
  };
  for (const side of [-1, 1]) {
    block(`courseArchBase_${x}_${side}`, side * 5.05, 0.25, 1.9, 0.5);
    for (let course = 0; course < 4; course++) block(`courseArchPier_${x}_${side}_${course}`, side * 5.05, 1.03 + course * 1.08, 1.15, 1.03);
    block(`courseArch_cap_${x}_${side}`, side * 5.05, 4.65, 1.65, 0.3);
  }
  for (let i = 0; i < 11; i++) {
    const angle = Math.PI * (i + 0.5) / 11;
    block(`courseArchVoussoir_${x}_${i}`, Math.cos(angle) * 5.05, 4.6 + Math.sin(angle) * 5.05, 1.48, 1.2, angle - Math.PI / 2);
  }
}
