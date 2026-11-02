// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {createParlorRoom} from '../../src/presentation/parlor/parlorRoom';
import {PARLOR_SPAWN,PARLOR_EXIT,PARLOR_HOST,PARLOR_ROOM,PARLOR_TABLES} from '../../src/domain/town/mahjongParlor';
vi.mock('@babylonjs/core/Physics/v2/physicsAggregate',()=>({PhysicsAggregate:class{}}));
it('walls the room in and keeps the walk from the door to 一目元 clear',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const room=await createParlorRoom(scene);
  const blocked=(x:number,z:number,r=.35)=>room.cameraSolids.some(b=>b.min.x<x+r&&b.max.x>x-r&&b.min.z<z+r&&b.max.z>z-r&&b.min.y<2&&b.max.y>0);
  expect(blocked(PARLOR_SPAWN.x,PARLOR_SPAWN.z)).toBe(false);
  expect(blocked(PARLOR_EXIT.x,PARLOR_EXIT.z)).toBe(false);
  // Door to the aisle, then along the aisle to the host's side of its table.
  for(let z=PARLOR_EXIT.z;z<=PARLOR_HOST.z;z+=.25)expect(blocked(0,z),`aisle blocked at z=${z}`).toBe(false);
  for(let x=0;x<=PARLOR_HOST.x-1.1;x+=.25)expect(blocked(x,PARLOR_HOST.z),`approach blocked at x=${x}`).toBe(false);
  for(const t of PARLOR_TABLES)expect(blocked(t.x,t.z)).toBe(true);
  // Every side of the room is closed, including both sides of the doorway.
  expect(blocked(PARLOR_ROOM.maxX+.2,0)).toBe(true);expect(blocked(PARLOR_ROOM.minX-.2,0)).toBe(true);
  expect(blocked(0,PARLOR_ROOM.maxZ+.2)).toBe(true);expect(blocked(3,PARLOR_ROOM.minZ-.2)).toBe(true);expect(blocked(0,PARLOR_ROOM.minZ-.5)).toBe(true);
  expect(room.casters.length).toBeGreaterThan(0);expect(room.receivers.length).toBeGreaterThanOrEqual(room.casters.length);
  expect((scene.getMeshByName('parlor-tile') as Mesh|null)?.thinInstanceCount).toBeGreaterThan(400);
 }finally{scene.dispose();engine.dispose();}
});
