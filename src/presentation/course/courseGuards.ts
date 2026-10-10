import type { Scene } from '@babylonjs/core/scene';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Shadows } from '../babylon/shadows';
import { createPalaceGuardWalk } from '../palace/palaceGuardMotion';
import { COURSE_GUARD_SPAWNS, COURSE_GUARD_ATTACK_RADIUS, type CourseCombat } from '../../domain/course/courseCombat';
import '@babylonjs/loaders/glTF';

export async function loadCourseGuards(scene:Scene,shadows:Shadows){
 const container=await LoadAssetContainerAsync('/palace/guard.glb',scene);
 const warning=new StandardMaterial('courseGuardWarning',scene);warning.disableLighting=true;warning.emissiveColor=new Color3(1,.32,.06);
 const visuals:ReturnType<typeof createVisual>[]=[];
 function createVisual(spawn:(typeof COURSE_GUARD_SPAWNS)[number]){
  const instance=container.instantiateModelsToScene(n=>`courseGuard${spawn.id}_${n}`,false,{doNotInstantiate:true});
  const holder=new TransformNode('courseGuard'+spawn.id,scene);
  for(const root of instance.rootNodes)root.parent=holder;
  const bounds=holder.getHierarchyBoundingVectors(true),height=bounds.max.y-bounds.min.y;
  if(!Number.isFinite(height)||height<=0){instance.dispose();holder.dispose();throw new Error('Invalid course guard model bounds');}
  for(const root of instance.rootNodes)if(root instanceof TransformNode){root.scaling.scaleInPlace(1.9/height);root.position.y-=bounds.min.y*1.9/height;}
  instance.animationGroups.forEach(a=>a.stop());
  const idle=instance.animationGroups.find(a=>a.name.endsWith('_Idle'));if(idle){idle.start(false,0);idle.goToFrame(idle.from);idle.stop();}
  const walk=createPalaceGuardWalk(holder);
  const arm=holder.getDescendants().find(n=>n.name.endsWith('DEF-upper_arm.R')) as TransformNode|undefined;
  const rest=arm ? Quaternion.Identity() : undefined;
  if(arm&&rest){arm.computeWorldMatrix(true);arm.getWorldMatrix().decompose(undefined,rest);}
  const meshes=holder.getChildMeshes();for(const m of meshes){m.alwaysSelectAsActiveMesh=true;m.isPickable=false;}
  shadows.cast(...meshes);shadows.receive(...meshes);
  holder.position.set(spawn.x,spawn.y,spawn.z);
  const ring=CreateTorus('courseGuardTell'+spawn.id,{diameter:COURSE_GUARD_ATTACK_RADIUS*2,thickness:.05,tessellation:48},scene);
  ring.material=warning;ring.isPickable=false;ring.setEnabled(false);
  return {holder,instance,walk,meshes,ring,arm,rest,lastX:spawn.x,lastZ:spawn.z,dead:false};
 }
 function dispose(){for(const v of visuals){for(const mesh of v.meshes)shadows.generator.removeShadowCaster(mesh,false);v.ring.dispose();v.instance.dispose();v.holder.dispose();}warning.dispose();container.dispose();}
 try{for(const spawn of COURSE_GUARD_SPAWNS)visuals.push(createVisual(spawn));}
 catch(error){dispose();throw error;}
 return {update(state:CourseCombat){state.guards.forEach((g,i)=>{
  const v=visuals[i],dead=g.phase==='defeated';
  if(v.dead&&!dead)v.walk?.reset();
  v.holder.position.set(g.x,g.y,g.z);v.holder.rotation.y=g.yaw;
  v.holder.rotation.z=dead?-Math.min(1,g.timer/.5)*1.35:0;
  v.holder.setEnabled(!dead||g.timer<.55);
  for(const mesh of v.meshes)mesh.visibility=dead?Math.max(0,1-g.timer/.55):1;
  if(!dead)v.walk?.pose(g.phase==='patrol'?Math.hypot(g.x-v.lastX,g.z-v.lastZ):0);
  if(v.arm&&v.rest&&g.phase!=='patrol'&&!dead){
   const swing=g.phase==='windup'?-2.2*(1-g.timer/.65):g.phase==='strike'?-2.2+2.4*(1-g.timer/.22):.2*Math.max(0,g.timer/.8);
   const parent=v.arm.parent as TransformNode,parentRotation=Quaternion.Identity();
   parent.computeWorldMatrix(true);parent.getWorldMatrix().decompose(undefined,parentRotation);
   const facing=Quaternion.RotationAxis(Vector3.Up(),g.yaw);
   v.arm.rotationQuaternion=parentRotation.conjugate().multiply(facing.multiply(Quaternion.RotationAxis(Vector3.Right(),swing).multiply(v.rest))).normalize();
  }
  v.ring.position.set(g.x,g.y+.035,g.z);v.ring.setEnabled(g.phase==='windup'||g.phase==='strike');
  v.ring.scaling.setAll(1);
  v.ring.visibility=g.phase==='windup'?.45+.5*(1-g.timer/.65):1;
  v.lastX=g.x;v.lastZ=g.z;v.dead=dead;
 });},dispose};
}
