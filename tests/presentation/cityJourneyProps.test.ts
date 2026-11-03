// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {CITY_STOPS} from '../../src/domain/region/cityJourney';
import {REGION_INTERACTION_PLACES,regionHeight} from '../../src/domain/region/regionLayout';
import {createCityJourneyProps} from '../../src/presentation/region/cityJourneyProps';
it('gives all four story anchors finite small props without extra lights, materials or collisions',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);try{
  const materials={wood:new StandardMaterial('wood',scene),ivory:new StandardMaterial('ivory',scene),stone:new StandardMaterial('stone',scene),metal:new StandardMaterial('metal',scene),blue:new StandardMaterial('blue',scene),gold:new StandardMaterial('gold',scene)};
  const count=scene.materials.length,props=createCityJourneyProps(scene,materials);
  expect(scene.materials).toHaveLength(count);expect(scene.lights).toHaveLength(0);
  expect(props.meshes.length).toBeLessThanOrEqual(16);expect(props.meshes.length).toBeGreaterThanOrEqual(4);
  expect(new Set(props.meshes.map(mesh=>mesh.metadata.cityStopId))).toEqual(new Set(CITY_STOPS.map(s=>s.id)));
  expect(props.meshes.reduce((sum,m)=>sum+m.getTotalIndices()/3,0)).toBeLessThan(6500);
  for(const mesh of props.meshes){
   expect(mesh.isPickable).toBe(false);expect(mesh.checkCollisions).toBe(false);expect(mesh.physicsBody).toBeUndefined();expect(mesh.isWorldMatrixFrozen).toBe(true);
   const stop=CITY_STOPS.find(s=>s.id===mesh.metadata.cityStopId)!,anchor=REGION_INTERACTION_PLACES.find(p=>p.id===stop.id)!;
   mesh.computeWorldMatrix(true);const b=mesh.getBoundingInfo().boundingBox;
   expect([...mesh.getVerticesData(VertexBuffer.PositionKind)!,...mesh.getVerticesData(VertexBuffer.NormalKind)!]).toSatisfy(values=>values.every(Number.isFinite));
   expect(b.minimumWorld.x).toBeGreaterThan(stop.x+.7);
   expect(b.minimumWorld.y).toBeGreaterThanOrEqual(regionHeight(anchor.x,anchor.z)-.01);
   expect(b.maximumWorld.y).toBeLessThan(regionHeight(anchor.x,anchor.z)+2.7);
   expect(b.maximumWorld.x).toBeLessThan(anchor.x+2.5);expect(Math.abs(b.maximumWorld.z-anchor.z)).toBeLessThan(2.5);
  }
  const parts=props.meshes.flatMap(m=>m.metadata.parts as string[]);
  for(const name of ['delivery-ledger','ledger-pen','paperweight','chime-bell','chime-cloth-knot','old-route-board','blue-route-line','view-marker'])expect(parts).toContain(name);
 }finally{scene.dispose();engine.dispose();}
});
