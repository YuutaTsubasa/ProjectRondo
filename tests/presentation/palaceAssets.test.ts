// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {AssetContainer} from '@babylonjs/core/assetContainer';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {AnimationGroup} from '@babylonjs/core/Animations/animationGroup';
import {Animation} from '@babylonjs/core/Animations/animation';
import {instantiateGuards} from '../../src/presentation/palace/palaceGuards';
import {createPalaceRun} from '../../src/domain/palace/palaceRun';
import type {Shadows} from '../../src/presentation/babylon/shadows';
it('ships exact source assets and a skinned guard with the required animations',()=>{
 const receipt=JSON.parse(readFileSync('public/palace/source-receipt.json','utf8'));
 for(const file of receipt.files){
  const bytes=readFileSync('public/palace/'+file.file);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
 }
 const bytes=readFileSync('public/palace/guard.glb');
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 expect(gltf.animations.map((a:{name:string})=>a.name)).toEqual(expect.arrayContaining(['Idle','Run','Jump']));
 expect(gltf.skins[0].joints).toHaveLength(59);
});
it('keeps each guard transform and animation independent, then clears the instances',()=>{
 const engine=new NullEngine();const scene=new Scene(engine);
 const container=new AssetContainer(scene);
 const mesh=CreateBox('body',{height:2},scene);mesh.position.y=1;
 const group=new AnimationGroup('Run',scene);
 const animation=new Animation('stride','rotation.x',60,Animation.ANIMATIONTYPE_FLOAT);
 animation.setKeys([{frame:0,value:0},{frame:60,value:.2}]);group.addTargetedAnimation(animation,mesh);
 container.meshes.push(mesh);container.animationGroups.push(group);container.removeAllFromScene();
 const shadows={cast(){},receive(){},generator:{removeShadowCaster(){}}} as unknown as Shadows;
 const visual=instantiateGuards(container,scene,shadows);
 expect(visual.guards).toHaveLength(8);
 expect(new Set(visual.guards.map(g=>g.run)).size).toBe(8);
 const state=createPalaceRun();state.guards[0].defeated=true;state.guards[0].defeatedFor=.6;visual.update(state);
 expect(visual.guards[0].holder.isEnabled()).toBe(false);expect(visual.guards[1].holder.isEnabled()).toBe(true);
 state.guards[0].defeated=false;state.guards[0].defeatedFor=0;visual.update(state);
 expect(visual.guards[0].holder.isEnabled()).toBe(true);
 visual.dispose();expect(scene.getTransformNodeByName('palaceGuard0')).toBeNull();
 scene.dispose();engine.dispose();
});
