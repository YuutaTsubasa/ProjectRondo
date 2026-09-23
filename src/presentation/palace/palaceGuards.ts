import type { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { createPalaceGuardWalk } from './palaceGuardMotion';
import type { Shadows } from '../babylon/shadows';
import type { PalaceRun } from '../../domain/palace/palaceRun';
import { PALACE_LAYOUT } from '../../domain/palace/palaceLayout';
import '@babylonjs/loaders/glTF';

export function instantiateGuards(container:AssetContainer,scene:Scene,shadows:Shadows) {
  const guards=PALACE_LAYOUT.guards.map((spawn,i)=>{
    const instance=container.instantiateModelsToScene(name=>'guard'+i+'_'+name,false,{doNotInstantiate:true});
    const holder=new TransformNode('palaceGuard'+i,scene);
    for(const root of instance.rootNodes) root.parent=holder;
    const meshes=holder.getChildMeshes();
    for(const mesh of meshes) mesh.alwaysSelectAsActiveMesh=true;
    holder.computeWorldMatrix(true);
    const bounds=holder.getHierarchyBoundingVectors(true);
    const height=bounds.max.y-bounds.min.y;
    if(!Number.isFinite(height)||height<=0)throw new Error('Guard model has invalid bounds');
    const scale=1.9/height;
    for(const root of instance.rootNodes) {
      if(!(root instanceof TransformNode)) continue;
      root.scaling.scaleInPlace(scale);
      root.position.y-=bounds.min.y*scale;
    }
    const run=instance.animationGroups.find(a=>/^Run$/.test(a.name)||/_Run$/.test(a.name));
    if(!run)throw new Error('Guard model needs the Run animation');
    instance.animationGroups.forEach(a=>a.stop());
    const idle=instance.animationGroups.find(a=>/^Idle$/.test(a.name)||/_Idle$/.test(a.name));
    // Establish the authored relaxed arm/hand pose before capturing the rig's joint frames.
    if(idle){idle.start(false,0);idle.goToFrame(idle.from);idle.stop();}
    const walk=createPalaceGuardWalk(holder);
    shadows.cast(...meshes);shadows.receive(...meshes);
    holder.position.set(spawn.x,spawn.y,0);
    return {holder,instance,meshes,run,walk,lastX:spawn.x};
  });
  let lastElapsed=0;
  return {guards,update(state:PalaceRun) {
    const reset=state.elapsed<lastElapsed;
    lastElapsed=state.elapsed;
    state.guards.forEach((g,i)=>{
      const visual=guards[i];
      const t=Math.min(1,g.defeatedFor/.55);
      visual.holder.position.set(g.x,g.y,0);
      visual.holder.rotation.y=g.direction*Math.PI/2;
      visual.holder.rotation.z=g.defeated?-g.direction*t*1.35:0;
      visual.holder.setEnabled(!g.defeated||t<1);
      visual.meshes.forEach(m=>m.visibility=g.defeated?1-t:1);
      if(reset)visual.walk?.reset();
      else if(!g.defeated)visual.walk?.pose(Math.abs(g.x-visual.lastX));
      visual.lastX=g.x;
    });
  },dispose(){
    for(const g of guards){
      for(const m of g.meshes)shadows.generator.removeShadowCaster(m,false);
      g.instance.dispose();g.holder.dispose();
    }
    container.dispose();
  }};
}
export async function loadPalaceGuards(scene:Scene,shadows:Shadows){
  const container=await LoadAssetContainerAsync('/palace/guard.glb',scene);
  try{return instantiateGuards(container,scene,shadows);}
  catch(error){container.dispose();throw error;}
}
