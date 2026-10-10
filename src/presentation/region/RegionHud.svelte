<script lang="ts">
 import InputHint from '../input/InputHint.svelte';
 import {fade} from 'svelte/transition';
 import type {RegionProgress} from '../../domain/region/regionProgress';
 import type {RegionPoint} from '../../domain/region/regionObjectives';
 import {regionObjective} from '../../domain/region/regionObjectives';
 import {REGION_INTERACTION_PLACES} from '../../domain/region/regionLayout';
 import LocationMarquee from '../hud/LocationMarquee.svelte';
 import HudWaves from '../hud/HudWaves.svelte';
 import HudIdentity from '../hud/HudIdentity.svelte';
 import RegionMinimap from './RegionMinimap.svelte';
 import RegionCompass from './RegionCompass.svelte';
 import {regionHudCopy} from './regionHudCopy';
 let {subdued=false,progress,position,heading=0,playerHeading=180,locationLabel,navigationId,prompt,notice,saveWarning,onInteract,onMap,onPause}:{subdued?:boolean;progress:RegionProgress;position:RegionPoint;heading?:number;playerHeading?:number;locationLabel:string;navigationId:string|null;prompt:string;notice:string;saveWarning:boolean;onInteract:()=>void;onMap:()=>void;onPause:()=>void}=$props();
 // Keep the final message readable until its outro finishes.
 let displayedNotice=$state('');
 $effect(()=>{if(notice)displayedNotice=notice;});
 function noticeFade(node:HTMLElement){
  return fade(node,{duration:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:350});
 }
 const objective=$derived(regionObjective(progress.chapter));
 const target=$derived(REGION_INTERACTION_PLACES.find(p=>p.id===navigationId));
 const copy=$derived(target&&target.id!==objective.placeId?{title:`前往${target.name}`,instruction:target.kind==='expedition'?'查看遠征入口':target.kind==='vista'?'探索這處風景':'調查回聲管'}:regionHudCopy[progress.chapter]);
 const distance=$derived(target?Math.round(Math.hypot(target.x-position.x,target.z-position.z)):0);
 const location=$derived(locationLabel.split('·')[0].trim());
 const area=$derived(position.z>=-63?'白色王城':location);
 const promptVerb=$derived(prompt.split(' · ')[0]);
 const interactAction=$derived(promptVerb==='接聽回聲管'?'調查':promptVerb);
 const interactTarget=$derived(prompt.split(' · ').slice(1).join(' · '));
 function controlKey(event:KeyboardEvent){if(event.key===' '||event.key==='Spacebar')event.stopPropagation();}
</script>
<div class="hud" class:subdued aria-hidden={subdued}>
 <HudWaves/>
 <LocationMarquee location={area}/>
 <div class="atlas"><RegionMinimap {position} {heading} {playerHeading} {navigationId}/></div>
 <RegionCompass {heading} {position} {target}/>
 <nav aria-label="探索選單">
  <button class="hud-button" onclick={onMap} onkeydown={controlKey} aria-label="開啟區域地圖"><svg viewBox="0 0 32 28" aria-hidden="true"><path d="m3 6 8-3 10 4 8-3v19l-8 3-10-4-8 3zM11 3v19M21 7v19"/><path d="m14 12 4 3-4 3z"/></svg><kbd><InputHint label="M" gameplay/></kbd></button>
  <button class="hud-button" onclick={onPause} onkeydown={controlKey} aria-label="暫停第一區域"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 5h6v6H5zM17 5h6v6h-6zM5 17h6v6H5zM17 17h6v6h-6z"/></svg><kbd><InputHint label="Esc" gameplay/></kbd></button>
 </nav>
 <section class="mission" aria-label="目前任務">
  <svg class="mission-star" viewBox="0 0 32 32" aria-hidden="true"><path d="m16 3 4 9 9 4-9 4-4 9-4-9-9-4 9-4Z"/><path d="m12 20 8-8M12 12l8 8"/></svg>
  <div class="mission-copy"><h1>{copy.title}</h1>
   <div class="mission-rule" aria-hidden="true"></div><div class="mission-details">
   {#if target}<p class="destination">{copy.instruction}</p><p class="distance"><span aria-hidden="true">◆</span>{distance} <small>m</small></p>
   {:else}<p class="destination">自由探索 · 旅途仍在繼續</p>{/if}
  </div></div>
 </section>
 {#key location}<div class="area-arrival" aria-hidden="true"><span></span><small>白潮原野</small><strong>{location}</strong><span></span></div>{/key}
 {#if prompt}
  <button class="interact" onclick={onInteract} onkeydown={controlKey} aria-label={prompt}>
   <kbd><InputHint label="E" gameplay/></kbd>
   <span class="interact-panel">
    <svg class="interact-icon" viewBox="0 0 32 32" aria-hidden="true">
     {#if promptVerb==='查看入口'}<path d="M7 27V5h16v22M5 27h22M18 16h1M11 5v22"/>
     {:else if promptVerb==='記錄風景'}<path d="m16 3 4 9 9 4-9 4-4 9-4-9-9-4 9-4ZM7 3v6M4 6h6"/>
     {:else}<circle cx="13" cy="13" r="8"/><path d="m19 19 9 9"/>{/if}
    </svg>
    <span class="interact-copy"><span class="interact-action">{interactAction}</span>{#if interactTarget}<span class="interact-target">{interactTarget}</span>{/if}</span>
    <svg class="interact-chevron" viewBox="0 0 12 22" aria-hidden="true"><path d="m2 3 7 8-7 8"/></svg>
   </span>
  </button>
 {/if}
 {#if notice}
  <div class="notice" role="status" transition:noticeFade>
   <div class="notice-surface" aria-hidden="true"></div>
   <svg class="notice-icon" viewBox="0 0 76 76" aria-hidden="true"><path class="diamond-halo" d="m38 1 37 37-37 37L1 38Z"/><path class="diamond-frame" d="m38 9 29 29-29 29L9 38Z"/><path class="diamond-core" d="m38 17 21 21-21 21-21-21Z"/><circle cx="38" cy="29" r="3.1"/><path class="info-stem" d="M38 37v15"/></svg>
   <span class="notice-copy">{displayedNotice}</span>
  </div>
 {/if}
 {#if saveWarning}<p class="save-warning" role="status">瀏覽器未允許存檔，本次進度會保留到離開遊戲。</p>{/if}
 <HudIdentity/>
</div>
<style>
 .hud{transition:opacity .32s ease,translate .4s ease}.hud.subdued{opacity:0;translate:0 -8px}
 .hud.subdued :global(button){pointer-events:none}
 .hud{position:fixed;inset:0;pointer-events:none;color:#f1f7ff;font-family:var(--font-body);text-shadow:0 1px 2px #10243caa;--inset:max(65px,5.3vw);--hud-scale:1}
 .atlas{position:absolute;left:var(--inset);top:24px;transform:scale(var(--hud-scale));transform-origin:left top}
 nav{position:absolute;top:27px;right:var(--inset);transform:scale(var(--hud-scale));transform-origin:right top;display:flex;gap:30px}.hud-button{pointer-events:auto;border:0;background:transparent;color:inherit;width:48px;padding:4px 0;display:flex;flex-direction:column;align-items:center;gap:10px;cursor:pointer;filter:drop-shadow(0 1px 1px #15314a80)}.hud-button svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.5}.hud-button kbd{font:400 13px var(--font-body)}.hud-button:hover{color:#c8eaff}.hud-button:focus-visible{outline:1px solid white;outline-offset:6px}
 .mission{position:absolute;left:var(--inset);top:calc(24px + 177px * var(--hud-scale));transform:scale(var(--hud-scale));transform-origin:left top;display:flex;gap:11px;max-width:305px;background:radial-gradient(ellipse at 20% 45%,#10294426,transparent 74%)}.mission-star{width:25px;height:25px;flex:none;margin-top:1px;fill:#458bff;stroke:#d2eaff;stroke-width:1.25;filter:drop-shadow(0 0 3px #448aff60)}.mission small{font-size:11px;font-weight:400;letter-spacing:1.5px;color:#e2eeff}.mission h1{font-size:21px;font-weight:700;letter-spacing:.3px;line-height:1.35;margin:0}.destination{margin:0;font-size:14px;font-weight:400;letter-spacing:.3px;line-height:1.4}.distance{font:400 15px var(--font-body);font-variant-numeric:tabular-nums;letter-spacing:.8px;margin:4px 0 0}.distance>span{font-size:11px;margin-right:9px;color:#a8dfff}.distance small{font-size:14px;letter-spacing:0}
 .mission-copy{min-width:0}.mission-rule{height:1px;margin:7px 0 7px;background:linear-gradient(90deg,#eff7ff9c,#eff7ff24 85%,transparent)}.mission-details{padding-left:0}.destination{color:#e0e9f3}.distance{padding-left:18px}
 .area-arrival{position:absolute;top:24%;left:50%;transform:translateX(-50%);display:flex;align-items:center;flex-direction:column;color:white;animation:area-title 4.2s both}.area-arrival small{font-size:10px;letter-spacing:7px;margin:9px 0}.area-arrival strong{font-size:30px;font-weight:400;letter-spacing:10px;margin-left:10px;white-space:nowrap}.area-arrival>span{width:150px;height:1px;background:linear-gradient(90deg,transparent,#fff,transparent);margin-top:12px}.area-arrival>span:first-child{width:75px;margin:0}
 .interact{position:absolute;left:60%;top:51%;transform:translateY(-50%) scale(var(--hud-scale));transform-origin:left center;display:flex;align-items:center;gap:12px;width:272px;max-width:32vw;padding:0;pointer-events:auto;border:0;background:transparent;color:#f5f9ff;text-align:left;font-family:var(--font-body);cursor:pointer;animation:interact-in .26s ease-out both}
 .interact kbd{flex:none;font:700 17px var(--font-body);background:#f2f7ff;color:#192c51;width:27px;height:29px;display:grid;place-items:center;border-radius:2px;box-shadow:0 0 9px #73adff55;text-shadow:none}
 .interact-panel{position:relative;display:flex;align-items:center;gap:15px;flex:1;min-width:0;min-height:54px;box-sizing:border-box;padding:6px 25px 6px 17px;background:linear-gradient(90deg,#101f3ce8,#193555b8 75%,#213e5b26);border-left:2px solid #93bdff;border-top:1px solid #a6ccff88;border-bottom:1px solid #8bbcff66;box-shadow:inset 4px 0 0 #3979d433;transition:background .18s,box-shadow .18s}
 .interact-panel:after{content:"";position:absolute;left:8px;right:0;top:-3px;height:1px;background:linear-gradient(90deg,#94c7ffb3,transparent)}
 .interact-icon{width:26px;height:26px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 5px #4d90ff55)}
 .interact-copy{display:flex;flex-direction:column;gap:1px;min-width:0}.interact-action{font-size:18px;letter-spacing:2px;line-height:1.3}.interact-target{font-size:11px;letter-spacing:1px;color:#bdcee4;line-height:1.5;overflow-wrap:anywhere}.interact-chevron{width:9px;height:16px;fill:none;stroke:#b0d0ff;stroke-width:1.4;margin-left:auto;flex:none;opacity:.7}
 .interact:hover .interact-panel,.interact:focus-visible .interact-panel{background:linear-gradient(90deg,#244c80ee,#294f7699 80%,#294f7626);box-shadow:inset 4px 0 #81b7ff55,0 0 18px #448bff22}.interact:focus-visible{outline:1px solid #e7f4ff;outline-offset:7px}.interact:active .interact-panel{background:#3d669cd9}
 .notice{position:absolute;top:calc(25px + 90px * var(--hud-scale));left:50%;transform:translateX(-50%) scale(var(--hud-scale));transform-origin:center top;width:min(560px,48vw);box-sizing:border-box;display:flex;align-items:center;gap:12px;min-height:68px;padding:0 34px 0 0;isolation:isolate}
 .notice-surface{position:absolute;inset:8px 0;z-index:-1;background:#85baff9c;clip-path:polygon(22px 0,100% 0,calc(100% - 14px) 50%,100% 100%,22px 100%,0 50%)}
 .notice-surface:after{content:"";position:absolute;inset:1px;background:linear-gradient(90deg,#132546f5,#182e50eb 68%,#284a70b8);clip-path:polygon(22px 0,100% 0,calc(100% - 14px) 50%,100% 100%,22px 100%,0 50%)}
 .notice-icon{width:70px;height:70px;overflow:visible;flex:none;fill:#467cff;filter:drop-shadow(0 0 7px #377dff99)}.diamond-halo{fill:#2461d61f;stroke:#7cb1ff;stroke-width:1;transform-origin:38px 38px;animation:notice-signal 2.6s ease-out infinite}.diamond-frame{fill:#2861b966;stroke:#a3d5ff;stroke-width:1;animation:notice-glow 2.6s ease-in-out infinite}.diamond-core{fill:#e7f6ff;stroke:#80adff;stroke-width:1}.info-stem{stroke:#4279ff;stroke-width:5;stroke-linecap:round}.notice-copy{font-size:15px;line-height:1.65;letter-spacing:.7px;padding:13px 0;overflow-wrap:anywhere}
 :global([inert]) .diamond-halo,:global([inert]) .diamond-frame{animation-play-state:paused}
 @keyframes notice-signal{0%{transform:scale(.82);opacity:0}18%{opacity:.85}85%,100%{transform:scale(1.16);opacity:0}}
 @keyframes notice-glow{0%,100%{opacity:.55}35%{opacity:1}}
 .save-warning{position:absolute;bottom:130px;left:var(--inset);max-width:240px;font-size:11px;background:#20314dda;padding:9px 12px;border-left:2px solid #a7d7ff}

 @keyframes area-title{0%{opacity:0;translate:0 7px}15%,65%{opacity:1;translate:0 0}100%{opacity:0;translate:0 -4px}}@keyframes interact-in{from{opacity:0;translate:10px 0}to{opacity:1;translate:0 0}}
 @media(min-width:1600px){.hud{--hud-scale:1.2}}
 @media(min-width:1900px){.hud{--hud-scale:1.4}}
 @media(min-width:2500px){.hud{--hud-scale:1.65}}
 @media(max-width:700px){.hud{--inset:42px}.atlas{top:18px}.mission{top:149px;max-width:225px;gap:9px}.mission h1{font-size:17px}.mission small{font-size:8px}.destination{font-size:12px}.mission-details{padding-left:0}.mission-rule{margin:6px 0}.distance{font-size:14px;padding-left:15px}.mission-star{width:20px;height:20px;margin-top:0}nav{top:20px;gap:15px}.hud-button svg{width:24px}.area-arrival{top:40%}.area-arrival strong{font-size:23px;letter-spacing:6px}.notice{top:auto;bottom:calc(24% + 115px);width:calc(100vw - 76px);gap:6px;padding-right:25px}.notice-icon{width:51px;height:58px}.notice-copy{font-size:12px}.interact{top:auto;bottom:24%;left:50%;transform:translateX(-50%);width:272px;max-width:calc(100vw - 84px);gap:10px}.interact-action{font-size:18px}}
 @media(max-width:450px){.mission{max-width:195px}.save-warning{bottom:150px;max-width:190px}}
 @media(prefers-reduced-motion:reduce){.hud{transition:none}.area-arrival{animation:none;opacity:0}.notice,.interact,.diamond-halo,.diamond-frame{animation:none}.interact-panel{transition:none}}
</style>
