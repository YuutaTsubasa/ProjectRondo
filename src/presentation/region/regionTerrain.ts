import type { Scene } from '@babylonjs/core/scene';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import {townSurfaceHeight} from '../../domain/town/townTerraces';
import {TOWN_BOUNDS} from '../../domain/town/townLayout';
import { REGION_BOUNDS, REGION_TOWN_EDGE_Z, regionHeight, regionPathDistance } from '../../domain/region/regionLayout';
import { createTownSea } from '../town/townSea';

/** ~40k triangles at 1.5m spacing: physical relief without a huge region-wide physics mesh. */
export function createRegionTerrain(scene: Scene) {
  const width = REGION_BOUNDS.maxX - REGION_BOUNDS.minX, depth = REGION_TOWN_EDGE_Z - REGION_BOUNDS.minZ;
  const ground = CreateGround('region-ground', { width, height: depth, subdivisions: 144 }, scene);
  const positions = ground.getVerticesData(VertexBuffer.PositionKind)!;
  const colors: number[] = [];
  const grass = new Color3(.31, .44, .25), fresh = new Color3(.45, .53, .30), earth = new Color3(.55, .47, .34), sand = new Color3(.66, .61, .47);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] += (REGION_BOUNDS.minX + REGION_BOUNDS.maxX) / 2;
    const z = positions[i + 2] += (REGION_BOUNDS.minZ + REGION_TOWN_EDGE_Z) / 2;
    positions[i + 1] = regionHeight(x, z);
    const patch = (Math.sin(x * .09 + Math.sin(z * .034) * 2) * Math.cos(z * .067) + 1) / 2;
    let color = Color3.Lerp(grass, fresh, patch);
    color = Color3.Lerp(color, sand, Math.max(0, Math.min(1, (x - 57) / 24)));
    const distance = regionPathDistance(x, z);
    color = Color3.Lerp(color, earth, Math.max(0, Math.min(1, (3.3 - distance) / 1.4)));
    colors.push(color.r, color.g, color.b, 1);
  }
  ground.setVerticesData(VertexBuffer.PositionKind, positions, false);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, ground.getIndices()!, normals);
  if (normals.filter((_, i) => i % 3 === 1).reduce((sum, n) => sum + n, 0) < 0) for (let i = 0; i < normals.length; i++) normals[i] *= -1;
  ground.setVerticesData(VertexBuffer.NormalKind, normals, false);
  ground.setVerticesData(VertexBuffer.ColorKind, colors, false);
  ground.useVertexColors = true;
  ground.refreshBoundingInfo();
  const material = new StandardMaterial('region-meadow', scene);
  material.diffuseColor = new Color3(.70, .70, .70);
  material.specularColor = Color3.Black();
  const detail = new Texture('/textures/meadow-detail.png', scene);
  detail.gammaSpace = false; detail.uScale = width / 8; detail.vScale = depth / 8;
  material.detailMap.texture = detail; material.detailMap.isEnabled = true;
  material.detailMap.diffuseBlendLevel = 1.1; material.detailMap.bumpLevel = 0;
  ground.material = material; ground.isPickable = false;
  new PhysicsAggregate(ground, PhysicsShapeType.MESH, { mass: 0, friction: .8 }, scene);
  // The sea continues beneath the raised coastline. At X76..85 the terrain descends through it,
  // producing a shoreline around the cove while retaining the town's eastern water frontage.
  const sea = createTownSea(scene); sea.name = 'region-sea'; sea.position.x = 830;
  createTownHeadland(scene,material);
  createRegionalBackdrop(scene);
  return { ground, sea };
}

function createRegionalBackdrop(scene: Scene): void {
  for (let layer = 0; layer < 2; layer++) {
    const positions: number[] = [], indices: number[] = [], normals: number[] = [];
    // Half-ring west and south; the east remains an open sea horizon.
    const segments = 110, radius = 255 + layer * 65;
    for (let i = 0; i <= segments; i++) {
      const a = Math.PI / 2 + i / segments * Math.PI * 1.02;
      const peak = 31 + layer * 18 + 13 * Math.sin(a * 6 + layer) + 7 * Math.sin(a * 13);
      for (let row = 0; row < 3; row++) {
        const t = row / 2, r = radius + t * 35;
        positions.push(Math.cos(a) * r - 35, -8 + (peak + 8) * t, Math.sin(a) * r - 150 + Math.max(0, Math.sin(a) * r - 150) * 1.8);
      }
    }
    for (let i = 0; i < segments; i++) for (let row = 0; row < 2; row++) {
      const a = i * 3 + row, b = a + 3; indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    VertexData.ComputeNormals(positions, indices, normals);
    for (let i = 1; i < normals.length; i += 3) normals[i] = Math.abs(normals[i]);
    const mesh = new Mesh('region-distant-ridge-' + layer, scene), data = new VertexData();
    data.positions = positions; data.indices = indices; data.normals = normals; data.applyToMesh(mesh);
    const mat = new StandardMaterial('region-ridge-material-' + layer, scene);
    mat.diffuseColor = Color3.FromHexString(layer ? '#718c92' : '#536e64');
    mat.specularColor = Color3.Black(); mat.backFaceCulling = false;
    mesh.material = mat; mesh.isPickable = false; mesh.freezeWorldMatrix();
  }
}

/** Unreachable land beyond the town parapets connects its foundation to the western hills.
 * It stays below every playable town surface; the town walls retain the existing boundary. */
function createTownHeadland(scene:Scene,material:StandardMaterial):void{
 const land=CreateGround('region-town-headland',{width:240,height:243,subdivisions:80},scene);
 const positions=land.getVerticesData(VertexBuffer.PositionKind)!;const colors:number[]=[];
 for(let i=0;i<positions.length;i+=3){const x=positions[i]-80,z=positions[i+2]+58.5;
  const west=Math.max(0,Math.min(1,(-x-48)/85)),north=Math.max(0,Math.min(1,(z-64)/75));
  const coast=Math.max(0,Math.min(1,(x-28)/12));
  positions[i]=x;positions[i+2]=z;positions[i+1]=-2+west*west*(16+5*Math.sin(z*.026))+north*north*(22+5*Math.sin(x*.03))-coast*5;
  // Lower a buffer wider than a grid cell: neighboring high vertices must not
  // interpolate decorative terrain back through the playable stone terraces.
  if(x>=TOWN_BOUNDS.minX-4&&x<=TOWN_BOUNDS.maxX+4&&z>=53&&z<=TOWN_BOUNDS.maxZ+4)positions[i+1]=Math.min(positions[i+1],-2);
  const supported=townSurfaceHeight(x,z);if(supported!==null)positions[i+1]=Math.min(positions[i+1],supported-.6);
  const patch=.5+.5*Math.sin(x*.08)*Math.cos(z*.06);colors.push(.29+patch*.09,.40+patch*.10,.24+patch*.05,1);
 }
 const normals:number[]=[];VertexData.ComputeNormals(positions,land.getIndices()!,normals);
 if(normals.filter((_,i)=>i%3===1).reduce((a,n)=>a+n,0)<0)for(let i=0;i<normals.length;i++)normals[i]*=-1;
 land.setVerticesData(VertexBuffer.PositionKind,positions);land.setVerticesData(VertexBuffer.NormalKind,normals);land.setVerticesData(VertexBuffer.ColorKind,colors);land.refreshBoundingInfo();
 land.material=material;land.isPickable=false;land.freezeWorldMatrix();
}
