import {afterEach,expect,it,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import type {DefaultRenderingPipeline} from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import {bindDisplayPreferences} from '../../src/presentation/settings/bindDisplayPreferences';
import {displayPreferences} from '../../src/presentation/settings/displayPreferences';
afterEach(()=>displayPreferences.reset());
it('defers changes until rendering and stops updating disposed scenes',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 const scale=vi.spyOn(engine,'setHardwareScalingLevel');
 const pipeline={imageProcessing:{exposure:0,contrast:0},bloomEnabled:false,samples:1};
 bindDisplayPreferences(scene,pipeline as DefaultRenderingPipeline,1.25,1.05);
 expect(pipeline.imageProcessing.exposure).toBe(1.25);expect(pipeline.samples).toBe(4);
 displayPreferences.set('renderScale',.75);displayPreferences.set('brightness',120);displayPreferences.set('shadows',false);displayPreferences.set('bloom',false);displayPreferences.set('samples',2);
 expect(pipeline.imageProcessing.exposure).toBe(1.25);expect(scene.shadowsEnabled).toBe(true);
 scene.onBeforeRenderObservable.notifyObservers(scene);
 expect(scale).toHaveBeenLastCalledWith(1/.75);expect(pipeline.imageProcessing.exposure).toBe(1.5);expect(scene.shadowsEnabled).toBe(false);expect(pipeline.bloomEnabled).toBe(false);expect(pipeline.samples).toBe(2);
 scene.dispose();displayPreferences.set('brightness',80);scene.onBeforeRenderObservable.notifyObservers(scene);expect(pipeline.imageProcessing.exposure).toBe(1.5);engine.dispose();
});
