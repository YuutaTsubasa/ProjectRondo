<script lang="ts">
 import {onMount,type Snippet} from 'svelte';
 import {uiViewport} from './uiViewport';
 let {children,layer=10}:{children:Snippet;layer?:number}=$props();
 let host:HTMLDivElement;
 let size=$state(uiViewport(typeof window==='undefined'?1920:window.innerWidth,typeof window==='undefined'?1080:window.innerHeight));
 onMount(()=>{
  const resize=()=>{size=uiViewport(host.clientWidth,host.clientHeight);};
  resize();const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(resize);observer?.observe(host);
  window.addEventListener('resize',resize);
  return()=>{observer?.disconnect();window.removeEventListener('resize',resize);};
 });
</script>
<div class="ui-screen" bind:this={host} style:z-index={layer}>
 <div class="ui-viewport" style:width={`${size.width}px`} style:height={`${size.height}px`} style:transform={`scale(${size.scale})`}>
  {@render children()}
 </div>
</div>
<style>
 .ui-screen{position:fixed;inset:0;overflow:hidden;pointer-events:none}
 .ui-viewport{position:absolute;top:0;left:0;transform-origin:top left;container:game-ui / size;pointer-events:none}
 /* Re-enable ordinary menu roots; explicit HUD/decorative pointer-events:none still wins. */
 :global(:where(.ui-viewport > *)){pointer-events:auto}
</style>
