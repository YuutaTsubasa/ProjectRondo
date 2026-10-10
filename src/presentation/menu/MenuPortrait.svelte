<script lang="ts">
 import {onMount} from 'svelte';
 import type {PortraitPose} from './menuPortraitScene';
 import {acquireMenuPortrait,type PortraitRenderer} from './sharedMenuPortrait';
 let {active=true,pose='menu'}:{active?:boolean;pose?:PortraitPose}=$props();
 let host:HTMLDivElement;
 let lease:ReturnType<typeof acquireMenuPortrait>|undefined;
 let renderer=$state<PortraitRenderer>();
 let ready=$state(false),hidden=$state(false),reduced=$state(false);
 $effect(()=>{
  if(!renderer||!lease?.owns())return;
  renderer.setPresentation(pose,active&&!hidden,reduced);
  if(active&&!hidden)renderer.start();else renderer.stop();
 });
 // Read `ready` first so the effect subscribes to it even before the lease exists.
 $effect(()=>{const shown=String(ready);if(lease?.owns())lease.canvas.dataset.ready=shown;});
 onMount(()=>{
  // The scene background remains visible until the 3D portrait is available.
  if(!('WebGLRenderingContext' in window))return;
  let cancelled=false;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const visibility=()=>{hidden=document.hidden;reduced=preference.matches;};
  visibility();document.addEventListener('visibilitychange',visibility);preference.addEventListener('change',visibility);
  const own=lease=acquireMenuPortrait(host);
  // A portrait loaded by an earlier screen or a warm-up shows at once rather than fading in again.
  ready=own.loaded;own.canvas.dataset.ready=String(own.loaded);
  const resizeView=()=>{if(own.owns())renderer?.resize();};
  const resize=new ResizeObserver(resizeView);resize.observe(host);
  // A CSS transform can change visible size without changing the observed layout box.
  let resizeFrame=0;
  const afterLayout=()=>{if(resizeFrame)cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;resizeView();});};
  window.addEventListener('resize',afterLayout);
  void own.renderer.then(async view=>{
   if(cancelled)return;
   if(own.owns())view.snapToPose();
   renderer=view;
   await view.ready;
   if(cancelled||!own.owns())return;
   ready=true;view.resize();
  }).catch(error=>{
   if(!cancelled){console.warn('3D title portrait unavailable; keeping the scene background.',error);ready=false;}
   renderer=undefined;
  });
  return()=>{cancelled=true;renderer=undefined;own.release();lease=undefined;resize.disconnect();window.removeEventListener('resize',afterLayout);if(resizeFrame)cancelAnimationFrame(resizeFrame);document.removeEventListener('visibilitychange',visibility);preference.removeEventListener('change',visibility);};
 });
</script>
<!-- The shared portrait canvas is appended here while this screen owns it. -->
<div class="portrait" class:ready aria-hidden="true" bind:this={host}></div>
<style>
 .portrait{position:absolute;inset:0;pointer-events:none}
 .portrait :global(canvas){display:block;width:100%;height:100%;opacity:0;transition:opacity .3s}
 .ready :global(canvas){opacity:1}
 @media(prefers-reduced-motion:reduce){.portrait :global(canvas){transition:none}}
</style>
