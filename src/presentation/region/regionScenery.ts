import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { COURSE_ENTRANCE, REGION_INTERACTION_PLACES, REGION_PLACES, regionHeight, regionPathDistance } from '../../domain/region/regionLayout';
import type { TownBounds } from '../town/townAssets';
import { createNaturalFoliage } from '../babylon/naturalFoliage';
import { grassMesh, grassMaterial } from '../babylon/scatter';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { createStoneTextures, applyStoneUV } from '../palace/palaceStoneSurface';
import { applyWind } from '../babylon/wind';
import { rng } from '../../domain/math/rng';

export function createRegionScenery(scene: Scene) {
  const casters: AbstractMesh[] = [], receivers: AbstractMesh[] = [], cameraSolids: TownBounds[] = [];
  const material = (name: string, hex: string) => {
    const m = new StandardMaterial('region-' + name, scene); m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black(); return m;
  };
  const stone = material('weathered-stone', '#777e6d'), ivory = material('pale-stone', '#b7b5a1'), wood = material('timber', '#67563f');
  const surface = createStoneTextures(scene);
  for(const mat of [stone,ivory]){mat.diffuseTexture=surface.albedo;mat.bumpTexture=surface.normal;mat.diffuseColor.scaleInPlace(.7);}
  const palaceStone = new PBRMaterial('region-palace-cut-stone', scene);
  palaceStone.albedoColor = Color3.FromHexString('#e6e0d2').toLinearSpace();
  palaceStone.albedoTexture = surface.albedo; palaceStone.bumpTexture = surface.normal;
  palaceStone.metallicTexture = surface.roughness; palaceStone.useRoughnessFromMetallicTextureAlpha = false;
  palaceStone.useRoughnessFromMetallicTextureGreen = true; palaceStone.useMetallnessFromMetallicTextureBlue = true;
  palaceStone.roughness = .8; palaceStone.metallic = 0; palaceStone.environmentIntensity = .15;
  const royalBlue = material('palace-blue-banner', '#416b91'), trim = material('palace-gold-trim', '#baa16a');
  const metal = material('signal-bronze', '#857050'), light = material('signal-light', '#91d6d7');
  light.emissiveColor = new Color3(.19, .53, .55);
  const register = (mesh: Mesh, mat: Material, solid = false) => {
    mesh.material = mat; if(mat===stone||mat===ivory||mat===palaceStone)applyStoneUV(mesh); mesh.isPickable = false; casters.push(mesh); receivers.push(mesh);
    if (solid) {
      new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: .8 }, scene);
      mesh.computeWorldMatrix(true); const bounds = mesh.getBoundingInfo().boundingBox;
      cameraSolids.push({ min: bounds.minimumWorld.clone(), max: bounds.maximumWorld.clone() });
    }
    return mesh;
  };
  const box = (name: string, x: number, y: number, z: number, width: number, height: number, depth: number, mat: Material = stone, solid = true) => {
    const mesh = CreateBox('region-' + name, { width, height, depth }, scene); mesh.position.set(x, y, z);
    return register(mesh, mat, solid);
  };
  const post = (name: string, x: number, z: number, height: number, diameter: number, mat = stone) => {
    const mesh = CreateCylinder('region-' + name, { height, diameter, tessellation: 12 }, scene);
    mesh.position.set(x, regionHeight(x, z) + height / 2, z);
    return register(mesh, mat, true);
  };

  // A physical source for the arrival conversation: an old brass speaking tube beside the street.
  post('arrival-echo-pipe', 2, -35, 1.6, .22, metal);
  const echoBell = CreateCylinder('region-arrival-echo-bell', { height: .38, diameterTop: .55, diameterBottom: .19, tessellation: 16 }, scene);
  echoBell.position.set(2, 1.75, -35); echoBell.rotation.z = -.55; register(echoBell, metal);

  // Beacons and interactions use one anchor, beside the center of the road.
  let harborLamp: Mesh | undefined;
  for (const place of REGION_INTERACTION_PLACES) {
    const { x, z } = place;
    const y = regionHeight(x, z);
    post('beacon-base-' + place.id, x, z, 1.65, .38, metal);
    const lamp = CreateSphere('region-place-' + place.id, { diameter: .48, segments: 12 }, scene);
    lamp.position.set(x, y + 1.92, z); register(lamp, light);
    const halo = CreateTorus('region-beacon-ring-' + place.id, { diameter: .85, thickness: .055, tessellation: 24 }, scene);
    halo.position.set(x, y + 1.75, z); register(halo, metal);
    if (place.id === 'palace') harborLamp = lamp;
  }
  // Broken signal relay: a modest ring of columns, not a wall across the main road.
  for (const [x, z, height] of [[-6, -121, 3.4], [6, -121, 4.8], [-6, -113, 2.3], [6, -113, 3.4]]) post('relay-column', x, z, height, .8, ivory);
  box('relay-lintel', 6, regionHeight(6, -117) + 4.8, -117, 1.2, .65, 9, ivory);
  // Northwest tower square: open passage with the same white stone and blue banners as the palace.
  const { x: courseX, z: courseZ } = COURSE_ENTRANCE;
  box('palace-entry-paving', courseX, .025, courseZ - 1, 12, .05, 10, palaceStone, false);
  for (const sign of [-1, 1]) {
    const x = courseX + sign * 4.7;
    box('palace-entry-plinth', x, .3, courseZ, 1.7, .6, 2, palaceStone);
    box('palace-entry-pier', x, 3.4, courseZ, 1.15, 5.6, 1.5, palaceStone);
    box('palace-entry-capital', x, 6.25, courseZ, 1.65, .4, 1.9, palaceStone);
    box('palace-entry-banner', x, 4.35, courseZ - .78, .68, 2.25, .035, royalBlue, false);
    box('palace-entry-banner-trim', x, 3.3, courseZ - .805, .7, .12, .04, trim, false);
  }
  box('palace-entry-lintel', courseX, 6.65, courseZ, 11.1, .5, 1.9, palaceStone);
  box('palace-entry-cornice', courseX, 7.02, courseZ, 11.7, .24, 2.15, palaceStone);
  box('palace-entry-inlay', courseX, 6.65, courseZ - .965, 8.2, .16, .04, royalBlue, false);
  const crest = CreateTorus('region-palace-entry-crest', { diameter: 1.15, thickness: .12, tessellation: 32 }, scene);
  crest.position.set(courseX, 7.6, courseZ); crest.rotation.x = Math.PI / 2; register(crest, trim);
  // Ridge cairns frame the view without closing the arriving trail.
  for (const [x, z] of [[-109, -90], [-110, -80]]) {
    box('ridge-cairn-base', x, regionHeight(x, z) + .6, z, 2.3, 1.2, 2, stone);
    box('ridge-cairn-top', x, regionHeight(x, z) + 1.65, z, 1.35, .9, 1.2, ivory);
  }
  // Open-sided watch shelter: clear interior, physical piers and overhead beam.
  const watchY = regionHeight(-50, -250);
  for (const x of [-55, -45]) for (const z of [-255, -245]) post('watch-pillar', x, z, 5, .75, ivory);
  box('watch-canopy', -50, watchY + 5.35, -250, 12, .65, 12, wood);
  for (const x of [-55, -45]) box('watch-rafter', x, watchY + 4.85, -250, .4, .4, 12, wood);
  // Cove fishing shelter and shoreline boulders sit north of the arrival clearing.
  for (const x of [59, 69]) post('cove-mooring', x, -188, 1.8, .4, wood);
  box('cove-bench', 63, regionHeight(63, -188) + .5, -188, 4, .25, .8, wood);
  // North shoulders end visibly at the town's retaining wall rather than an invisible edge.
  for (const [x, width] of [[-85, 88], [62, 43]]) box('northern-retaining-wall', x, .85, -64.3, width, 1.7, 1.1, stone);

  createVegetation(scene, casters, receivers, cameraSolids, wood, stone);
  const restored = material('restored-current', '#65cedc'); restored.emissiveColor = new Color3(.06, .35, .39);
  // Flow exits over the existing east parapet into the sea; it is decorative and below the walkway.
  const water = box('restored-water', 40.3, -1.4, -23, .32, 3.6, 2.2, restored, false);
  water.setEnabled(false);
  const idleHarbor = material('harbor-idle', '#c0a066'); idleHarbor.emissiveColor = new Color3(.20, .12, .03);
  const setWaterRestored = (on: boolean) => {
    water.setEnabled(on);
    if (harborLamp) harborLamp.material = on ? restored : idleHarbor;
  };
  setWaterRestored(false);
  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    time += Math.min(.05, scene.getEngine().getDeltaTime() / 1000);
    if (water.isEnabled()) water.scaling.z = .94 + Math.sin(time * 3) * .06;
  });
  return { casters, receivers, cameraSolids, setWaterRestored };
}

function createVegetation(scene: Scene, casters: AbstractMesh[], receivers: AbstractMesh[], cameraSolids: TownBounds[], wood: StandardMaterial, stone: StandardMaterial): void {
  const random = rng(81723);
  const clear = (x: number, z: number, road = 4) => z < -72 && x < 70 && x > -119 && z > -275
    && regionPathDistance(x, z) > road && REGION_PLACES.every(p => Math.hypot(x - p.x, z - p.z) > 11);
  const canopy = createNaturalFoliage(scene, 'region-tree-template', [
    { center: [0, 4.5, 0], radius: [2.1, 2.2, 2], sprays: 180 },
    { center: [1.2, 3.9, .5], radius: [1.4, 1.45, 1.4], sprays: 110 },
    { center: [-1.1, 4, -.5], radius: [1.4, 1.7, 1.4], sprays: 110 },
  ], 923);
  (canopy.material as StandardMaterial).diffuseColor.set(.58,.62,.59);
  applyWind(canopy.material!, 7, .13); canopy.setEnabled(false);
  const trunk = CreateCylinder('region-trunk-template', { diameterBottom: .65, diameterTop: .17, height: 4.8, tessellation: 9 }, scene);
  trunk.material = wood; trunk.setEnabled(false);
  let planted = 0;
  for (let attempt = 0; attempt < 300 && planted < 43; attempt++) {
    const x = -116 + random() * 173, z = -76 - random() * 196;
    if (!clear(x, z, 7)) continue;
    const y = regionHeight(x, z), scale = .8 + random() * .45;
    const crown = canopy.clone('region-tree-' + planted)!; crown.position.set(x, y, z); crown.scaling.setAll(scale); crown.setEnabled(true);
    const bark = trunk.clone('region-trunk-' + planted)!; bark.position.set(x, y + 2.4 * scale, z); bark.scaling.setAll(scale); bark.setEnabled(true);
    crown.isPickable = bark.isPickable = false; casters.push(crown, bark); receivers.push(bark);
    new PhysicsAggregate(bark, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
    cameraSolids.push({ min: new Vector3(x - .4, y, z - .4), max: new Vector3(x + .4, y + 4.8 * scale, z + .4) });
    planted++;
  }
  const rock = roundedBoulder(scene); rock.material = stone; rock.setEnabled(false);
  for (let i = 0; i < 80; i++) {
    const x = -117 + random() * 196, z = -74 - random() * 204;
    if (!clear(x, z, 5)) continue;
    const size = 1.3 + random() * 3.3, y = regionHeight(x, z);
    const boulder = rock.clone('region-boulder-' + i)!; boulder.setEnabled(true); boulder.scaling.set(size, size * 1.1, size);
    boulder.position.set(x, y + size * .15, z); boulder.isPickable = false; casters.push(boulder); receivers.push(boulder);
    new PhysicsAggregate(boulder, PhysicsShapeType.CONVEX_HULL, { mass: 0 }, scene);
    boulder.computeWorldMatrix(true); const b = boulder.getBoundingInfo().boundingBox;
    cameraSolids.push({ min: b.minimumWorld.clone(), max: b.maximumWorld.clone() });
  }
  // Reuse the meadow's slim, curved blades, rather than broad triangular cards.
  const mat=grassMaterial(scene);mat.diffuseColor.set(.82,.82,.82);mat.emissiveColor.set(.10,.12,.07);
  const grass=grassMesh(scene,mat);grass.name='region-grass';applyWind(mat,.43,.065);
  const matrices: number[] = [];
  for (let i = 0; i < 46000; i++) {
    const x = -118 + random() * 190, z = -69 - random() * 212;
    if (!clear(x, z, 3.3)) continue;
    const patch=(Math.sin(x*.10+Math.cos(z*.04)*2)*Math.cos(z*.065)+1)/2;
    if(random()>.28+patch*.72)continue;
    const scale = .85 + random() * 1.1;
    Matrix.Compose(new Vector3(scale, scale, scale), Quaternion.RotationYawPitchRoll(random() * Math.PI * 2, 0, 0), new Vector3(x, regionHeight(x, z), z)).copyToArray(matrices, matrices.length);
  }
  grass.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16); receivers.push(grass);
}

/** Continuous deformation preserves sphere seam positions; welded normals keep the stone rounded. */
function roundedBoulder(scene:Scene):Mesh{
 const mesh=CreateSphere('region-rock-template',{diameter:.8,segments:16},scene);
 const positions=mesh.getVerticesData(VertexBuffer.PositionKind)!;
 for(let i=0;i<positions.length;i+=3){const x=positions[i],y=positions[i+1],z=positions[i+2];
  const f=1+.11*Math.sin(x*8+z*3)*Math.cos(y*7)+.045*Math.sin(z*17+x*9);
  positions[i]=x*f;positions[i+1]=y*f*.73;positions[i+2]=z*f;
 }
 const normals:number[]=[];VertexData.ComputeNormals(positions,mesh.getIndices()!,normals);
 const sums=new Map<string,Vector3>();const keys:string[]=[];
 let orientation=0;
 for(let i=0;i<positions.length;i+=3){const key=[positions[i],positions[i+1],positions[i+2]].map(n=>Math.round(n*1e5)).join(',');keys.push(key);
  const n=new Vector3(normals[i],normals[i+1],normals[i+2]);orientation+=Vector3.Dot(n,Vector3.FromArray(positions,i));
  if(sums.has(key))sums.get(key)!.addInPlace(n);else sums.set(key,n);
 }
 for(const n of sums.values())n.normalize().scaleInPlace(orientation<0?-1:1);
 for(let i=0;i<keys.length;i++)sums.get(keys[i])!.toArray(normals,i*3);
 mesh.setVerticesData(VertexBuffer.PositionKind,positions);mesh.setVerticesData(VertexBuffer.NormalKind,normals);mesh.refreshBoundingInfo();applyStoneUV(mesh);return mesh;
}
