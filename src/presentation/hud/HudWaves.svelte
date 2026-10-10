<script lang="ts">
 import {onMount} from 'svelte';
 let {paused=false,edges=true,cinematic=false,subtle=false}:{paused?:boolean;edges?:boolean;cinematic?:boolean;subtle?:boolean}=$props();
 let hidden=$state(false);
 const waveId=$props.id();
 const ribbons=Array.from({length:18},(_,i)=>({
  front:`M-100 ${14+i*3.3} C80 ${27+i*2.8} 125 ${164-i*1.7} 360 ${139-i*1.5} S660 ${87+i*2.2} 865 ${147-i*.5} S1265 ${24+i*2.3} 1540 ${28+i*3}`,
  back:`M-100 ${74+i*2.6} C155 ${173-i*1.1} 245 ${72+i*2} 500 ${135+i*.7} S870 ${178-i*2.3} 1060 ${115+i*1.2} S1325 ${133-i*3.8} 1540 ${13+i*2.8}`,
 }));
 const visibleRibbons=$derived(subtle?ribbons.filter((_,i)=>i%3===0):ribbons);
 onMount(()=>{const change=()=>hidden=document.hidden;change();document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);});
</script>
{#snippet waveLines(side:string)}
 <svg viewBox="0 0 1440 180" preserveAspectRatio="none">
  <defs><linearGradient id={`${waveId}-${side}`} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color={subtle?"#bdd8f1":"#1d427f"} stop-opacity={subtle?".08":".12"}/><stop offset=".35" stop-color={subtle?"#c9dff3":"#18376c"} stop-opacity={subtle?".26":".65"}/><stop offset="1" stop-color={subtle?"#b0cfe9":"#0b203f"} stop-opacity={subtle?".48":".94"}/></linearGradient></defs>
  <path class="wave-body" d="M-100 27C80 40 145 146 360 125S660 98 865 147S1265 33 1540 34V220H-100Z" fill={`url(#${waveId}-${side})`}/>
  <g class="ribbon front">{#each visibleRibbons as line,i}<path d={line.front} opacity={i%6===0?.85:.32}/>{/each}</g>
  <g class="ribbon back">{#each visibleRibbons as line,i}<path d={line.back} opacity={i%6===0?.65:.2}/>{/each}</g>
  <g class="current">{#each [2,8,14] as i}<path d={ribbons[i].front}/>{/each}</g>
 </svg>
{/snippet}
<div class="hud-waves" class:cinematic class:subtle class:stopped={paused||hidden} aria-hidden="true">
 {#if edges}<div class="wave-edge left">{@render waveLines('left')}</div>
 <div class="wave-edge right">{@render waveLines('right')}</div>{/if}
 <div class="bottom">{@render waveLines('bottom')}</div>
</div>
<style>
 .hud-waves{position:fixed;inset:0;overflow:hidden;pointer-events:none;user-select:none;color:#8cc2ff;z-index:0;--wave-edge:clamp(48px,5.8vw,96px)}
 .bottom{position:absolute;left:0;right:0;bottom:-8px;height:clamp(105px,24vh,260px);background:transparent}
 .cinematic .bottom{height:clamp(150px,32vh,320px);filter:drop-shadow(0 0 4px #4e8eff88)}
 .cinematic{color:#b5d8ff}.cinematic .front{stroke-width:1.1}
 .wave-edge{position:absolute;width:100vh;height:var(--wave-edge);transform-origin:0 0;opacity:.8;background:transparent;overflow:hidden;mask-image:linear-gradient(to bottom,#000 0%,#000 82%,transparent 100%)}
 /* Side surfaces keep the filled side against the screen edge, fading toward the scene. */
 .wave-edge svg{transform:scaleY(-1)}
 .left{left:0;top:100%;transform:rotate(-90deg)}.right{left:100%;top:0;transform:rotate(90deg)}
 svg{display:block;width:100%;height:100%;overflow:visible;fill:none;stroke:currentColor;stroke-width:1;stroke-linecap:round}path{vector-effect:non-scaling-stroke}
 .wave-body{stroke:none}
 .ribbon{transform-origin:center bottom;animation:wave-breathe 3s ease-in-out infinite alternate}.back{animation-duration:4.2s;animation-delay:-2s;animation-direction:alternate-reverse}
 .current{stroke:#d5edff;stroke-width:1.35;stroke-dasharray:70 710;opacity:.65;animation:wave-flow 2.6s linear infinite}
 .right .current{animation-direction:reverse}
 .stopped .ribbon,.stopped .current,:global([inert]) .ribbon,:global([inert]) .current{animation-play-state:paused}
 @keyframes wave-breathe{from{transform:translate(-18px,7px) scaleY(.9)}to{transform:translate(18px,-7px) scaleY(1.055)}}
 @keyframes wave-flow{to{stroke-dashoffset:-780}}
 @media(max-width:700px){.bottom{height:100px}.bottom svg{width:150%;margin-left:-25%}}
 .subtle{position:absolute;color:#6999c8;z-index:1}
 .subtle .bottom{height:clamp(48px,10vh,86px);bottom:-10px}
 .subtle .ribbon{animation-duration:7s;stroke-width:.8}
 .subtle .back{animation-duration:10s;opacity:.5}
 .subtle .current{animation-duration:9s;stroke:#76a8d6;stroke-width:1;opacity:.25}
 @media(prefers-reduced-motion:reduce){.ribbon,.current{animation:none}}
</style>
