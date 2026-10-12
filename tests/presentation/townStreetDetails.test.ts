// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {CITY_EXPLORATION_ROUTE,townSurfaceHeight} from '../../src/domain/town/townTerraces';
import {createTownDistricts} from '../../src/presentation/town/townDistricts';
import {createTownTerraces} from '../../src/presentation/town/townTerraces';
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate',()=>({PhysicsAggregate:class{}}));

it('keeps every journey stop and the connecting exploration walk clear at player height',()=>{
 const route=CITY_EXPLORATION_ROUTE;
 expect(route,'an authored journey walk must connect the four stops').toBeDefined();
 for(const stop of [[-30,76],[-10,130],[-10,188],[-74,52]])expect(route).toContainEqual(stop);
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const solids=[...createTownDistricts(scene).cameraSolids,...createTownTerraces(scene).cameraSolids];
  let previous:number|null=null;
  for(let i=1;i<route.length;i++){
   const [ax,az]=route[i-1],[bx,bz]=route[i],n=Math.ceil(Math.hypot(bx-ax,bz-az)*4);
   for(let j=0;j<=n;j++){
    const x=ax+(bx-ax)*j/n,z=az+(bz-az)*j/n,y=townSurfaceHeight(x,z);
    expect(y,'unsupported journey '+[x,z]).not.toBeNull();
    if(previous!==null)expect(Math.abs(y!-previous),'step at '+[x,z]).toBeLessThan(.08);
    expect(solids.some(b=>x>b.min.x-.6&&x<b.max.x+.6&&z>b.min.z-.6&&z<b.max.z+.6&&y!+1>b.min.y&&y!+1<b.max.y),'blocked journey '+[x,z]).toBe(false);
    previous=y;
   }
  }
  for(const [x,z] of [[-30,76],[-10,130],[-10,188],[-74,52]]){
   const y=townSurfaceHeight(x,z)!;
   expect(solids.some(b=>x>b.min.x-2&&x<b.max.x+2&&z>b.min.z-2&&z<b.max.z+2&&y+1>b.min.y&&y+1<b.max.y),'blocked stop '+[x,z]).toBe(false);
  }
 }finally{scene.dispose();engine.dispose();}
});

it('adds finite grounded street furniture within a modest static mesh and body budget',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const result=createTownDistricts(scene),details=result.receivers.filter(m=>m.name.startsWith('city-street-'));
  expect(details.length,'street details must be integrated').toBeGreaterThan(0);
  expect(details.length).toBeLessThanOrEqual(10);
  expect(result.receivers.length).toBeLessThanOrEqual(40);
  const bodies=scene.meshes.filter(m=>m.name.startsWith('city-street-body-'));
  expect(bodies.length).toBeGreaterThanOrEqual(12);
  expect(bodies.length).toBeLessThanOrEqual(24);
  expect(scene.lights).toHaveLength(0);
  for(const m of [...details,...bodies]){
   m.computeWorldMatrix(true);
   const b=m.getBoundingInfo().boundingBox;
   expect([...b.minimumWorld.asArray(),...b.maximumWorld.asArray()].every(Number.isFinite)).toBe(true);
   expect(m.isPickable).toBe(false);
   if(bodies.includes(m)){
    const y=townSurfaceHeight(m.position.x,m.position.z);
    expect(y).not.toBeNull();
    expect(b.minimumWorld.y).toBeCloseTo(y!,4);
    expect(result.cameraSolids.some(s=>s.min.equalsWithEpsilon(b.minimumWorld,.001)&&s.max.equalsWithEpsilon(b.maximumWorld,.001))).toBe(true);
   }else expect(m.isWorldMatrixFrozen).toBe(true);
  }
  const triangles=details.reduce((count,m)=>count+m.getTotalIndices()/3,0);
  expect(triangles).toBeLessThan(9000);
 }finally{scene.dispose();engine.dispose();}
});
