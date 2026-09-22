import type { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
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
    instance.animationGroups.forEach(a=>a.stop());run.start(true,.48);
    shadows.cast(...meshes);shadows.receive(...meshes);
    holder.position.set(spawn.x,spawn.y,0);
    return {holder,instance,meshes,run};
  });
  return {guards,update(state:PalaceRun) {
    state.guards.forEach((g,i)=>{
      const visual=guards[i];
      const t=Math.min(1,g.defeatedFor/.55);
      visual.holder.position.set(g.x,g.y,0);
      visual.holder.rotation.y=g.direction*Math.PI/2;
      visual.holder.rotation.z=g.defeated?-g.direction*t*1.35:0;
      visual.holder.setEnabled(!g.defeated||t<1);
      visual.meshes.forEach(m=>m.visibility=g.defeated?1-t:1);
      if(g.defeated)visual.run.pause();
      else if(!visual.run.isPlaying)visual.run.restart();
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
