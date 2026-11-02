import {waitForAudioReadiness} from '../audio/audioReadiness';
import type {Engine} from '@babylonjs/core/Engines/engine';
import {Scene} from '@babylonjs/core/scene';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {HavokPlugin} from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import {PhysicsAggregate} from '@babylonjs/core/Physics/v2/physicsAggregate';
import {PhysicsShapeType} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import {createCharacterRig} from '../babylon/characterRig';
import {createCrystals} from '../babylon/crystals';
import {createEnvironment} from '../babylon/environment';
import {createAtmosphere} from '../babylon/postProcessing';
import {createShadows} from '../babylon/shadows';
import {loadHavok} from '../babylon/havokModule';
import {disposeLevel,type LevelParts} from '../babylon/levelTeardown';
import {exposeDevHandle} from '../babylon/devHandles';
import {createHubAudio} from '../audio/hubAudio';
import {townCameraPosition} from '../town/townCamera';
import type {RegionScene} from '../region/regionScene';
import {PARLOR_SPAWN,PARLOR_HOST,PARLOR_ROOM,PARLOR_NAME,outsideParlor} from '../../domain/town/mahjongParlor';
import {createParlorRoom} from './parlorRoom';
import {createIchimokuGen} from './ichimokuGen';

/**
 * Interior of 白石台麻館. It satisfies the region world's scene contract so RegionWorld can host it
 * with the same readiness, pause and resize handling; there is no water or objective marker indoors.
 */
export async function createParlorScene(engine:Engine,canvas:HTMLCanvasElement):Promise<RegionScene>{
 const scene=new Scene(engine),parts:LevelParts={};
 try{
  scene.useRightHandedSystem=true;
  const {sun}=createEnvironment(scene);
  // Light falls through the side windows: a low warm key, with the room lamps doing the rest.
  sun.direction=new Vector3(-.6,-1,.35);sun.intensity=1.1;
  scene.getLightByName('ambient')!.intensity=.45;
  scene.enablePhysics(Vector3.Zero(),new HavokPlugin(true,await loadHavok()));
  const room=await createParlorRoom(scene);
  const host=await createIchimokuGen(scene,new Vector3(PARLOR_HOST.x,PARLOR_HOST.hover,PARLOR_HOST.z),PARLOR_HOST.yaw);
  const hostCollider=CreateCylinder('ichimoku-collider',{height:2.4,diameter:.9},scene);
  hostCollider.position.set(PARLOR_HOST.x,1.2,PARLOR_HOST.z);hostCollider.isVisible=false;hostCollider.isPickable=false;
  new PhysicsAggregate(hostCollider,PhysicsShapeType.CYLINDER,{mass:0,friction:.8},scene);
  const inside=(x:number,z:number)=>x>=PARLOR_ROOM.minX&&x<=PARLOR_ROOM.maxX&&z>=PARLOR_ROOM.minZ&&z<=PARLOR_ROOM.maxZ;
  const rig=await createCharacterRig(scene,{
   canvas,makeShadows:camera=>createShadows(sun,camera,{maxZ:30,cascades:1}),
   groundHeight:(x,z)=>inside(x,z)?0:null,spawn:new Vector3(PARLOR_SPAWN.x,PARLOR_SPAWN.y,PARLOR_SPAWN.z),
   crystals:createCrystals(scene,[]),initialYaw:Math.PI,interact:true,
   cameraFraming:{distance:4.2,height:1.5,initialPitch:.08},descentFollow:false,
  });
  parts.rig=rig;
  rig.player.motion={...rig.player.motion,facing:{x:0,y:1}};rig.player.root.rotation.y=Math.PI;
  rig.shadows.cast(...room.casters,...host.meshes);rig.shadows.receive(...room.receivers);
  createAtmosphere(scene,rig.follow.camera);scene.fogEnabled=false;
  const audio=createHubAudio(scene,rig.readMotion,rig.knight,{musicCues:['music.town']});parts.audio=audio;audio.setMusicScene('town');
  let disposed=false,seconds=0;
  const reset=()=>{
   if(disposed)return;
   rig.player.teleport(new Vector3(PARLOR_SPAWN.x,PARLOR_SPAWN.y,PARLOR_SPAWN.z));
   rig.player.motion={...rig.player.motion,facing:{x:0,y:1}};rig.player.root.rotation.y=Math.PI;rig.follow.snap();scene.resetLastAnimationTimeFrame();
  };
  scene.onBeforeRenderObservable.add(()=>{
   seconds+=Math.min(.05,engine.getDeltaTime()/1000);
   if(outsideParlor(rig.player.capsulePosition()))reset();
   host.update(seconds,rig.player.root.position.add(new Vector3(0,1.6,0)));
   const camera=rig.follow.camera,target=camera.getTarget();
   camera.position.copyFrom(townCameraPosition(target,camera.position,room.cameraSolids));camera.setTarget(target);
  });
  const parlor:RegionScene={
   scene,player:rig.player,follow:rig.follow,audio,reset,
   getLocationLabel:()=>`${PARLOR_NAME} · MAHJONG PARLOR`,
   suspendInput:on=>{if(!disposed)rig.suspendInput(on);},
   setObjective:()=>{},setWaterRestored:()=>{},
   dispose:()=>{if(disposed)return;disposed=true;disposeLevel(scene,parts);},
  };
  exposeDevHandle(scene,'parlor',parlor);exposeDevHandle(scene,'ichimoku',host);exposeDevHandle(scene,'shadows',rig.shadows);
  await waitForAudioReadiness(()=>audio.whenReady());
  return parlor;
 }catch(error){disposeLevel(scene,parts);throw error;}
}
