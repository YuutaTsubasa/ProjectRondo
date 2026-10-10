import type {Engine} from '@babylonjs/core/Engines/engine';
import {Scene} from '@babylonjs/core/scene';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {HavokPlugin} from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import {createCharacterRig} from '../babylon/characterRig';
import type {Player} from '../babylon/playerController';
import type {FollowCamera} from '../babylon/followCamera';
import {createCrystals} from '../babylon/crystals';
import {createEnvironment} from '../babylon/environment';
import {createAtmosphere} from '../babylon/postProcessing';
import {createClouds} from '../babylon/clouds';
import {createShadows} from '../babylon/shadows';
import {loadHavok} from '../babylon/havokModule';
import {disposeLevel,type LevelParts} from '../babylon/levelTeardown';
import {exposeDevHandle} from '../babylon/devHandles';
import {createHubAudio} from '../audio/hubAudio';
import {TOWN_SPAWN,TOWN_BOUNDS,outsideTown,townLocation} from '../../domain/town/townLayout';
import {createTownAssets} from './townAssets';
import {createTownScenery} from './townScenery';
import {townCameraPosition} from './townCamera';
export interface TownScene {
 readonly scene:Scene;readonly player:Player;readonly follow:FollowCamera;
 suspendInput(on:boolean):void;reset():void;getLocationLabel():string;dispose():void;
}
export async function createTownScene(engine:Engine,canvas:HTMLCanvasElement):Promise<TownScene>{
 const scene=new Scene(engine);const parts:LevelParts={};
 try{
  scene.useRightHandedSystem=true;
  const {sun}=createEnvironment(scene);
  // Broad white paving needs a stronger directional/ambient ratio than the grassy hub.
  sun.intensity=3;scene.getLightByName('ambient')!.intensity=.3;
  scene.enablePhysics(Vector3.Zero(),new HavokPlugin(true,await loadHavok()));
  const assets=await createTownAssets(scene);
  const scenery=createTownScenery(scene,assets);
  const rig=await createCharacterRig(scene,{canvas,makeShadows:camera=>createShadows(sun,camera,{maxZ:85,cascades:3}),groundHeight:(x,z)=>x>=TOWN_BOUNDS.minX&&x<=TOWN_BOUNDS.maxX&&z>=TOWN_BOUNDS.minZ&&z<=TOWN_BOUNDS.maxZ?0:null,spawn:new Vector3(TOWN_SPAWN.x,TOWN_SPAWN.y,TOWN_SPAWN.z),crystals:createCrystals(scene,[]),initialYaw:Math.PI,cameraFraming:{distance:6.5,height:1.25,initialPitch:.02},descentFollow:false});
  parts.rig=rig;
  rig.player.motion={...rig.player.motion,facing:{x:0,y:1}};rig.player.root.rotation.y=Math.PI;
  rig.shadows.cast(...scenery.casters,...assets.flatMap(a=>a.meshes));rig.shadows.receive(...scenery.receivers,...assets.flatMap(a=>a.meshes));
  createClouds(scene);createAtmosphere(scene,rig.follow.camera);scene.fogDensity=.0025;
  const audio=createHubAudio(scene,rig.readMotion,rig.knight);parts.audio=audio;audio.setMusicScene('town');
  let disposed=false;
  const reset=()=>{if(disposed)return;rig.player.teleport(new Vector3(TOWN_SPAWN.x,TOWN_SPAWN.y,TOWN_SPAWN.z));rig.player.motion={...rig.player.motion,facing:{x:0,y:1}};rig.player.root.rotation.y=Math.PI;rig.follow.snap();scene.resetLastAnimationTimeFrame();};
  scene.onBeforeRenderObservable.add(()=>{
   const p=rig.player.capsulePosition();if(outsideTown(p.x,p.y,p.z))reset();
   const camera=rig.follow.camera;const target=camera.getTarget();camera.position.copyFrom(townCameraPosition(target,camera.position,scenery.cameraSolids));camera.setTarget(target);
  });
  const town:TownScene={scene,player:rig.player,follow:rig.follow,reset,getLocationLabel:()=>townLocation(rig.player.root.position.x,rig.player.root.position.z),suspendInput:on=>{if(!disposed)rig.suspendInput(on);},dispose:()=>{if(disposed)return;disposed=true;disposeLevel(scene,parts);}};
  exposeDevHandle(scene,'town',town);exposeDevHandle(scene,'townAssets',assets);exposeDevHandle(scene,'shadows',rig.shadows);
  return town;
 }catch(error){disposeLevel(scene,parts);throw error;}
}
