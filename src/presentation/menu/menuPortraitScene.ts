import {Scene} from '@babylonjs/core/scene';
import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {Color3,Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader';
import type {AssetContainer} from '@babylonjs/core/assetContainer';
import '@babylonjs/loaders/glTF';
import {PLAYER_MODEL} from '../babylon/playerModel';
import {applyPlayerMaterials} from '../babylon/playerMaterials';
import {applyPortraitPainting} from './portraitPainting';
import {attachPlayerBlink} from '../babylon/playerBlink';
import {measureSkinnedSole} from '../babylon/skinnedSole';

export type PortraitPose='menu'|'loading';
/** A presentation-only scene: no physics, gameplay input or camera controls. */
export function createMenuPortraitScene(engine:AbstractEngine){
 const scene=new Scene(engine);scene.useRightHandedSystem=true;
 scene.clearColor=new Color4(0,0,0,0);
 const camera=new FreeCamera('portraitCamera',new Vector3(2.2,1.45,3.4),scene);
 camera.minZ=.02;camera.maxZ=20;camera.fov=.42;scene.activeCamera=camera;
 const key=new DirectionalLight('portraitSun',new Vector3(-.5,-.65,-1),scene);
 key.intensity=1.5;key.diffuse=new Color3(1,.96,.89);
 const fill=new HemisphericLight('portraitFill',new Vector3(0,1,0),scene);
 fill.intensity=.8;fill.diffuse=new Color3(.83,.91,1);fill.groundColor=new Color3(.35,.4,.52);
 const holder=new TransformNode('portrait',scene);
 let container:AssetContainer|undefined,releaseBlink:(()=>void)|undefined;
 let releasePainting:(()=>void)|undefined;
 let disposed=false,loaded=false,active=false,reduced=false,dirty=true,pose:PortraitPose='menu';
 const target=new Vector3(0,1.03,0);
 const positions={menu:new Vector3(2.2,1.45,3.4),loading:new Vector3(-1.65,1.64,1.02)};
 const targets={menu:new Vector3(0,1.03,0),loading:new Vector3(0,1.57,0)};
 camera.setTarget(target);
 function dispose(){
  if(disposed)return;disposed=true;releaseBlink?.();releasePainting?.();container?.dispose();scene.dispose();
 }
 const ready=LoadAssetContainerAsync(PLAYER_MODEL.url,scene).then(asset=>{
  if(disposed){asset.dispose();return;}
  container=asset;asset.addAllToScene();
  const roots=[...asset.meshes,...asset.transformNodes].filter(node=>!node.parent);
  for(const root of roots)root.parent=holder;
  for(const mesh of asset.meshes)mesh.alwaysSelectAsActiveMesh=true;
  applyPlayerMaterials(asset.meshes,scene);
  releasePainting=applyPortraitPainting(scene,camera,asset.meshes);
  const bounds=holder.getHierarchyBoundingVectors(true),height=bounds.max.y-bounds.min.y;
  if(height>0)holder.scaling.setAll(PLAYER_MODEL.height/height);
  for(const animation of asset.animationGroups)animation.stop();
  const idle=asset.animationGroups.find(group=>/idle/i.test(group.name));
  if(!idle)throw new Error('Player portrait requires an Idle animation');
  idle.play(true);idle.goToFrame(idle.from);
  const skinned=asset.meshes.filter(mesh=>mesh.skeleton&&mesh.getTotalVertices()>0);
  holder.position.y-=skinned.length?measureSkinnedSole(skinned):holder.getHierarchyBoundingVectors(true).min.y;
  releaseBlink=attachPlayerBlink(scene,asset.meshes);
  loaded=true;dirty=true;
 }).catch(error=>{if(disposed)return;dispose();throw error;});
 return {scene,ready,dispose,
  setPresentation(next:PortraitPose,visible:boolean,reduceMotion:boolean){
   if(disposed)return;
   if(pose!==next||active!==visible||reduced!==reduceMotion)dirty=true;
   if(active!==visible||reduced!==reduceMotion)scene.resetLastAnimationTimeFrame();
   pose=next;active=visible;reduced=reduceMotion;scene.animationsEnabled=!reduced;
  },
  invalidate(){dirty=true;},
  render(){
   if(disposed||!loaded||!active||reduced&&!dirty)return;
   const blend=reduced?1:1-Math.exp(-Math.min(.05,engine.getDeltaTime()/1000)*9);
   Vector3.LerpToRef(camera.position,positions[pose],blend,camera.position);
   Vector3.LerpToRef(target,targets[pose],blend,target);camera.setTarget(target);
   // A reduced-motion render is a still pose, including the independently driven blink.
   if(reduced){releaseBlink?.();releaseBlink=undefined;}
   else if(!releaseBlink&&container)releaseBlink=attachPlayerBlink(scene,container.meshes);
   scene.render();dirty=false;
  },
 };
}
