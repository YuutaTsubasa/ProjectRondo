import {expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {createRegionObjectiveMarker} from '../../src/presentation/region/regionObjectiveMarker';
import {REGION_INTERACTION_PLACES,regionHeight} from '../../src/domain/region/regionLayout';
it('moves the single objective beam and exclamation to the live interaction anchor and hides when complete',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const marker=createRegionObjectiveMarker(scene);
  const root=scene.getTransformNodeByName('region-objective')!;
  expect(root.isEnabled()).toBe(false);
  for(const id of ['signal','course','palace'] as const){
   marker.setTarget(id);const p=REGION_INTERACTION_PLACES.find(p=>p.id===id)!;
   expect(root.isEnabled()).toBe(true);
   expect(root.position.asArray()).toEqual([p.x,regionHeight(p.x,p.z),p.z]);
  }
  expect(scene.getMeshByName('region-objective-exclamation')).not.toBeNull();
  expect(scene.getMeshByName('region-objective-beam')).not.toBeNull();
  expect(root.getChildMeshes().every(m=>!m.isPickable&&!m.checkCollisions)).toBe(true);
  marker.setTarget(null);expect(root.isEnabled()).toBe(false);
 }finally{scene.dispose();engine.dispose();}
});
