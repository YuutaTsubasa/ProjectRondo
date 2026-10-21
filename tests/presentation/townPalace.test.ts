// @vitest-environment jsdom
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Ray} from '@babylonjs/core/Culling/ray';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {PhysicsShapeType} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import {createTownScenery} from '../../src/presentation/town/townScenery';
import {PALACE_WALK_ROUTE} from '../../src/domain/town/townPalace';
import {townCameraPosition} from '../../src/presentation/town/townCamera';
const bodies=vi.hoisted(()=>[] as {mesh:Mesh;type:number}[]);
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate',()=>({PhysicsAggregate:class{
 constructor(mesh:Mesh,type:number){bodies.push({mesh,type});}
}}));
let engine:NullEngine,scene:Scene,result:ReturnType<typeof createTownScenery>;
beforeAll(()=>{engine=new NullEngine();scene=new Scene(engine);scene.useRightHandedSystem=true;result=createTownScenery(scene,[],{backdrop:false,sea:false});});
afterAll(()=>{scene.dispose();engine.dispose();});
it('integrates a batched palace with real arch and column geometry beyond the court',()=>{
 const palace=result.receivers.filter(m=>m.name.startsWith('palace-public-'));
 expect(palace.length).toBeGreaterThan(0);
 expect(palace.length).toBeLessThanOrEqual(20);
 expect(bodies.some(b=>b.mesh.name.startsWith('palace-arch-')&&b.type===PhysicsShapeType.MESH)).toBe(true);
 expect(bodies.some(b=>b.mesh.name.startsWith('palace-column-'))).toBe(true);
 for(const mesh of palace){mesh.computeWorldMatrix(true);expect(mesh.getBoundingInfo().boundingBox.minimumWorld.asArray().every(Number.isFinite)).toBe(true);}
});
it('supports the complete player-width route and cross-door without rail or wall barriers',()=>{
 const supports=bodies.filter(b=>b.mesh.name.startsWith('terrace-support-')).map(b=>b.mesh);
 const paths=[PALACE_WALK_ROUTE,[[-10,267],[29,267]] as const];
 for(const route of paths)for(let i=1;i<route.length;i++){
  const [ax,az]=route[i-1],[bx,bz]=route[i],n=Math.ceil(Math.hypot(bx-ax,bz-az)*2);
  for(let j=0;j<=n;j++){
   const x=ax+(bx-ax)*j/n,z=az+(bz-az)*j/n;
   for(const [dx,dz] of [[0,0],[-.45,0],[.45,0],[0,-.45],[0,.45]]){
    const ray=new Ray(new Vector3(x+dx,14,z+dz),new Vector3(0,-1,0),3);
    expect(supports.some(m=>{m.computeWorldMatrix(true);const hit=ray.intersectsMesh(m,false);return hit.hit&&Math.abs(hit.pickedPoint!.y-12)<.01;}),`missing physical floor at ${x+dx},${z+dz}`).toBe(true);
   }
   expect(result.cameraSolids.some(b=>x>b.min.x-.6&&x<b.max.x+.6&&z>b.min.z-.6&&z<b.max.z+.6&&b.min.y<14.4&&b.max.y>12.05),`blocked player at ${x},${z}`).toBe(false);
  }
 }
});
it('keeps a normal camera boom open along the entrance, nave and sea gallery',()=>{
 for(const [x,z] of [[-10,221],[-10,235],[-10,253],[-10,273],[-10,284],[29,239],[29,259],[29,277]]){
  const aim=new Vector3(x,13.6,z),desired=new Vector3(x,17.2,z-7);
  expect(townCameraPosition(aim,desired,result.cameraSolids).equalsWithEpsilon(desired,.01),`camera at ${x},${z}`).toBe(true);
 }
 // A zoomed overhead boom stops at the roof rather than entering it.
 const aim=new Vector3(-10,13.6,253),desired=new Vector3(-10,42,246);
 const adjusted=townCameraPosition(aim,desired,result.cameraSolids);
 expect(adjusted.y).toBeLessThan(34);
 expect(adjusted.y).toBeGreaterThan(18);
});
it('keeps the distant palace and viaduct behind the public roof and view terrace',()=>{
 const skyline=scene.meshes.filter(m=>m.name.startsWith('town-skyline-palace:')||m.name.startsWith('town-skyline-viaduct:'));
 expect(skyline.length).toBeGreaterThan(0);
 for(const m of skyline){m.computeWorldMatrix(true);expect(m.getBoundingInfo().boundingBox.minimumWorld.z,m.name).toBeGreaterThan(299);}
});

it('grounds distant cypress crowns with visible trunks seated on the palace coping',()=>{
 const trunks=scene.getMeshByName('town-skyline-palace:skyline-cypress-trunks');
 expect(trunks).not.toBeNull();trunks!.computeWorldMatrix(true);
 const b=trunks!.getBoundingInfo().boundingBox;
 expect(b.minimumWorld.y).toBeCloseTo(12.55,2);
 expect(b.maximumWorld.y).toBeGreaterThan(14.5);
 const crowns=scene.getMeshByName('town-skyline-palace:skyline-cypress')!;crowns.computeWorldMatrix(true);
 expect(crowns.getBoundingInfo().boundingBox.minimumWorld.y).toBeGreaterThan(b.minimumWorld.y+.5);
});
