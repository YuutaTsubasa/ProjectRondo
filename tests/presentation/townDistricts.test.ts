// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {CITY_LOOP,townSurfaceHeight} from '../../src/domain/town/townTerraces';
import {createTownDistricts} from '../../src/presentation/town/townDistricts';
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate',()=>({PhysicsAggregate:class{}}));
it('builds physical street blocks without sealing either ascent road',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const result=createTownDistricts(scene);
  expect(result.cameraSolids.length).toBeGreaterThanOrEqual(20);
  expect(result.receivers.length).toBeLessThan(30);
  for(let i=1;i<CITY_LOOP.length;i++){
   const [ax,az]=CITY_LOOP[i-1],[bx,bz]=CITY_LOOP[i],n=Math.ceil(Math.hypot(bx-ax,bz-az));
   for(let j=0;j<=n;j++){
    const x=ax+(bx-ax)*j/n,z=az+(bz-az)*j/n,y=townSurfaceHeight(x,z)!;
    expect(result.cameraSolids.some(b=>x>b.min.x-.5&&x<b.max.x+.5&&z>b.min.z-.5&&z<b.max.z+.5&&y+1>b.min.y&&y+1<b.max.y),'building across route '+[x,z]).toBe(false);
   }
  }
 }finally{scene.dispose();engine.dispose();}
});
