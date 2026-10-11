<script lang="ts">
 import {onMount,type Snippet} from 'svelte';
 import {uiViewport} from './uiViewport';
 let {children,layer=10}:{children:Snippet;layer?:number}=$props();
 let host:HTMLDivElement;
 // Width and height come from CSS (100% / scale); only the scale is computed here.
 let scale=$state(uiViewport(typeof window==='undefined'?1920:window.innerWidth,typeof window==='undefined'?1080:window.innerHeight).scale);
 onMount(()=>{
  const resize=()=>{scale=uiViewport(host.clientWidth,host.clientHeight).scale;};
  resize();const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(resize);observer?.observe(host);
  window.addEventListener('resize',resize);
  return()=>{observer?.disconnect();window.removeEventListener('resize',resize);};
 });
</script>
<div class="ui-screen" bind:this={host} style:z-index={layer}>
 <div class="ui-viewport" style={`--ui-scale:${scale}`}>
  {@render children()}
 </div>
</div>
<style>
 .ui-screen{position:fixed;inset:0;overflow:clip;pointer-events:none}
 /* Derive coverage from the host in CSS, so native viewport resizing cannot leave a stale-height strip before ResizeObserver runs. */
 .ui-viewport{position:absolute;top:0;left:0;width:calc(100% / var(--ui-scale));height:calc(100% / var(--ui-scale));transform:scale(var(--ui-scale));transform-origin:top left;container:game-ui / size;pointer-events:none}
 /* Re-enable ordinary menu roots; explicit HUD/decorative pointer-events:none still wins. */
 :global(:where(.ui-viewport > *)){pointer-events:auto}
</style>
