<script lang="ts">
 import {onMount} from 'svelte';
 import {Engine} from '@babylonjs/core/Engines/engine';
 import {createLevelSwap} from './levelSwap';
 import {waitForRegionReadiness} from './regionReadiness';
 import {createRegionScene,type RegionScene} from '../presentation/region/regionScene';
 import type {RegionPoint} from '../domain/region/regionObjectives';
 import type {SoundCue} from '../domain/audio/soundCue';
 let {paused,waterRestored,targetId=null,spawn,onReady,onFailure,onPosition,onPause,onHeading,onPlayerHeading}:{paused:boolean;waterRestored:boolean;targetId?:string|null;spawn?:RegionPoint;onReady:()=>void;onFailure:(error:unknown)=>void;onPosition:(position:RegionPoint,label:string)=>void;onPause:()=>void;onHeading?:(heading:number)=>void;onPlayerHeading?:(heading:number)=>void}=$props();
 let canvas:HTMLCanvasElement;
 let region:RegionScene|undefined;
 let lastPaused:boolean|undefined,discardNextFrame=true;
 function reportPlayerHeading(){
  if(!region||!onPlayerHeading)return;
  // Domain facing is world X/Z (stored as x/y); the atlas keeps +Z at the top.
  const facing=region.player.motion.facing;
  onPlayerHeading((Math.atan2(facing.x,facing.y)*180/Math.PI+360)%360);
 }
 function syncPause(){
  if(!region||paused===lastPaused)return;
  lastPaused=paused;region.suspendInput(paused);region.scene.resetLastAnimationTimeFrame();discardNextFrame=true;
  if(!paused)canvas.focus();
 }
 $effect(()=>{paused;syncPause();});
 $effect(()=>{const restored=waterRestored;region?.setWaterRestored(restored);});
 $effect(()=>{const target=targetId;region?.setObjective(target);});
 export function reset(){region?.reset();region?.scene.resetLastAnimationTimeFrame();discardNextFrame=true;}
 export function playCue(cue:SoundCue){region?.audio.play(cue);}
 onMount(()=>{
  let live=true,engine:Engine;
  const readinessAbort=new AbortController();
  try{engine=new Engine(canvas,true,{preserveDrawingBuffer:import.meta.env.DEV,stencil:true});}catch(error){onFailure(error);return;}
  const levels=createLevelSwap<RegionScene>({disposeEngine:()=>engine.dispose(),onShown:()=>{canvas.tabIndex=-1;}});
  let reportSeconds=0,resizePending=false;
  engine.runRenderLoop(()=>{
   if(!region)return;
   if(document.hidden){region.suspendInput(true);discardNextFrame=true;onPause();return;}
   syncPause();if(paused)return;
   if(resizePending){engine.resize();resizePending=false;}
   if(discardNextFrame){discardNextFrame=false;region.scene.resetLastAnimationTimeFrame();return;}
   region.scene.render();reportSeconds+=engine.getDeltaTime()/1000;
   if(reportSeconds>=.1){reportSeconds=0;const p=region.player.capsulePosition();onPosition({x:p.x,y:p.y,z:p.z},region.getLocationLabel());reportPlayerHeading();if(onHeading){const f=region.follow.planarBasis().forward;onHeading((Math.atan2(f.x,f.z)*180/Math.PI+360)%360);}}
  });
  // Resizing the WebGL backing buffer clears its frozen pixels. During AVG/modals, let CSS
  // stretch that frame; resize the buffer on resume without taking a paused physics step.
  const resize=()=>{if(region&&paused){resizePending=true;return;}engine.resize();resizePending=false;};
  const hidden=()=>{if(document.hidden){region?.suspendInput(true);discardNextFrame=true;onPause();}};
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',hidden);resize();
  levels.swap(async()=>{
   let built:RegionScene|undefined;
   try{built=await createRegionScene(engine,canvas,spawn);built.suspendInput(true);built.setObjective(targetId);await waitForRegionReadiness(built.scene,readinessAbort.signal);return built;}
   catch(error){built?.dispose();if(live)onFailure(error);throw error;}
  },built=>{
   region=built;built.setWaterRestored(waterRestored);built.setObjective(targetId);
   // Establish the AVG backdrop before onReady can pause the first visible frame.
   built.suspendInput(true);built.scene.resetLastAnimationTimeFrame();built.scene.render();
   lastPaused=undefined;syncPause();
   const p=built.player.capsulePosition();onPosition({x:p.x,y:p.y,z:p.z},built.getLocationLabel());reportPlayerHeading();
   if(document.hidden)onPause();onReady();
  });
  canvas.tabIndex=-1;
  return()=>{live=false;region=undefined;levels.unmount();readinessAbort.abort();window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',hidden);};
 });
</script>
<canvas bind:this={canvas} tabindex="-1" data-game-entry aria-label="白潮原野遊戲畫面" style="width:100vw;height:100vh;display:block"></canvas>
