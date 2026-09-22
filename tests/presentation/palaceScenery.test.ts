// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {createPalaceScenery} from '../../src/presentation/palace/palaceScenery';
import type {Shadows} from '../../src/presentation/babylon/shadows';
it('does not add white emission on top of palace background image colours',()=>{
 const engine=new NullEngine();const scene=new Scene(engine);
 createPalaceScenery(scene,{cast(){},receive(){}} as unknown as Shadows);
 const backgrounds=scene.materials.filter(m=>m.name.startsWith('background_')) as StandardMaterial[];
 expect(backgrounds).toHaveLength(3);
 expect(backgrounds.every(m=>m.emissiveTexture&&m.emissiveColor.r===0&&m.emissiveColor.g===0&&m.emissiveColor.b===0)).toBe(true);
 scene.dispose();engine.dispose();
});