import type {Scene} from '@babylonjs/core/scene';
import type {DefaultRenderingPipeline} from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import {displayPreferences,type DisplaySettings} from './displayPreferences';
/** Apply at render boundaries: a paused scene must retain its frozen framebuffer. */
export function bindDisplayPreferences(scene:Scene,pipeline:DefaultRenderingPipeline,exposure:number,contrast:number){
 let pending:Readonly<DisplaySettings>|undefined;
 let lastScale:number|undefined;
 const unsubscribe=displayPreferences.subscribe(value=>{pending=value;});
 function apply(){
  if(!pending)return;const value=pending;pending=undefined;
  if(lastScale!==value.renderScale){scene.getEngine().setHardwareScalingLevel(1/value.renderScale);lastScale=value.renderScale;}
  pipeline.imageProcessing.exposure=exposure*value.brightness/100;
  pipeline.imageProcessing.contrast=contrast*value.contrast/100;
  pipeline.bloomEnabled=value.bloom;pipeline.samples=value.samples;scene.shadowsEnabled=value.shadows;
 }
 apply();
 const observer=scene.onBeforeRenderObservable.add(apply);
 scene.onDisposeObservable.addOnce(()=>{unsubscribe();scene.onBeforeRenderObservable.remove(observer);});
}
