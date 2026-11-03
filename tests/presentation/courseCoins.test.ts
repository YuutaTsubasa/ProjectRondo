// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {createCourseCoins} from '../../src/presentation/course/courseCoins';
import {getCourseStage} from '../../src/domain/course/courseStages';
it('renders real three-dimensional coins at authored heights, hides pickups and restores them on retry',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);try{
  const stage=getCourseStage('course-3'),coins=createCourseCoins(scene,stage.coins);
  expect(coins.meshes).toHaveLength(stage.coins.length);
  coins.meshes.forEach((mesh,i)=>{expect(mesh.position.asArray()).toEqual(Object.values(stage.coins[i]));expect(mesh.getTotalVertices()).toBeGreaterThan(30);expect(mesh.isPickable).toBe(false);});
  coins.update([0,3],2);expect(coins.meshes[0].isEnabled()).toBe(false);expect(coins.meshes[1].isEnabled()).toBe(true);expect(coins.meshes[3].isEnabled()).toBe(false);
  expect(coins.meshes[1].rotation.y).toBeGreaterThan(0);
  coins.update([],0);expect(coins.meshes.every(m=>m.isEnabled())).toBe(true);
 }finally{scene.dispose();engine.dispose();}
});
