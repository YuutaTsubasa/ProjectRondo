// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Ray} from '@babylonjs/core/Culling/ray';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {TERRACE_ROUTE,TOWN_TERRACES,townSurfaceHeight} from '../../src/domain/town/townTerraces';
import {townCameraPosition} from '../../src/presentation/town/townCamera';
import {createTownTerraces} from '../../src/presentation/town/townTerraces';
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate',()=>({PhysicsAggregate:class{}}));
it('uses the rendered ascent as physical support and leaves the whole walking route open',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{
  const result=createTownTerraces(scene);
  const surfaces=scene.meshes.filter(m=>m.name.startsWith('terrace-support-'));
  expect(surfaces).toHaveLength(TOWN_TERRACES.length);
  for(let i=1;i<TERRACE_ROUTE.length;i++){
   const [ax,az]=TERRACE_ROUTE[i-1],[bx,bz]=TERRACE_ROUTE[i];
   for(let t=0;t<=1;t+=.04){
    const x=ax+(bx-ax)*t,z=az+(bz-az)*t,y=townSurfaceHeight(x,z)!;
    if(x>=-32)continue;
    const ray=new Ray(new Vector3(x,y+2,z),new Vector3(0,-1,0),3);
    const hits=surfaces.map(m=>{m.computeWorldMatrix(true);return ray.intersectsMesh(m,false);}).filter(hit=>hit.hit);
    expect(hits.some(h=>Math.abs(h.pickedPoint!.y-y)<.01),[x,z].join(',')).toBe(true);
    expect(result.cameraSolids.some(b=>x>b.min.x-.45&&x<b.max.x+.45&&z>b.min.z-.45&&z<b.max.z+.45&&y+1>b.min.y&&y+1<b.max.y),'blocked route '+[x,z]).toBe(false);
   }
  }
  expect(result.receivers.length).toBeLessThan(20);
 }finally{scene.dispose();engine.dispose();}
});

it('keeps the camera boom outside the raised deck when looking west from the old town',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{
  const {cameraSolids}=createTownTerraces(scene),target=new Vector3(-38,1.3,49),desired=new Vector3(-45.4954,12.6,49);
  const adjusted=townCameraPosition(target,desired,cameraSolids);
  expect(Vector3.Distance(target,adjusted)).toBeLessThan(Vector3.Distance(target,desired)-.5);
  const delta=adjusted.subtract(target),ray=new Ray(target,delta.normalizeToNew(),delta.length());
  const support=scene.getMeshByName('terrace-support-sky-arcade')!;support.computeWorldMatrix(true);
  expect(ray.intersectsMesh(support,false).hit).toBe(false);
 }finally{scene.dispose();engine.dispose();}
});

it('keeps both city ascent roads supported with no rails across the loop',async()=>{
 const {CITY_LOOP}=await import('../../src/domain/town/townTerraces');
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 try{
  const result=createTownTerraces(scene),supports=scene.meshes.filter(m=>m.name.startsWith('terrace-support-'));
  for(let i=1;i<CITY_LOOP.length;i++){
   const [ax,az]=CITY_LOOP[i-1],[bx,bz]=CITY_LOOP[i],n=Math.ceil(Math.hypot(bx-ax,bz-az));
   for(let j=0;j<=n;j++){
    const x=ax+(bx-ax)*j/n,z=az+(bz-az)*j/n,y=townSurfaceHeight(x,z)!;
    if(z<57)continue;
    expect(result.cameraSolids.some(b=>x>b.min.x-.45&&x<b.max.x+.45&&z>b.min.z-.45&&z<b.max.z+.45&&y+1>b.min.y&&y+1<b.max.y),'rail across route '+[x,z]).toBe(false);
    const ray=new Ray(new Vector3(x,y+2,z),new Vector3(0,-1,0),3);
    expect(supports.some(m=>{m.computeWorldMatrix(true);const hit=ray.intersectsMesh(m,false);return hit.hit&&Math.abs(hit.pickedPoint!.y-y)<.01;}),'missing support '+[x,z]).toBe(true);
   }
  }
 }finally{scene.dispose();engine.dispose();}
});
