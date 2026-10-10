<script lang="ts">
 import {onMount} from 'svelte';
 import type {PortraitPose} from './menuPortraitScene';
 import type {mountMenuPortrait} from './menuPortraitRuntime';
 let {active=true,pose='menu'}:{active?:boolean;pose?:PortraitPose}=$props();
 let canvas:HTMLCanvasElement;
 let renderer=$state<ReturnType<typeof mountMenuPortrait>>();
 let ready=$state(false),hidden=$state(false),reduced=$state(false);
 $effect(()=>{
  if(!renderer)return;
  renderer.setPresentation(pose,active&&!hidden,reduced);
  if(active&&!hidden)renderer.start();else renderer.stop();
 });
 onMount(()=>{
  // The scene background remains visible until the 3D portrait is available.
  if(!('WebGLRenderingContext' in window))return;
  let cancelled=false,current:ReturnType<typeof mountMenuPortrait>|undefined;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const visibility=()=>{hidden=document.hidden;reduced=preference.matches;};
  visibility();document.addEventListener('visibilitychange',visibility);preference.addEventListener('change',visibility);
  const resize=new ResizeObserver(()=>current?.resize());resize.observe(canvas);
  void import('./menuPortraitRuntime').then(async({mountMenuPortrait})=>{
   if(cancelled)return;
   current=mountMenuPortrait(canvas);renderer=current;
   await current.ready;
   if(cancelled)return;
   ready=true;current.resize();
  }).catch(error=>{
   if(!cancelled){console.warn('3D title portrait unavailable; keeping the scene background.',error);ready=false;}
   current?.dispose();renderer=undefined;
  });
  return()=>{cancelled=true;renderer=undefined;current?.dispose();resize.disconnect();document.removeEventListener('visibilitychange',visibility);preference.removeEventListener('change',visibility);};
 });
</script>
<div class="portrait" class:ready aria-hidden="true">
 <canvas bind:this={canvas} data-menu-portrait data-ready={ready}></canvas>
</div>
<style>
 .portrait{position:absolute;inset:0;pointer-events:none}
 canvas{display:block;width:100%;height:100%;opacity:0;transition:opacity .3s}
 .ready canvas{opacity:1}
 @media(prefers-reduced-motion:reduce){canvas{transition:none}}
</style>
