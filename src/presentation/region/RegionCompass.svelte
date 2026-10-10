<script lang="ts">
 import type {RegionPoint} from '../../domain/region/regionObjectives';
 import {bearingTo,relativeBearing} from '../hud/hudNavigation';
 let {heading=0,position,target}:{heading?:number;position:RegionPoint;target?:Pick<RegionPoint,'x'|'z'>}=$props();
 const degrees=Array.from({length:24},(_,i)=>i*15);
 const delta=$derived(target?relativeBearing(bearingTo(position,target),heading):0);
 const distance=$derived(target?Math.round(Math.hypot(target.x-position.x,target.z-position.z)):0);
</script>
<div class="compass" aria-label={`鏡頭方位 ${Math.round((heading+360)%360)} 度`}>
 <svg viewBox="0 0 400 72" aria-hidden="true">
  <path d="M10 30H390" class="line"/>
  {#each degrees as degree}
   {@const offset=relativeBearing(degree,heading)}
   {#if Math.abs(offset)<96}<g transform={`translate(${200+offset*2} 0)`} opacity={Math.min(1,(100-Math.abs(offset))/18)}>
    <path d={degree%90===0?'M0 26v8':'M0 28v4'} class="tick"/>
    {#if degree%90===0}<text y="17">{['N','E','S','W'][degree/90]}</text>{/if}
   </g>{/if}
  {/each}
  <path d="m200 23-3-5h6Z" class="center"/>
  {#if target}<g transform={`translate(${200+Math.max(-87,Math.min(87,delta))*2} 41)`}>
   <path d="m0-7 7 7-7 7-7-7Z" class="target"/><circle r="2" fill="white"/>
   <text y="24">{Math.abs(delta)>87?(delta<0?'‹ ':'› '):''}{distance} m</text>
  </g>{/if}
 </svg>
</div>
<style>
 .compass{position:absolute;left:50%;top:calc(21px * var(--hud-scale,1));transform:translateX(-50%);width:min(34vw,calc(450px * var(--hud-scale,1)));color:white;filter:drop-shadow(0 1px 1px #18314b99)}svg{width:100%;overflow:visible}.line{stroke:#e2efff77;stroke-width:.6}.tick{stroke:#fff;stroke-width:.8}text{fill:#f7faff;font:400 13px var(--font-body);letter-spacing:1px;text-anchor:middle}.center{fill:white}.target{fill:#4377ff;stroke:#c4e6ff;stroke-width:1.5}
 @media(max-width:850px){.compass{width:35vw;left:55%;top:25px}}
 @media(max-width:540px){text{font-size:24px}.compass{width:37vw;left:auto;right:42px;top:91px;transform:none}}
</style>
