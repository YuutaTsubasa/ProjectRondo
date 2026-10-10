<script lang="ts">
 import {onMount,untrack} from 'svelte';
 let {location,paused=false}:{location:string;paused?:boolean}=$props();
 let hidden=$state(false);
 const outlineId=$props.id();
 const name=$derived(location.split('·')[0].trim());
 let shown=$state(untrack(()=>name));
 let leaving=$state(false),reduced=$state(false);
 const text=$derived(shown.repeat(Math.max(16,Math.ceil(80/Math.max(1,shown.length)))));
 $effect(()=>{
  const next=name,instant=reduced,current=untrack(()=>shown);
  if(next===current||instant){shown=next;leaving=false;return;}
  leaving=true;
  // Keep the old name until both rails are outside the viewport. Effect cleanup
  // cancels stale destinations when the player quickly crosses a boundary again.
  const timer=setTimeout(()=>{shown=next;leaving=false;},450);
  return()=>clearTimeout(timer);
 });
 onMount(()=>{
  const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const syncMotion=()=>reduced=preference?.matches??false;syncMotion();preference?.addEventListener('change',syncMotion);
  const change=()=>hidden=document.hidden;change();document.addEventListener('visibilitychange',change);return()=>{document.removeEventListener('visibilitychange',change);preference?.removeEventListener('change',syncMotion);};});
</script>
<div class="location-marquee" class:leaving class:stopped={paused||hidden} aria-hidden="true">
 <!-- Outline the composed glyph alpha, not individual font contours: overlapping CJK
      strokes must merge before their edge is drawn, otherwise interior seams appear. -->
 <svg class="outline-defs" aria-hidden="true"><defs>
  <filter id={outlineId} x="-2%" y="-4%" width="104%" height="108%" color-interpolation-filters="sRGB">
   <feMorphology in="SourceAlpha" operator="dilate" radius=".85" result="expanded"/>
   <feComposite in="expanded" in2="SourceAlpha" operator="out" result="outline"/>
   <feFlood flood-color="#fff"/>
   <feComposite in2="outline" operator="in"/>
  </filter>
 </defs></svg>
 {#each ['left','right'] as side}
  <div class="edge {side}" style:filter={`url(#${outlineId})`}><div class="track" style:--duration={`${text.length*2}s`}><span>{text}</span><span>{text}</span></div></div>
 {/each}
</div>
<style>
 .location-marquee{position:fixed;inset:0;overflow:hidden;pointer-events:none;user-select:none;text-shadow:none;--edge-size:clamp(80px,10cqw,180px);z-index:0}
 .outline-defs{position:absolute;width:0;height:0;overflow:hidden}
 .edge{position:absolute;width:100cqh;height:var(--edge-size);overflow:hidden;transform-origin:0 0;font-family:var(--font-body);font-weight:700;font-size:var(--edge-size);line-height:1;letter-spacing:0;white-space:nowrap;color:#fff;-webkit-text-fill-color:currentColor;-webkit-text-stroke:0;text-shadow:none;opacity:.6;translate:0 0;transition:translate 650ms cubic-bezier(.22,1,.36,1)}
 .left{left:var(--edge-size);top:0;transform:rotate(90deg)}.right{left:calc(100% - var(--edge-size));top:100%;transform:rotate(-90deg)}
 .leaving .edge{transition-duration:450ms;transition-timing-function:cubic-bezier(.4,0,1,1)}.leaving .left{translate:calc(-1 * var(--edge-size) - 8px) 0}.leaving .right{translate:calc(var(--edge-size) + 8px) 0}
 .track{display:flex;width:max-content;animation:flow var(--duration) linear infinite;will-change:transform}.track span{display:block;flex:none}.right .track{animation-direction:reverse}
 .stopped .track,:global([inert]) .track{animation-play-state:paused}
 @keyframes flow{to{transform:translateX(-50%)}}
 @media(prefers-reduced-motion:reduce){.edge{transition:none}.track{animation:none;will-change:auto}}
</style>
