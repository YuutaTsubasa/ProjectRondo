<script lang="ts">
 import InputHint from '../input/InputHint.svelte';
 import {fade} from 'svelte/transition';
 import HudWaves from './HudWaves.svelte';
 import HudIdentity from './HudIdentity.svelte';
 import LocationMarquee from './LocationMarquee.svelte';
 import {onMount} from 'svelte';
 import {retainMenuPortrait} from '../menu/sharedMenuPortrait';
 // Warm the results-screen portrait during play, so clearing the stage does not stall on a fresh
 // WebGL engine and model load. Released with the HUD; idle release frees it after the stage.
 onMount(()=>'WebGLRenderingContext' in window?retainMenuPortrait():undefined);
 import {projectStagePoint,stageHeading,type StagePoint} from './stageNavigation';
 let {number,title,objective,detail,elapsed,stats,player,facing,target,route,platforms=[],sideView=false,statusLabel,statusValue,statusMax,notice='',onPause}: {
  number:string;title:string;objective:string;detail:string;elapsed:number;
  stats:{label:string;value:string;icon:'coin'|'gate'|'guard'|'retry'}[];
  player:StagePoint;facing:StagePoint;target:StagePoint;route:StagePoint[];
  platforms?:{x:number;y:number;width:number;height:number}[];sideView?:boolean;
  statusLabel:string;statusValue:number;statusMax:number;notice?:string;onPause:()=>void;
 }=$props();
 const uid=$props.id();
 let displayedNotice=$state('');
 $effect(()=>{if(notice)displayedNotice=notice;});
 const clock=(s:number)=>[Math.floor(s/3600),Math.floor(s/60)%60,Math.floor(s)%60].map(v=>String(v).padStart(2,'0')).join(':');
 let marker=$derived(projectStagePoint(target,player,true));
 let distance=$derived(Math.round(Math.hypot(target.x-player.x,target.y-player.y)));
 let path=$derived(route.map(p=>{const q=projectStagePoint(p,player);return `${q.x},${q.y}`;}).join(' '));
 let ratio=$derived(Math.max(0,Math.min(100,statusValue/Math.max(1,statusMax)*100)));
 function pauseKey(e:KeyboardEvent){if(e.key===' '){e.preventDefault();e.stopPropagation();if(!e.repeat)onPause();}}
 function messageFade(node:Element){return fade(node,{duration:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:350});}
</script>
{#snippet symbol(kind:string)}
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
 {#if kind==='clock'}<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5v3m0 2v4l3 2M18 5l2 2"/>
 {:else if kind==='coin'}<ellipse cx="12" cy="12" rx="8" ry="9"/><ellipse cx="12" cy="12" rx="5.5" ry="6.5"/><path d="m12 8 2.5 4-2.5 4-2.5-4Z"/>
 {:else if kind==='guard'}<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Zm0 4v11M8 10h8"/>
 {:else if kind==='retry'}<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/>
 {:else if kind==='sword'}<path d="m12 2 7 3v6c0 5-7 10-7 10S5 16 5 11V5Z" opacity=".55"/><path d="M4 3 8 5l10 13M20 3l-4 2L6 18M3 21l4-4m14 4-4-4M3 15l6 5m12-5-6 5"/><path d="m12 7 1.4 3.6L17 12l-3.6 1.4L12 17l-1.4-3.6L7 12l3.6-1.4Z" fill="currentColor" stroke="none"/>
 {:else if kind==='jump'}<circle cx="14" cy="4" r="1.6" fill="currentColor" stroke="none"/><path d="m12 8 3 4 5 1M6 9l5-2 2 4-4 5-4 3m7-6 4 4-1 5" stroke-width="1.8"/><path d="M2 6c-2 7 2 15 11 16M3 3l-1 3 4-1" opacity=".6"/>
 {:else}<path d="m12 2 10 10-10 10L2 12Zm0 6 4 4-4 4-4-4Z"/>{/if}
 </svg>
{/snippet}
{#snippet crest()}
 <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <path d="M32 2 36 20 32 26 28 20ZM62 32 44 36 38 32 44 28ZM32 62 28 44 32 38 36 44ZM2 32 20 28 26 32 20 36Z" fill="currentColor"/>
  <path d="m12 12 14 9-5 5Zm40 0-9 14-5-5Zm0 40-14-9 5-5Zm-40 0 9-14 5 5Z" fill="currentColor"/>
  <path d="m32 22 10 10-10 10-10-10Z" stroke="currentColor" stroke-width="1.1"/>
  <path d="m32 27 5 5-5 5-5-5Z" fill="currentColor"/>
  <path d="M20 8 24 16M44 8 40 16M56 20 48 24M56 44 48 40M44 56 40 48M20 56 24 48M8 44 16 40M8 20 16 24" stroke="currentColor" stroke-width=".8" opacity=".6"/>
 </svg>
{/snippet}
<div class="stage-hud">
 <HudWaves/>
 <LocationMarquee location={title}/>
 <div class="identity-layer"><HudIdentity/></div>
 <section class="mission" aria-label="關卡目標與數據">
  <div class="chapter-heading"><div class="chapter">TRIAL <b>{number}</b></div><h1>{title}</h1><span class="chapter-rule"></span></div>
  <div class="objective"><span class="objective-diamond" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 0 32 16 16 32 0 16Z" fill="#467bff"/><path d="m16 7 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="white"/></svg></span><strong>{objective}</strong></div>
  <p class="detail"><span aria-hidden="true"><svg viewBox="0 0 12 20"><path d="m6 1 1.5 7L11 10l-3.5 2L6 19l-1.5-7L1 10l3.5-2Z" fill="currentColor"/></svg></span>{detail}</p>
  <div class="readouts"><div class="readout">{@render symbol('clock')}<span aria-label="經過時間">{clock(elapsed)}</span></div>
   {#each stats as stat}<div class="readout" aria-label={`${stat.label} ${stat.value}`}>{@render symbol(stat.icon)}<span>{stat.value}</span><small>{stat.label}</small></div>{/each}
  </div>
 </section>
 <aside class="navigation" aria-label={sideView?'側視路線導航':'俯視路線導航'}>
  <div class="radar">
   <span class="axis">{sideView?'ROUTE':'N'}</span>
   <svg viewBox="0 0 200 200" role="img" aria-label={`下一個目標距離 ${distance} 公尺`}>
    <defs><clipPath id={uid}><circle cx="100" cy="100" r="91"/></clipPath></defs>
    <circle class="radar-base" cx="100" cy="100" r="94"/><circle class="rim" cx="100" cy="100" r="97"/>
    <g clip-path={`url(#${uid})`}>
     {#each platforms as p}{@const q=projectStagePoint(p,player)}<rect class="platform" x={q.x-p.width*1.25} y={q.y-p.height*1.25} width={p.width*2.5} height={p.height*2.5}/>{/each}
     <polyline class="route-glow" points={path}/><polyline class="route" points={path}/>
    </g>
    <path class="ticks" d="M100 3v6M191 100h6M100 191v6M3 100h6"/>
    <g transform={`translate(${marker.x} ${marker.y})`}><path class="target" d="M0-8 8 0 0 8-8 0Z"/><path fill="#609cff" d="m0-3 3 3-3 3-3-3Z"/></g>
    <path class="player" transform={`translate(100 100) rotate(${stageHeading(facing)})`} d="M0-9 6 6 0 3-6 6Z"/>
   </svg>
   <span class="distance">{distance}<small> m</small></span>
  </div>
  <button class="pause" aria-label="暫停關卡" onclick={onPause} onkeydown={pauseKey}><kbd><InputHint label="Esc" gameplay/></kbd> 暫停</button>
 </aside>
 {#if notice}<div class="transmission" role="status" transition:messageFade><span class="message-emblem">{@render crest()}</span><div class="message-copy"><small>路線紀錄 <span>ROUTE ARCHIVE</span></small><strong>{displayedNotice}</strong></div></div>{/if}
 <section class="vitals" aria-label={`${statusLabel} ${statusValue} / ${statusMax}`}>
  <svg class="vitals-frame" viewBox="0 0 435 100" preserveAspectRatio="none" aria-hidden="true">
   <defs><linearGradient id={`${uid}-vitals`} x1="0" x2="1"><stop stop-color="#142940" stop-opacity=".8"/><stop offset=".8" stop-color="#112a4d" stop-opacity=".55"/><stop offset="1" stop-color="#17355b" stop-opacity=".25"/></linearGradient></defs>
   <path d="M45 23H435L412 77H45L15 50Z" fill={`url(#${uid}-vitals)`}/>
   <path d="M65 23H435L412 77H65" fill="none" stroke="#bfdcff" stroke-opacity=".35" stroke-width=".65"/>
   <path d="M422 29 404 71" fill="none" stroke="#87baff" stroke-opacity=".35" stroke-width=".65"/>
  </svg>
  <div class="avatar"><div class="avatar-crop"><img src="/portraits/knight_idle_still.webp" alt="悠太翼頭像" draggable="false"/></div></div><div class="status-body"><div class="status-caption"><span>悠太翼 <small>{statusLabel}</small></span><span>{statusValue} / {statusMax}</span></div>
   <div class="meter" role="meter" aria-label={statusLabel} aria-valuemin="0" aria-valuemax={statusMax} aria-valuenow={statusValue}><i style:width={`${ratio}%`}></i></div>
   <div class="status-foot" aria-hidden="true"><span class="status-rule"></span></div>
  </div>
 </section>
 <div class="actions" aria-label="關卡操作提示"><div class="ability"><span class="ability-icon">{@render symbol('sword')}</span><kbd><InputHint label="J" gameplay/></kbd><small>揮劍 / 空中盾衝</small></div><div class="ability"><span class="ability-icon">{@render symbol('jump')}</span><kbd><InputHint label="SPACE" gameplay/></kbd><small>跳躍 / 二段跳</small></div></div>
</div>
<style>
 .stage-hud{position:fixed;inset:0;pointer-events:none;color:#f1f4fc;font:400 14px/1.5 var(--font-body);text-shadow:0 1px 3px #051225a0;--u:clamp(.72px,.05981vw,1.15px);--edge:calc(56 * var(--u));background:radial-gradient(ellipse at 0 0,#0b1c354a,transparent 40%);animation:hud-in .4s ease both;font-synthesis:none}
 .mission{position:absolute;left:var(--edge);top:calc(126 * var(--u));width:calc(440 * var(--u));z-index:1}.identity-layer{position:absolute;inset:0;z-index:1}.chapter-heading{display:flex;align-items:center;gap:calc(17 * var(--u));margin-bottom:calc(22 * var(--u))}.chapter-rule{height:1px;flex:1;background:linear-gradient(90deg,#e5ecf780,transparent)}.chapter{font:600 calc(13 * var(--u))/1 'Rondo Chapter Serif',serif;letter-spacing:calc(6 * var(--u));display:flex;align-items:baseline;gap:calc(10 * var(--u));color:#e3e9f5}.chapter b{font-size:calc(21 * var(--u));font-weight:600;letter-spacing:calc(2 * var(--u));color:#fff}
 h1{font:600 calc(22 * var(--u))/1.4 'Rondo Chapter Serif',serif;letter-spacing:calc(1.5 * var(--u));margin:0;white-space:nowrap}

 .objective{display:flex;gap:calc(15 * var(--u));align-items:center;padding-bottom:calc(8 * var(--u));border-bottom:1px solid #d7e5ff24}.objective strong{font:700 calc(21 * var(--u))/1.4 var(--font-body);letter-spacing:calc(1.2 * var(--u))}.objective-diamond{width:calc(30 * var(--u));height:calc(30 * var(--u));flex-shrink:0;filter:drop-shadow(0 0 7px #367aff80)}.objective-diamond svg{display:block;width:100%;height:100%}
 .detail{font-weight:700;font-size:calc(15 * var(--u));line-height:1.65;margin:calc(7 * var(--u)) 0 0;display:flex;gap:calc(19 * var(--u));letter-spacing:calc(.7 * var(--u));color:#e1e7f3}.detail>span{flex:none;width:calc(25 * var(--u));display:grid;place-items:center}.detail svg{width:calc(10 * var(--u));height:calc(18 * var(--u))}
 .readouts{display:grid;gap:calc(14 * var(--u));margin-top:calc(23 * var(--u))}.readout{display:flex;gap:calc(16 * var(--u));align-items:center;font:700 calc(21 * var(--u))/1.3 Arial,sans-serif;letter-spacing:calc(1.7 * var(--u));font-variant-numeric:tabular-nums}.readout svg{width:calc(24 * var(--u));height:calc(24 * var(--u));stroke-width:1.25}.readout small{font:700 calc(10 * var(--u))/1 var(--font-body);letter-spacing:calc(1.4 * var(--u));color:#d0dcedbd;margin-left:calc(-7 * var(--u))}
 .navigation{position:absolute;right:calc(38 * var(--u));top:calc(42 * var(--u));width:calc(218 * var(--u));text-align:center;z-index:1}
 .radar{position:relative;margin-top:calc(13 * var(--u))}.radar>svg{display:block;width:100%;overflow:visible}.axis{position:absolute;top:calc(-11 * var(--u));left:0;right:0;font:calc(9 * var(--u)) Arial,sans-serif;letter-spacing:2px}.radar-base{fill:#0a142c70;stroke:#e7edf9;stroke-width:.65}.rim{fill:none;stroke:#c5ddff;stroke-width:.3;opacity:.45}.ticks{stroke:#e1ebff;stroke-width:.7}.platform{fill:#a4bada09;stroke:#bed2ef33;stroke-width:.4}.route{fill:none;stroke:#8dc3ff;stroke-width:.7}.route-glow{fill:none;stroke:#478df9;stroke-width:4;opacity:.18}.target{fill:#f0f6ff;filter:drop-shadow(0 0 5px #508cff)}.player{fill:white;stroke:#86baff;stroke-width:.7;filter:drop-shadow(0 0 4px #387aff)}.distance{position:absolute;bottom:16%;left:0;right:0;font:calc(11 * var(--u)) Arial,sans-serif;letter-spacing:.5px}.distance small{font-size:calc(9 * var(--u));opacity:.7}.pause{pointer-events:auto;border:0;background:transparent;color:#e6edf6;font:calc(10 * var(--u)) var(--font-body);letter-spacing:1px;margin-top:calc(6 * var(--u));padding:8px;cursor:pointer;text-shadow:inherit;opacity:.65}.pause:focus-visible{outline:1px solid #aecaff;outline-offset:3px}.pause:hover{opacity:1}
 .transmission{position:absolute;z-index:1;left:50%;top:calc(47 * var(--u));transform:translateX(-50%);width:calc(490 * var(--u));min-height:calc(89 * var(--u));display:flex;gap:calc(21 * var(--u));align-items:center;box-sizing:border-box;background:linear-gradient(90deg,#11284a00,#102440a3 18%,#10244088 76%,#16305200)}.message-emblem{width:calc(72 * var(--u));height:calc(72 * var(--u));display:grid;place-items:center;position:relative;flex-shrink:0;color:#e8f4ff;filter:drop-shadow(0 0 7px #417df755)}.message-emblem:before,.message-emblem:after{content:'';position:absolute;inset:12%;transform:rotate(45deg);border:1px solid #abcfff70;background:#225cab0f}.message-emblem:after{inset:4%;border-color:#abcfff22}.message-emblem svg{width:64%;height:64%;z-index:1}.message-copy{flex:1;padding:calc(9 * var(--u)) calc(30 * var(--u)) calc(9 * var(--u)) 0}.transmission small{font:400 calc(16 * var(--u))/1.4 var(--font-body);letter-spacing:calc(2 * var(--u));display:flex;align-items:center;justify-content:space-between;padding-bottom:calc(5 * var(--u));border-bottom:1px solid #c8dbff44}.transmission small span{color:#c0d1ec88;font:calc(7 * var(--u)) Arial,sans-serif;letter-spacing:calc(2 * var(--u))}.transmission strong{display:block;margin-top:calc(7 * var(--u));font-size:calc(15 * var(--u));font-weight:400;letter-spacing:calc(.8 * var(--u))}
 .vitals{position:absolute;z-index:1;top:calc(12 * var(--u));left:calc(32 * var(--u));display:flex;align-items:center;gap:calc(10 * var(--u));width:calc(435 * var(--u));height:calc(100 * var(--u));box-sizing:border-box}.vitals-frame{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}.avatar{position:relative;width:calc(90 * var(--u));height:calc(100 * var(--u));flex-shrink:0;filter:drop-shadow(0 2px 6px #07162c80)}.avatar:before,.avatar:after{content:'';position:absolute;inset:16% 12%;transform:rotate(45deg);border:1px solid #c1d9f9aa}.avatar:after{inset:10% 6%;border-color:#a6c6f344}.avatar-crop{position:absolute;inset:0;overflow:hidden;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);background:linear-gradient(145deg,#304c78,#111e33)}.avatar img{position:absolute;width:300%;max-width:none;height:auto;left:-100%;top:-16%;user-select:none}.status-body{flex:1;min-width:0;position:relative;padding:calc(6 * var(--u)) calc(12 * var(--u)) calc(5 * var(--u)) 0}.status-caption{display:flex;justify-content:space-between;font:700 calc(14 * var(--u))/1.3 Arial,var(--font-body);letter-spacing:calc(1 * var(--u));gap:8px;font-variant-numeric:tabular-nums}.status-caption small{font-size:calc(10 * var(--u));opacity:.8;margin-left:calc(8 * var(--u))}.meter{height:calc(8 * var(--u));background:#9baac04a;margin:calc(5 * var(--u)) 0;transform:skewX(-28deg);overflow:hidden}.meter i{display:block;height:100%;background:linear-gradient(90deg,#5598fc,#c6e5ff 83%,#f9fcff);transition:width .22s}.status-foot{display:flex;align-items:center;gap:calc(9 * var(--u));font:700 calc(10 * var(--u))/1 Arial,var(--font-body);letter-spacing:calc(1 * var(--u));color:#d4def5a0}.status-rule{height:1px;background:linear-gradient(90deg,#4e9af9b0,#a6ddf388);flex:1;position:relative}.status-rule:after{content:'';position:absolute;width:3px;height:3px;right:0;top:-1px;transform:rotate(45deg);background:#e3f1ff}
 .actions{position:absolute;z-index:1;right:calc(167 * var(--u));bottom:calc(40 * var(--u));display:flex;gap:calc(42 * var(--u));align-items:end}.ability{display:grid;justify-items:center;gap:calc(10 * var(--u));position:relative}.ability-icon{position:relative;display:grid;place-items:center;width:calc(58 * var(--u));height:calc(58 * var(--u))}.ability-icon:before,.ability-icon:after{content:'';position:absolute;inset:12%;border:1px solid #d2e4ff57;transform:rotate(45deg);background:radial-gradient(#13274855,transparent)}.ability-icon:after{inset:0;border-color:#cbdfff18;background:none}.ability-icon svg{width:calc(37 * var(--u));height:calc(37 * var(--u));filter:drop-shadow(0 1px 4px #152d5099);z-index:1}.ability small{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}kbd{font:400 calc(12 * var(--u))/1.2 Arial,sans-serif;background:#eff3fc;color:#2a3d5d;text-shadow:none;border-radius:2px;padding:calc(2 * var(--u)) calc(4 * var(--u));letter-spacing:0}.pause kbd{font-size:calc(10 * var(--u));background:#dfe9f333;border:1px solid #e8f0ff55;color:#e8efff}
 @keyframes hud-in{from{opacity:0}to{opacity:1}}
 @media(max-width:900px){.mission{width:43vw}.transmission{top:calc(430 * var(--u));left:var(--edge);transform:none;width:calc(390 * var(--u))}.navigation{right:20px}.actions{right:35px}.transmission small span{display:none}}
 @media(max-width:520px){.stage-hud{--edge:18px}.mission{width:62vw;top:94px}.chapter-heading{gap:10px;margin-bottom:16px;flex-wrap:wrap}.chapter-rule{display:none}.chapter{letter-spacing:2px}.chapter b{font-size:13px}.navigation{width:100px;right:13px;top:18px}.chapter{font-size:9px}h1{font-size:15px;letter-spacing:1px}.objective strong{font-size:14px}.detail{font-weight:700;font-size:11px;gap:9px}.readout{font-size:16px}.transmission{top:335px;width:285px}.vitals{left:12px;top:9px;width:235px;height:70px;gap:7px}.avatar{width:58px;height:66px}.status-caption{font-size:10px}.status-caption small{display:none}.status-foot{font-size:8px}.actions{right:18px;bottom:76px;gap:16px}.ability-icon{width:34px;height:34px}.ability-icon svg{width:25px;height:25px}.ability{gap:6px}}
 @media(max-height:500px){.mission{top:76px}.readouts{display:flex;gap:16px;margin-top:13px}.readout small{display:none}.transmission{top:18px;left:50%;transform:translateX(-50%);width:290px}.vitals{top:16px}.actions{bottom:23px}.navigation{width:110px;top:16px}}
 @media(prefers-reduced-motion:reduce){.stage-hud{animation:none}.meter i{transition:none}}
</style>
