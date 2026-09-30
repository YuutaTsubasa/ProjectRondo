import type { Scene } from '@babylonjs/core/scene';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';

const SIZE = 256;
/** Periodic mineral/pore height field; one metre-scale material shared across the architecture. */
export function createStoneSurfaceData(size = SIZE) {
  const height = new Float32Array(size * size), albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(albedo.length), roughness = new Uint8Array(albedo.length);
  const hash = (x: number, y: number, period: number) => {
    let h = Math.imul((x + period) % period + 113, 374761393) ^ Math.imul((y + period) % period + 47, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x: number, y: number, period: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), a = x - ix, b = y - iy;
    const u = a * a * (3 - 2 * a), v = b * b * (3 - 2 * b);
    return (hash(ix, iy, period) * (1-u) + hash(ix+1, iy, period) * u) * (1-v)
      + (hash(ix, iy+1, period) * (1-u) + hash(ix+1, iy+1, period) * u) * v;
  };
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const broad = noise(x/size*8,y/size*8,8), fine = noise(x/size*64,y/size*64,64);
    const pore = Math.max(0, .36-fine) * 2.5, i=(y*size+x)*4;
    height[y*size+x] = broad * .12 + fine * .18 - pore * .35;
    const shade = Math.round(224 + broad*21 + fine*10 - pore*30);
    albedo.set([shade,shade,shade,255],i);
    roughness.set([255,Math.round(210+fine*40),0,255],i);
  }
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const at=(u:number,v:number)=>height[((v+size)%size)*size+(u+size)%size];
    const dx=(at(x+1,y)-at(x-1,y))*.9,dy=(at(x,y+1)-at(x,y-1))*.9;
    const length=Math.hypot(dx,dy,1),i=(y*size+x)*4;
    normal.set([Math.round((.5-dx/length*.5)*255),Math.round((.5-dy/length*.5)*255),Math.round((.5+.5/length)*255),255],i);
  }
  return {albedo,normal,roughness};
}
export function createStoneTextures(scene: Scene) {
  const data=createStoneSurfaceData();
  const make=(name:string,bytes:Uint8Array,gamma:boolean)=>{
    const texture=RawTexture.CreateRGBATexture(bytes,SIZE,SIZE,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
    texture.name=name;texture.gammaSpace=gamma;texture.wrapU=texture.wrapV=Texture.WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel=8;return texture;
  };
  return {albedo:make('palaceStoneAlbedo',data.albedo,true),normal:make('palaceStoneNormal',data.normal,false),roughness:make('palaceStoneRoughness',data.roughness,false)};
}
/** One world projection per triangle avoids mixing UV axes inside smooth curved faces. */
export function applyStoneUV(mesh: Mesh) {
  // Split UV seams while preserving the original smooth shading normals.
  mesh.convertToUnIndexedMesh();
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const matrix = mesh.computeWorldMatrix(true), uv: number[] = [];
  for (let i = 0; i < positions.length; i += 9) {
    const points = [0, 3, 6].map(offset =>
      Vector3.TransformCoordinates(Vector3.FromArray(positions, i + offset), matrix));
    const face = Vector3.Cross(points[1].subtract(points[0]), points[2].subtract(points[0]));
    const ax = Math.abs(face.x), ay = Math.abs(face.y), az = Math.abs(face.z);
    for (const p of points) {
      if (ay >= ax && ay >= az) uv.push(p.x / 1.5, p.z / 1.5);
      else if (ax >= az) uv.push(p.z / 1.5, p.y / 1.5);
      else uv.push(p.x / 1.5, p.y / 1.5);
    }
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uv);
}
