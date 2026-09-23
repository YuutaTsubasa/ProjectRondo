// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { createBeveledBox } from '../../src/presentation/palace/palaceArchitecture';
import { applyStoneUV, createStoneSurfaceData } from '../../src/presentation/palace/palaceStoneSurface';

it('produces opaque mineral maps with normalized tangent-space normals and nonmetal stone', () => {
  const data=createStoneSurfaceData(64);
  expect(data).toEqual(createStoneSurfaceData(64));
  expect(new Set(data.albedo).size).toBeGreaterThan(20);
  for(let i=0;i<data.normal.length;i+=4) {
    const xyz=[data.normal[i],data.normal[i+1],data.normal[i+2]].map(v=>v/255*2-1);
    expect(Math.abs(Math.hypot(...xyz)-1)).toBeLessThan(Math.sqrt(3)/255);
    expect(data.normal[i+2]).toBeGreaterThan(200);
    expect(data.albedo[i+3]).toBe(255);
    expect(data.roughness[i+2]).toBe(0);
  }
});
it('keeps world texel density when a stone module is moved and nonuniformly scaled', () => {
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    const stone=createBeveledBox('stone',{width:3,height:2,depth:2,bevel:0},scene);
    stone.scaling.x=2;stone.position.set(12,4,0);applyStoneUV(stone);
    const positions=stone.getVerticesData(VertexBuffer.PositionKind)!;
    const normals=stone.getVerticesData(VertexBuffer.NormalKind)!;
    const uv=stone.getVerticesData(VertexBuffer.UVKind)!;
    for(let i=0;i<positions.length;i+=3)if(normals[i+2]===1) {
      expect(uv[i/3*2]).toBeCloseTo((positions[i]*2+12)/1.5,5);
      expect(uv[i/3*2+1]).toBeCloseTo((positions[i+1]+4)/1.5,5);
    }
  } finally {scene.dispose();engine.dispose();}
});


it('keeps curved stone detail local across projection seams far along the stage', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const column = CreateCylinder('column', {height: 3, diameter: 1, tessellation: 16}, scene);
    column.position.set(154, 8, -7);
    applyStoneUV(column);
    const positions = column.getVerticesData(VertexBuffer.PositionKind)!;
    const uv = column.getVerticesData(VertexBuffer.UVKind)!;
    for (let i = 0; i < positions.length / 3; i += 3) {
      for (const [a,b] of [[i,i+1],[i+1,i+2],[i+2,i]]) {
        const edge = Math.hypot(...[0,1,2].map(axis => positions[a*3+axis]-positions[b*3+axis]));
        const textureEdge = Math.hypot(uv[a*2]-uv[b*2], uv[a*2+1]-uv[b*2+1]);
        expect(textureEdge).toBeLessThanOrEqual(edge / 1.5 + .00002);
      }
    }
  } finally {scene.dispose();engine.dispose();}
});
