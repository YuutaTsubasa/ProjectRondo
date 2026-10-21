import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import HavokPhysics from '@babylonjs/havok';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {HavokPlugin} from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import {PhysicsCharacterController} from '@babylonjs/core/Physics/v2/characterController';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import {createTownTerraces} from '../../src/presentation/town/townTerraces';
import {createTownPalace} from '../../src/presentation/town/townPalace';
import {PALACE_WALK_ROUTE} from '../../src/domain/town/townPalace';
import {CAPSULE_HEIGHT,CAPSULE_RADIUS,spawnCentreY} from '../../src/presentation/babylon/capsule';

it('walks the real Havok capsule through both palace doors and the whole sea loop',async()=>{
 // Supplying local bytes makes this actual physics test independent of fetch/browser/WebGL.
 const bytes=await readFile(new URL('../../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm',import.meta.url));
 const wasmBinary=Uint8Array.from(bytes).buffer;
 const havok=await HavokPhysics({wasmBinary});
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 let player:PhysicsCharacterController|undefined;
 try{
  scene.enablePhysics(Vector3.Zero(),new HavokPlugin(true,havok));
  createTownTerraces(scene);createTownPalace(scene);
  const physics=scene.getPhysicsEngine()!,dt=1/60,down=new Vector3(0,-1,0);
  physics._step(dt);
  player=new PhysicsCharacterController(new Vector3(-10,spawnCentreY(12),188),{capsuleHeight:CAPSULE_HEIGHT,capsuleRadius:CAPSULE_RADIUS},scene);
  const tick=(vx:number,vz:number)=>{
   const support=player!.checkSupport(dt,down);
   player!.setVelocity(new Vector3(vx,-1,vz));
   player!.integrate(dt,support,Vector3.Zero());physics._step(dt);
  };
  const walk=(x:number,z:number)=>{
   const start=player!.getPosition().clone(),limit=Math.ceil(Math.hypot(x-start.x,z-start.z)/6/dt)+90;
   for(let step=0;step<limit;step++){
    const p=player!.getPosition(),dx=x-p.x,dz=z-p.z,distance=Math.hypot(dx,dz);
    if(distance<.08)return;
    const speed=Math.min(6,distance/dt);tick(dx/distance*speed,dz/distance*speed);
    expect(player!.getPosition().y,`ground along ${x},${z}`).toBeGreaterThan(12.8);
    expect(player!.getPosition().y).toBeLessThan(13.5);
   }
   expect(Math.hypot(x-player!.getPosition().x,z-player!.getPosition().z),`blocked approaching ${x},${z}`).toBeLessThan(.08);
  };
  for(const [x,z] of PALACE_WALK_ROUTE.slice(1))walk(x,z);
  walk(-10,267);walk(29,267);walk(29,235);walk(-10,235);walk(-10,217);
  // The adjacent window sill remains solid even though its visual arch is open above it.
  player.setPosition(new Vector3(14,spawnCentreY(12),259));
  for(let frame=0;frame<120;frame++)tick(6,0);
  expect(player.getPosition().x).toBeLessThan(17);
  expect(player.getPosition().y).toBeGreaterThan(12.8);
 }finally{player?.dispose();scene.dispose();engine.dispose();}
},30000);
