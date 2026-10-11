<script module lang="ts">
 export interface PauseAction { label:string; english:string; run:()=>void; }
</script>
<script lang="ts">
 import {duckMusic} from '../audio/musicDucking';
 import InputHint from '../input/InputHint.svelte';
 import {onMount,tick} from 'svelte';
 import SettingsScreen from '../settings/SettingsScreen.svelte';
 let settingsOpen=$state(false);
 async function closeSettings(){settingsOpen=false;await tick();dialog.querySelector<HTMLButtonElement>('[aria-label="系統設定"]')?.focus({preventScroll:true});}
 import {createExitMotion} from '../motion/exitMotion.svelte';
 const exit=createExitMotion(320);
 import HudWaves from '../hud/HudWaves.svelte';
 let {onResume,resumeLabel='繼續遊戲',actions,chapterLabel='CHAPTER',chapterNumber='01',chapterTitle,subtitle='',location,objective,detail='',elapsed,tip}: {
  onResume:()=>void;resumeLabel?:string;actions:readonly PauseAction[];chapterLabel?:string;chapterNumber?:string;
  chapterTitle:string;subtitle?:string;location:string;objective:string;detail?:string;elapsed?:string;tip:string;
 }=$props();
 let dialog:HTMLDivElement;
 const titleId=$props.id();
 onMount(()=>{const id=setTimeout(()=>dialog.querySelector<HTMLButtonElement>('nav button')?.focus({preventScroll:true}),0);return()=>clearTimeout(id);});
 function keys(event:KeyboardEvent){
  if(settingsOpen||event.defaultPrevented)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!event.repeat)exit.run(onResume);return;}
  if(exit.leaving){event.preventDefault();event.stopPropagation();return;}
  if(!['Tab','ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const buttons=[...dialog.querySelectorAll<HTMLButtonElement>('button')];
  const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  const backwards=event.key==='ArrowUp'||event.key==='Tab'&&event.shiftKey;
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(backwards?-1:1)+buttons.length)%buttons.length;
  event.preventDefault();event.stopPropagation();buttons[next]?.focus({preventScroll:true});
 }
</script>
{#if settingsOpen}<SettingsScreen onClose={closeSettings} {chapterTitle} {chapterNumber} {subtitle}/>{/if}
<div use:duckMusic class="pause-screen" class:settings-open={settingsOpen} inert={settingsOpen} class:leaving={exit.leaving} aria-busy={exit.leaving} role="dialog" aria-modal="true" aria-label="暫停選單" aria-labelledby={titleId} tabindex="-1" bind:this={dialog} onkeydown={keys}>
 <div class="veil" aria-hidden="true"></div>
 <div class="frame" aria-hidden="true"><i></i><i></i><span>✦</span></div>
 <div class="brand" aria-hidden="true"><img src="/title/project-rondo-logo-v2.png" alt=""/><small>BEYOND THE FAMILIAR SKY.</small></div>
 <div class="layout">
  <section class="menu-column">
   <header><svg viewBox="0 0 80 80" aria-hidden="true"><path d="m40 2 6 27 12-11-8 16 28 6-28 6 8 16-12-11-6 27-6-27-12 11 8-16L2 40l28-6-8-16 12 11Z"/><path d="m40 29 11 11-11 11-11-11Z"/></svg><div><h1 id={titleId}>PAUSE</h1><p>暫停中<span></span></p></div></header>
   <nav aria-label="暫停操作">
    {#each [{label:resumeLabel,english:'CONTINUE',run:onResume},{label:'系統設定',english:'SETTINGS',run:()=>settingsOpen=true},...actions] as action}
     <button aria-label={action.label} onclick={()=>{if(action.english==='SETTINGS'){if(!exit.leaving)action.run();}else exit.run(action.run);}} onpointermove={event=>{if(!exit.leaving&&document.activeElement!==event.currentTarget)event.currentTarget.focus({preventScroll:true});}}>
      <span class="selection" aria-hidden="true"><svg viewBox="0 0 60 60"><path class="outer" d="M30 2 58 30 30 58 2 30Z"/><path class="inner" d="M30 10 50 30 30 50 10 30Z"/><path class="core" d="m30 23 7 7-7 7-7-7Z"/></svg></span>
      <span class="action-label">{action.label}<small>{action.english}</small></span>
     </button>
    {/each}
   </nav>
  </section>
  <aside>
   <div class="chapter"><p>{chapterLabel}<b>{chapterNumber}</b><span aria-hidden="true">／</span></p><h2>{chapterTitle}</h2>{#if subtitle}<small>— {subtitle}</small>{/if}</div>
   <dl>
    {#if elapsed}<div><dt><span aria-hidden="true">◷</span>RUN TIME</dt><dd>{elapsed}</dd></div>{/if}
    <div><dt><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21S4 13 4 9a8 8 0 0 1 16 0c0 4-8 12-8 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>LOCATION</dt><dd>{location}</dd></div>
    <div class="objective"><dt><span aria-hidden="true">◇</span>CURRENT OBJECTIVE</dt><dd>{objective}{#if detail}<p>{detail}</p>{/if}</dd></div>
   </dl>
   <div class="tips"><span>✧ &nbsp; TIPS</span><p>{tip}</p></div>
  </aside>
 </div>
 <div class="waves"><HudWaves edges={false}/></div>
 <footer><span><kbd><InputHint label="Esc"/></kbd> 返回</span><span><kbd><InputHint label="↑ ↓"/></kbd> 選擇</span><span><kbd><InputHint label="Enter"/></kbd> 確定</span></footer>
</div>
<style>
 .pause-screen{position:fixed;inset:0;z-index:20;isolation:isolate;overflow:clip;overscroll-behavior:none;pointer-events:auto;color:var(--avg-text);font-family:var(--font-body);outline:none;animation:pause-in .25s ease-out both}
 .veil{position:fixed;inset:0;z-index:-2;background:linear-gradient(90deg,rgba(var(--avg-navy-rgb),.93),rgba(var(--avg-navy-rgb),.44) 39%,rgba(var(--avg-navy-rgb),.3) 60%,rgba(var(--avg-navy-rgb),.83));backdrop-filter:blur(3px)}
 .frame{position:fixed;inset:0 1.8%;pointer-events:none;z-index:-1}.frame i{position:absolute;top:0;bottom:0;width:1px;background:linear-gradient(transparent,rgba(var(--c-blue-soft-rgb),.6) 20%,rgba(var(--c-blue-soft-rgb),.2) 70%,transparent)}.frame i:first-child{left:0}.frame i:nth-child(2){right:0}.frame>span{position:absolute;left:-5px;top:20%;font-size:12px;color:var(--avg-light)}
 .brand{position:absolute;left:2.8%;top:2.8%;width:150px}.brand img{display:block;width:100%;filter:brightness(0) invert(1)}.brand small{display:block;font:8px var(--font-body);letter-spacing:.22em;margin-top:7px;white-space:nowrap}
 .layout{position:relative;display:flex;justify-content:space-between;gap:40px;box-sizing:border-box;height:100%;padding:15cqh 5cqw 120px 4cqw}
 .menu-column{width:min(520px,47cqw);padding-top:3cqh}header{display:flex;gap:25px;align-items:center;margin-bottom:42px;padding-left:7px}header>svg{width:74px;height:74px;flex:none;fill:var(--avg-light);stroke:var(--avg-text);stroke-width:.8;filter:drop-shadow(0 0 9px var(--avg-glow))}h1{font:400 clamp(29px,2.8cqw,48px)/1.2 Georgia,serif;letter-spacing:.24em;margin:0 0 9px}header p{display:flex;align-items:center;gap:12px;font-size:12px;letter-spacing:.24em;margin:0;color:var(--avg-muted)}header p span{height:1px;width:140px;background:linear-gradient(90deg,var(--avg-muted),transparent)}
 nav{display:grid;gap:13px}button{position:relative;display:flex;align-items:center;gap:26px;width:100%;min-height:70px;padding:4px 25px 4px 8px;box-sizing:border-box;text-align:left;border:0;background:transparent;color:var(--avg-muted);cursor:pointer;outline:none;font:400 18px/1.5 var(--font-body);letter-spacing:.12em;isolation:isolate}
 button:before{content:'';position:absolute;inset:0;z-index:-1;opacity:0;border-block:1px solid rgba(var(--c-blue-soft-rgb),.7);background:linear-gradient(90deg,rgba(var(--c-blue-soft-rgb),.19),rgba(var(--avg-navy-rgb),.16),transparent);mask-image:linear-gradient(90deg,black 55%,transparent);transition:opacity .16s}
 .selection{flex:none;width:60px;height:60px;display:grid;place-items:center}.selection svg{width:54px;height:54px;fill:none;stroke:var(--avg-muted);stroke-width:1}.outer{opacity:0}.inner{stroke-width:1.5}.core{fill:var(--avg-muted);stroke:none}.action-label small{display:block;font:400 9px/1.5 var(--font-body);letter-spacing:.22em;margin-top:3px}
 button:focus{color:var(--avg-text)}button:focus:before{opacity:1}button:focus .selection{filter:drop-shadow(0 0 8px var(--avg-glow))}button:focus svg{stroke:var(--avg-light)}button:focus .outer{opacity:.8;fill:rgba(var(--c-blue-soft-rgb),.15)}button:focus .inner{fill:var(--avg-glow);stroke:var(--avg-text);stroke-width:2}button:focus .core{fill:var(--avg-text)}button:focus-visible .action-label{text-decoration:underline;text-decoration-color:var(--avg-light);text-underline-offset:6px}
 aside{width:min(310px,26cqw);display:flex;flex-direction:column;align-self:stretch;margin-top:-12cqh;min-width:220px}.chapter{text-align:right;margin-bottom:50px}.chapter>p{display:flex;align-items:center;justify-content:flex-end;gap:12px;font-size:11px;letter-spacing:.27em;margin:0 0 4px;color:var(--avg-muted)}.chapter b{font:400 36px/1.2 Georgia,serif;color:var(--avg-text);letter-spacing:.08em}.chapter>p span{font-size:27px;opacity:.5}.chapter h2{font:400 20px/1.7 var(--font-body);letter-spacing:.14em;margin:0}.chapter>small{font-size:11px;color:var(--avg-muted);letter-spacing:.1em}
 dl{margin:0 0 25px;padding-left:40px}dl>div{margin-bottom:27px}dt{display:flex;align-items:center;gap:11px;font:400 9px/1.4 var(--font-body);letter-spacing:.25em;color:var(--avg-muted)}dt>span{font-size:22px;width:19px;line-height:1}dt svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.6}dd{border-left:1px solid var(--avg-muted);padding-left:15px;margin:10px 0 0 9px;font-size:14px;line-height:1.8;letter-spacing:.04em;font-variant-numeric:tabular-nums}.objective dt>span{color:var(--avg-light);text-shadow:0 0 8px var(--avg-glow)}.objective dd{border-color:var(--avg-light);box-shadow:-3px 0 8px -5px var(--avg-glow)}dd p{font-size:12px;margin:5px 0 0;color:var(--avg-muted)}
 .tips{margin-top:auto;border:1px solid rgba(var(--c-blue-soft-rgb),.65);padding:14px 20px;background:linear-gradient(115deg,rgba(var(--avg-navy-rgb),.76),rgba(var(--c-blue-soft-rgb),.1));box-shadow:inset 0 0 16px rgba(var(--c-blue-soft-rgb),.08)}.tips>span{font-size:12px;letter-spacing:.18em}.tips p{font-size:12px;line-height:1.85;margin:8px 0 0;color:var(--avg-text)}
 .waves{position:fixed;inset:0;z-index:-1;pointer-events:none}footer{position:absolute;right:4cqw;bottom:6cqh;display:flex;gap:30px;font-size:12px;letter-spacing:.1em}kbd{background:var(--avg-text);color:rgb(var(--avg-navy-rgb));padding:1px 4px;border-radius:2px;font:700 10px var(--font-body);margin-right:7px}
 .pause-screen.leaving{animation:pause-out .32s ease-in both;pointer-events:none}
 .leaving .menu-column{animation:menu-out .32s ease-in both}.leaving aside{animation:info-out .32s ease-in both}
 @keyframes pause-out{to{opacity:0}}@keyframes menu-out{to{transform:translateX(-22px)}}@keyframes info-out{to{transform:translateX(22px)}}
 @keyframes pause-in{from{opacity:0}to{opacity:1}}
 @media(prefers-reduced-motion:reduce){.pause-screen{animation:none}button:before{transition:none}}
 @media(forced-colors:active){button:focus{outline:2px solid Highlight}.veil{background:Canvas}button:before{display:none}}
.pause-screen.settings-open{opacity:0;animation:none;pointer-events:none}
</style>
