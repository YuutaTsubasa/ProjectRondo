// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {createTownScenery} from '../../src/presentation/town/townScenery';
import {REGION_INTERACTION_PLACES,regionHeight} from '../../src/domain/region/regionLayout';
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate',()=>({PhysicsAggregate:class{}}));
it('keeps castle host approaches clear of real columns, door piers and benches with player margin',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{const {cameraSolids}=createTownScenery(scene,[],{backdrop:false,sea:false});
 for(const id of ['course-5','palace-1-5']){
  const host=REGION_INTERACTION_PLACES.find(p=>p.id===id)!;
  const route=[[-10,257],[-10,host.z],[host.x,host.z]];
  for(let i=1;i<route.length;i++){const [ax,az]=route[i-1],[bx,bz]=route[i];const steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)*2));
   for(let n=0;n<=steps;n++){const x=ax+(bx-ax)*n/steps,z=az+(bz-az)*n/steps;
    expect(regionHeight(x,z)).toBe(12);
    expect(cameraSolids.some(b=>x>b.min.x-.65&&x<b.max.x+.65&&z>b.min.z-.65&&z<b.max.z+.65&&b.min.y<14.4&&b.max.y>12.05),`${id} blocked near ${x},${z}`).toBe(false);
   }
  }
 }
 }finally{scene.dispose();engine.dispose();}
});
