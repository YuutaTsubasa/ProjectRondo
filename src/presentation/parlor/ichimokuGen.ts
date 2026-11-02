import type {Scene} from '@babylonjs/core/scene';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh';
import type {MorphTarget} from '@babylonjs/core/Morph/morphTarget';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/loaders/glTF';
import receipt from '../../../public/models/ichimoku-gen.json';
import {createBlinkClock} from '../babylon/blinkTiming';
import {hoverOffset,tentacleSway,eyeLook} from './ichimokuMotion';

/** Member character 一目元 (member01). Content hash changes the fetch URL on every re-import. */
export const ICHIMOKU_MODEL={
 url:`/models/ichimoku-gen.glb?v=${receipt.outputSha256.slice(0,12)}`,
 /** The VRM is 0.74 m from tentacle tips to dome; the game shows an adult a little larger. */
 scale:1.5,
 eyeNode:receipt.humanBones.leftEye,
} as const;

export interface IchimokuGen {readonly root:TransformNode;readonly meshes:AbstractMesh[];update(seconds:number,lookAt:Vector3|null):void}

/** Floats at `position` facing `yaw`; tentacles, eye and blink are driven procedurally. */
export async function createIchimokuGen(scene:Scene,position:Vector3,yaw:number,random:()=>number=Math.random):Promise<IchimokuGen>{
 const container=await LoadAssetContainerAsync(ICHIMOKU_MODEL.url,scene);
 container.addAllToScene();
 const root=new TransformNode('ichimoku-gen',scene);
 for(const node of container.rootNodes)node.parent=root;
 root.position.copyFrom(position);root.rotation.y=yaw;root.scaling.setAll(ICHIMOKU_MODEL.scale);
 for(const material of container.materials)if(material instanceof PBRMaterial)material.environmentIntensity=.2;
 const meshes=root.getChildMeshes().filter(mesh=>mesh.getTotalVertices()>0);
 meshes.forEach(mesh=>{mesh.isPickable=false;});
 const nodes=new Map(container.transformNodes.map(node=>[node.name,node]));
 const rest=(node:TransformNode)=>(node.rotationQuaternion??=Quaternion.FromEulerVector(node.rotation)).clone();
 // Tentacle chains are tentacle_<kind>_<nn>_<segment>; the _end leaves carry no weights.
 const chains=new Map<number,{node:TransformNode;rest:Quaternion;segment:number}[]>();
 for(const node of container.transformNodes){
  const match=/^tentacle_\w+?_(\d+)_(\d+)$/.exec(node.name);if(!match)continue;
  const tentacle=Number(match[1]),list=chains.get(tentacle)??[];
  list.push({node,rest:rest(node),segment:Number(match[2])});chains.set(tentacle,list);
 }
 const eye=nodes.get(ICHIMOKU_MODEL.eyeNode),eyeRest=eye?rest(eye):null;
 const blinks:MorphTarget[]=[];
 for(const mesh of meshes){const manager=mesh.morphTargetManager;if(!manager)continue;for(let i=0;i<manager.numTargets;i++){const target=manager.getTarget(i);if(target.name==='blink')blinks.push(target);}}
 const clock=createBlinkClock(random);
 let last=0;
 return {root,meshes,update(seconds,lookAt){
  root.position.y=position.y+hoverOffset(seconds);
  for(const [tentacle,segments] of chains)for(const {node,rest,segment} of segments){
   const sway=tentacleSway(seconds,tentacle,segment,segments.length);
   node.rotationQuaternion=rest.multiply(Quaternion.RotationYawPitchRoll(0,sway.pitch,sway.roll));
  }
  if(eye&&eyeRest){
   const look=lookAt?eyeLook(eye.getAbsolutePosition(),lookAt,yaw):{yaw:0,pitch:0};
   // Head space matches model space; pitch up is negative about +x.
   eye.rotationQuaternion=Quaternion.RotationYawPitchRoll(look.yaw,-look.pitch,0).multiply(eyeRest);
  }
  const influence=clock.advance(Math.min(.05,Math.max(0,seconds-last)));last=seconds;
  for(const target of blinks)target.influence=influence;
 }};
}
