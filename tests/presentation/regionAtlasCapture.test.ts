import {expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Vector3,Matrix} from '@babylonjs/core/Maths/math.vector';
import {Viewport} from '@babylonjs/core/Maths/math.viewport';
import {REGION_BOUNDS} from '../../src/domain/region/regionLayout';
import {atlasCaptureBounds,createAtlasCamera} from '../../src/presentation/region/regionAtlasCapture';
it('frames the entire playable region with square world-space pixels',()=>{
 const b=atlasCaptureBounds();
 expect(b.maxX-b.minX).toBe(b.maxZ-b.minZ);
 expect(b.minX).toBeLessThan(REGION_BOUNDS.minX);expect(b.maxX).toBeGreaterThan(REGION_BOUNDS.maxX);
 expect(b.minZ).toBeLessThan(REGION_BOUNDS.minZ);expect(b.maxZ).toBeGreaterThan(REGION_BOUNDS.maxZ);
});
it('exports +X to the right and +Z upward after the required horizontal canvas mirror',()=>{
 const engine=new NullEngine();const scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{
  const b=atlasCaptureBounds(),camera=createAtlasCamera(scene,b),cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
  const transform=camera.getViewMatrix().multiply(camera.getProjectionMatrix(true));
  const project=(x:number,z:number)=>{const p=Vector3.Project(new Vector3(x,0,z),Matrix.Identity(),transform,new Viewport(0,0,1024,1024));return {x:1024-p.x,y:p.y};};
  const center=project(cx,cz),east=project(cx+10,cz),north=project(cx,cz+10);
  expect(center.x).toBeCloseTo(512);expect(center.y).toBeCloseTo(512);
  expect(east.x).toBeGreaterThan(center.x);expect(north.y).toBeLessThan(center.y);
  expect(east.x-center.x).toBeCloseTo(center.y-north.y,3);
 }finally{scene.dispose();engine.dispose();}
});

it('ships a real capture with matching dimensions, source bounds and cache receipt',async()=>{
 const {readFileSync}=await import('node:fs');const {createHash}=await import('node:crypto');
 const receipt=JSON.parse(readFileSync('src/content/regionAtlas.json','utf8'));
 const png=readFileSync('public/maps/white-tide-atlas.png');
 expect(png.readUInt32BE(16)).toBe(receipt.size);expect(png.readUInt32BE(20)).toBe(receipt.size);
 expect(receipt.bounds).toEqual(atlasCaptureBounds());
 expect(createHash('sha256').update(png).digest('hex')).toBe(receipt.sha256);
});
