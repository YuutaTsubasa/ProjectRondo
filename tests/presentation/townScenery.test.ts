// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {TOWN_SPAWN} from '../../src/domain/town/townLayout';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {townCameraPosition} from '../../src/presentation/town/townCamera';
import {createTownScenery} from '../../src/presentation/town/townScenery';
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate',()=>({PhysicsAggregate:class{}}));
it('opens only the regional south road while retaining town ground and side barriers',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const scenery=createTownScenery(scene,[],{southExitWidth:12,backdrop:false,sea:false});
  expect(scene.getMeshByName('town-ground-collider')).not.toBeNull();
  expect(scene.getMeshByName('town-sea')).toBeNull();
  expect(scene.meshes.some(m=>m.name.startsWith('town-ridge-'))).toBe(false);
  for(let x=-5;x<=5;x++)expect(scenery.cameraSolids.some(b=>b.min.x<=x+.5&&b.max.x>=x-.5&&b.min.z<=-62&&b.max.z>=-62)).toBe(false);
  expect(scenery.cameraSolids.some(b=>b.min.x<=20&&b.max.x>=20&&b.min.z<=-62&&b.max.z>=-62)).toBe(true);
 }finally{scene.dispose();engine.dispose();}
});
it('shortens a camera ray at buildings but preserves an unobstructed view',()=>{
 const aim=new Vector3(0,2,0),desired=new Vector3(0,3,-6);
 const solids=[{min:new Vector3(-2,0,-5),max:new Vector3(2,10,-3)}];
 expect(townCameraPosition(aim,desired,solids).z).toBeGreaterThan(-3);
 expect(townCameraPosition(aim,new Vector3(6,3,0),solids)).toEqual(new Vector3(6,3,0));
});
it('builds a flat supported street with a bounded seafront and finite scenery',()=>{
 const engine=new NullEngine();const scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{
  const scenery=createTownScenery(scene,[]);
  const support=scene.getMeshByName('town-ground-collider')!;support.computeWorldMatrix(true);
  expect(support.getBoundingInfo().boundingBox.maximumWorld.y).toBeCloseTo(0);
  expect(support.getBoundingInfo().boundingBox.minimumWorld.z).toBeLessThan(TOWN_SPAWN.z-6.5);
  expect(scenery.cameraSolids.some(b=>b.min.x>35)).toBe(true);
  expect(scene.getMeshByName('town-sea')).not.toBeNull();
  expect(scene.meshes.filter(m=>m.name.startsWith('town-ridge-'))).toHaveLength(2);
  expect(scenery.receivers.length).toBeGreaterThan(0);
  for(const mesh of scenery.receivers){mesh.computeWorldMatrix(true);expect(mesh.getBoundingInfo().boundingBox.minimumWorld.asArray().every(Number.isFinite)).toBe(true);}
 }finally{scene.dispose();engine.dispose();}
});


it('integrates gate solids without adding a wall across the portal',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{
  const root=new TransformNode('gate',scene);
  const scenery=createTownScenery(scene,[{id:'city-gate',kind:'gate',root,meshes:[],bounds:{min:new Vector3(-6,0,-45.5),max:new Vector3(6,11,-40.5)}}]);
  expect(scene.getMeshByName('city-gate-collider')).toBeNull();
  const blocks=scene.meshes.filter(m=>m.name.startsWith('city-gate-collider-'));
  expect(blocks).toHaveLength(8);expect(blocks.every(m=>!m.isVisible)).toBe(true);
  for(let z=-55;z<=-32;z++){
   expect(scenery.cameraSolids.some(b=>b.min.x<=.4&&b.max.x>=-.4&&b.min.y<2.4&&b.max.y>0&&b.min.z<=z&&b.max.z>=z)).toBe(false);
  }
 }finally{scene.dispose();engine.dispose();}
});

it('keeps the plaza-to-seafront arcade route free of whole-building colliders and street furniture',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{
  const assets=[18,24,30].map((x,i)=>({id:'sea-arcade-'+i,kind:'arcade' as const,root:new TransformNode('arcade-'+i,scene),meshes:[],bounds:{min:new Vector3(x-2.8,0,21.58),max:new Vector3(x+2.8,6,26.42)}}));
  const scenery=createTownScenery(scene,assets);
  for(const asset of assets){
   expect(scene.getMeshByName(asset.id+'-collider')).toBeNull();
   expect(scene.meshes.some(m=>m.name.startsWith(asset.id+'-collider-')&&!m.isVisible)).toBe(true);
  }
  for(let x=14;x<=36;x+=.25){
   expect(scenery.cameraSolids.some(b=>b.min.x<=x+.6&&b.max.x>=x-.6&&b.min.y<2.4&&b.max.y>0&&b.min.z<=24.6&&b.max.z>=23.4)).toBe(false);
  }
  // Lamp poles are visual-only, but may not appear inside this path either.
  for(const mesh of scenery.receivers){
   if(!mesh.material?.name.includes('bronze'))continue;
   const positions=mesh.getVerticesData('position')!;
   for(let i=0;i<positions.length;i+=3){
    const [x,y,z]=positions.slice(i,i+3);
    expect(x>14&&x<36&&y>.3&&y<3.5&&z>23.3&&z<24.7).toBe(false);
   }
  }
 }finally{scene.dispose();engine.dispose();}
});
