<script lang="ts">
 import type {StageScore} from '../../domain/course/stageScore';
 import {onMount} from 'svelte';
 import MenuPortrait from '../menu/MenuPortrait.svelte';
 import {createExitMotion} from '../motion/exitMotion.svelte';
 let {number,title,subtitle,description,stats,checks,score,optionalLabel='收集／戰鬥',onRestart,onExit,exitLabel='返回主選單'}:{
  number:string;title:string;subtitle:string;description:string;
  stats:{label:string;english:string;value:string;icon:string}[];
  checks:{label:string;complete:boolean}[];score?:StageScore;optionalLabel?:string;
  onRestart:()=>void;onExit:()=>void;exitLabel?:string;
 }=$props();
 const motion=createExitMotion(320);
 let dialog:HTMLDivElement;
 let ambientPaused=$state(false);
 let returnFirst=$derived(exitLabel!=='返回主選單');
 onMount(()=>{
  const visibility=()=>{ambientPaused=document.hidden;};visibility();document.addEventListener('visibilitychange',visibility);
  const timer=setTimeout(()=>dialog.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true}),0);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
 });
 function keys(e:KeyboardEvent){
  if(motion.leaving){e.preventDefault();e.stopPropagation();return;}
  if(e.key==='Tab'||e.key==='ArrowLeft'||e.key==='ArrowRight'){
   const buttons=[...dialog.querySelectorAll<HTMLButtonElement>('button')];const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
   e.preventDefault();e.stopPropagation();buttons[(current+(e.shiftKey||e.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length]?.focus();
  }
  // Keep Space/Enter inside the result controls, never in the suspended game.
  if(e.key===' '||e.key==='Enter'||e.key==='Escape')e.stopPropagation();
 }
</script>
{#snippet emblem()}
 <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
  <path d="M50 1 57 34 50 44 43 34ZM99 50 66 57 56 50 66 43ZM50 99 43 66 50 56 57 66ZM1 50 34 43 44 50 34 57Z" fill="currentColor"/>
  <path d="m17 17 23 15-8 8Zm66 0L68 40l-8-8Zm0 66L60 68l8-8Zm-66 0 15-23 8 8Z" fill="currentColor"/>
  <path d="m50 33 17 17-17 17-17-17Z" stroke="currentColor" stroke-width="1.4"/><path d="m50 43 7 7-7 7-7-7Z" fill="currentColor"/>
 </svg>
{/snippet}
{#snippet icon(kind:string)}
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
 {#if kind==='time'}<circle cx="12" cy="13" r="8"/><path d="M9 2h6m-3 0v3m0 4v5l3 2M18 5l2 2"/>
 {:else if kind==='coin'}<ellipse cx="12" cy="12" rx="8" ry="9"/><path d="m12 6 4 6-4 6-4-6Z"/>
 {:else if kind==='guard'}<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Zm0 4v11M8 10h8"/>
 {:else if kind==='retry'}<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/>
 {:else}<path d="m12 2 10 10-10 10L2 12Zm0 6 4 4-4 4-4-4Z"/>{/if}
 </svg>
{/snippet}
{#snippet retryButton()}
 <button class="retry" onclick={()=>motion.run(onRestart)}><span aria-hidden="true">↻</span><span>重新挑戰<small>RETRY</small></span></button>
{/snippet}
{#snippet continueButton()}
 <button class="continue" onclick={()=>motion.run(onExit)}><span aria-hidden="true">→</span><span>繼續<small>{exitLabel}</small></span></button>
{/snippet}
<div class="stage-results" class:motion-paused={ambientPaused} class:leaving={motion.leaving} role="dialog" aria-modal="true" aria-label="過關結算" tabindex="-1" bind:this={dialog} onkeydown={keys}>
 <div class="scene-tint" aria-hidden="true"></div>
 <div class="hero" aria-hidden="true"><MenuPortrait active={!motion.leaving}/></div>
 <div class="paper" aria-hidden="true"></div><div class="paper-cuts" aria-hidden="true"></div>
 <div class="result-content" inert={motion.leaving}>
  <img class="logo" src="/title/project-rondo-logo-v2.png" alt="PROJECT RONDO" draggable="false"/>
  <section class="chapter"><div class="eyebrow">TRIAL <b>{number}</b></div><h2>{title}</h2><p class="subtitle">{subtitle}</p><p class="description">{description}</p><div class="chapter-star">{@render emblem()}</div></section>
  <header class="clear-title"><h1><span class="sr-only">STAGE CLEAR</span><img src="/title/stage-clear-wordmark.svg" alt="" draggable="false"/></h1><div class="clear-caption"><span></span>任務完成<span></span></div><p>TOWARD A BRIGHTER TOMORROW.</p></header>
  <dl class="stats">{#each stats as stat,i}<div class="stat" style:--row={i}>
   <dt>{@render icon(stat.icon)}<span>{stat.label}<small>{stat.english}</small></span></dt><dd>{stat.value}</dd>
  </div>{/each}</dl>
  <section class="record" aria-label="通關紀錄">
   <div class="seal"><span class="seal-label">{score?'RANK':'COMPLETE'}</span>{#if score}<div class="rank-letter" aria-label={`評級 ${score.rank}`}>{score.rank}</div><strong class="score-value">{score.total.toLocaleString()}<small>TOTAL SCORE</small></strong>{:else}<div class="seal-art">{@render emblem()}</div><strong>旅程的下一步</strong>{/if}<div class="seal-star">{@render emblem()}</div></div>
   <ul>{#each checks as check}<li class:achieved={check.complete} data-complete={check.complete}><span class="check-icon" aria-hidden="true">{#if check.complete}{@render emblem()}{:else}<svg viewBox="0 0 24 24" fill="none"><path d="m12 3 9 9-9 9-9-9Z" stroke="currentColor"/></svg>{/if}</span><span>{check.label}<small>{check.complete?'達成':'未達成'}</small></span></li>{/each}</ul>
  </section>
  <div class="journey-note">{#if score}<h3>成績明細 <small>SCORE BREAKDOWN</small></h3><div class="score-breakdown"><span>通關<b>300</b></span><span>時間<b>+{score.time}</b></span><span>{optionalLabel}<b>+{score.coins+score.enemies}</b></span><span>紀錄點<b>+{score.checkpoints}</b></span><span>失誤扣分<b>−{score.penalty}</b></span></div>{:else}<span></span><p>這段路，已留下你的足跡。<br/>下一段旅程，仍在風的另一端。</p>{/if}</div>
  <nav aria-label="關卡操作">{#if returnFirst}{@render continueButton()}{@render retryButton()}{:else}{@render retryButton()}{@render continueButton()}{/if}</nav>
  <div class="footer-mark" aria-hidden="true"><span>＋</span>PROJECT RONDO<br/>A WORLD BEYOND THE KNOWN.</div>
  <p class="sky-note" aria-hidden="true">SOMEWHERE<br/>BEYOND.<br/>A WORLD WE HAVE<br/>YET TO KNOW.<span></span></p>
 </div>
</div>
<style>
 .stage-results{position:fixed;inset:0;z-index:15;overflow:hidden;pointer-events:auto;isolation:isolate;color:#102348;font-family:var(--font-body);font-weight:700;--serif:'Rondo Chapter Serif',Georgia,serif;--u:clamp(.7px,.05981cqw,1.2px);animation:result-in .55s ease both;outline:none}
 .rank-letter{font:400 calc(210 * var(--u))/.95 Georgia,serif;letter-spacing:-.08em;padding-right:.08em;margin:calc(12 * var(--u)) 0;color:transparent;background:linear-gradient(115deg,transparent 40%,#72baff60 46%,#edfaff 50%,#8ac8ff80 54%,transparent 60%),linear-gradient(140deg,#081a39 35%,#254a82 48%,#80b8ff 52%,#0b2249 64%);background-size:300% 100%,100% 100%;background-repeat:no-repeat;animation:rank-glint 5.8s 1.2s ease-in-out infinite;background-clip:text;-webkit-background-clip:text;filter:drop-shadow(0 5px 10px #91b8ff55)}.seal strong.score-value{font:700 calc(22 * var(--u)) Arial,sans-serif}.score-value small{display:block;font:700 calc(7 * var(--u)) Arial,sans-serif;letter-spacing:2px;margin-top:8px;color:#7d91ac}.seal-star{position:absolute;width:calc(36 * var(--u));height:calc(36 * var(--u));bottom:calc(-18 * var(--u));left:calc(50% - 18 * var(--u))}.seal-star svg{width:100%}.journey-note h3{font:600 calc(17 * var(--u)) var(--serif);letter-spacing:3px;margin:0 0 20px}.journey-note h3 small{margin-top:5px;font-size:7px;letter-spacing:2px}.score-breakdown{display:flex;gap:calc(21 * var(--u));border-top:1px solid #6783ad44;padding-top:15px}.score-breakdown span{font-size:calc(12 * var(--u));color:#637a9b;white-space:nowrap}.score-breakdown b{display:block;font:700 calc(24 * var(--u)) Arial,sans-serif;margin-top:10px;color:#18355b}
 .scene-tint{position:absolute;inset:0;background:linear-gradient(110deg,#eaf4ffc0,#b3d3fb26 60%,#10244218);backdrop-filter:saturate(.7)}
 .hero{position:absolute;left:62%;width:42%;height:102%;top:5%;animation:hero-in 1.1s .15s both;mask-image:linear-gradient(#000 80%,transparent)}
 .paper{position:absolute;inset:0;background:linear-gradient(110deg,#f9fbff 10%,#f1f6fff5 40%,#edf5ffed 56%,#f5f9ffc2 68%,#f3f8ff00 79%);clip-path:polygon(0 0,77% 0,55% 100%,0 100%);animation:paper-in .65s cubic-bezier(.16,1,.3,1) both}
 .paper-cuts{position:absolute;inset:0;background:linear-gradient(120deg,#fafcffeb,#e7f0ff70);clip-path:polygon(31% 0,33% 0,22% 38%,39% 0,45% 0,17% 100%,14% 100%,30% 45%);opacity:.85}
 .result-content{position:absolute;inset:0}.logo{position:absolute;left:3.4%;top:2.2%;width:calc(185 * var(--u));height:auto}.chapter{position:absolute;left:4.3%;top:16%;width:25%;padding-left:0}.chapter:before{content:'';position:absolute;left:calc(-33 * var(--u));top:0;bottom:calc(-300 * var(--u));width:1px;background:linear-gradient(#23467477,#56729730,transparent)}.eyebrow{font:700 calc(14 * var(--u)) Arial,sans-serif;letter-spacing:calc(7 * var(--u))}.eyebrow b{font-size:calc(29 * var(--u));font-weight:700;letter-spacing:calc(3 * var(--u));margin-left:calc(9 * var(--u))}h2{font:600 calc(34 * var(--u))/1.5 var(--serif);letter-spacing:calc(3 * var(--u));margin:calc(3 * var(--u)) 0 calc(10 * var(--u))}.subtitle{font-size:calc(15 * var(--u));letter-spacing:calc(2 * var(--u));margin:0}.description{font:700 calc(14 * var(--u))/1.9 var(--font-body);letter-spacing:calc(1 * var(--u));color:#6d7b94;margin:calc(17 * var(--u)) 0 0;max-width:90%}.description:before{content:'';display:block;width:calc(33 * var(--u));height:1px;background:#6783ad;margin-bottom:calc(8 * var(--u))}.chapter-star{position:absolute;left:calc(-59 * var(--u));top:calc(38 * var(--u));width:calc(52 * var(--u));height:calc(52 * var(--u));color:#7d96b9}.chapter-star svg{width:100%;height:100%}
 .clear-title{position:absolute;left:26%;top:16%;width:37%;text-align:center;animation:title-in .75s .15s both}h1{margin:0;line-height:0}h1 img{display:block;width:108%;height:auto;max-width:none;margin-left:-4%;filter:drop-shadow(0 1px 0 #fff9)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.clear-caption{display:flex;justify-content:center;align-items:center;gap:calc(16 * var(--u));font:600 calc(19 * var(--u)) var(--serif);letter-spacing:calc(8 * var(--u));margin-top:calc(18 * var(--u))}.clear-caption span{width:calc(40 * var(--u));height:1px;background:#2f568266}.clear-title p{font:700 calc(7 * var(--u)) Arial,sans-serif;letter-spacing:calc(1.8 * var(--u));color:#6d82a5;margin:calc(11 * var(--u)) 0 0}
 .stats{position:absolute;left:4.3%;top:37%;width:25%;margin:0}.stat{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:calc(9 * var(--u)) 0;border-bottom:1px solid #5679a522;animation:stat-in .45s calc(.28s + var(--row)*.07s) both}.stat dt{display:flex;align-items:center;gap:calc(15 * var(--u));font:700 calc(15 * var(--u))/1.5 var(--font-body);letter-spacing:calc(1.5 * var(--u))}.stat svg{width:calc(29 * var(--u));height:calc(29 * var(--u))}.stat small{display:block;font:700 calc(9 * var(--u)) Arial,sans-serif;letter-spacing:calc(2 * var(--u));color:#7786a4;margin-top:3px}.stat dd{margin:0;font:700 calc(27 * var(--u)) Arial,sans-serif;letter-spacing:calc(1 * var(--u));font-variant-numeric:tabular-nums;white-space:nowrap}
 .record{position:absolute;top:38%;left:34%;right:34%;display:flex;align-items:center;gap:calc(28 * var(--u));animation:stat-in .6s .45s both}.seal{position:relative;width:43%;flex-shrink:0;text-align:center;padding:calc(15 * var(--u)) calc(10 * var(--u)) calc(20 * var(--u));box-sizing:border-box;background:linear-gradient(135deg,#fcfeff60,#cddffc1a);border-block:1px solid #6b8eb733}.seal:before,.seal:after{content:'';position:absolute;inset:0;border-inline:1px solid #345c9e80;clip-path:polygon(0 0,8% 0,8% 8%,92% 8%,92% 0,100% 0,100% 100%,92% 100%,92% 92%,8% 92%,8% 100%,0 100%)}.seal:after{inset:7px;opacity:.2}.seal-label{font:700 calc(12 * var(--u)) Arial,sans-serif;letter-spacing:calc(4 * var(--u))}.seal-art{width:80%;margin:calc(18 * var(--u)) auto;color:#294a78;filter:drop-shadow(0 5px 8px #729cfb35)}.seal-art svg{width:100%;display:block}.seal strong{display:block;font:600 calc(17 * var(--u)) var(--serif);letter-spacing:calc(1 * var(--u))}
 ul{margin:0;padding:0;list-style:none;display:grid;gap:calc(23 * var(--u))}li{display:flex;align-items:center;gap:calc(11 * var(--u));font-size:calc(16 * var(--u));letter-spacing:calc(.7 * var(--u));color:#8998b1}li.achieved{color:#1c375e}.check-icon{width:calc(24 * var(--u));height:calc(24 * var(--u));flex:none}.check-icon svg{width:100%;height:100%}li small{display:block;font-size:calc(9 * var(--u));letter-spacing:calc(2 * var(--u));color:#8799b2;margin-top:4px}
 .journey-note{position:absolute;left:4.3%;bottom:14%;width:39%;animation:stat-in .6s .6s both}.journey-note>span{display:block;width:calc(45 * var(--u));height:1px;background:#5075a288;margin-bottom:calc(16 * var(--u))}.journey-note p{font:600 calc(18 * var(--u))/1.9 var(--serif);letter-spacing:calc(2 * var(--u));margin:0;color:#536789}.journey-note small{font:calc(8 * var(--u)) Arial,sans-serif;letter-spacing:calc(3 * var(--u));color:#899bb5;display:block;margin-top:calc(15 * var(--u))}
 nav{position:absolute;right:8%;bottom:10.5%;display:flex;gap:calc(21 * var(--u));animation:stat-in .5s .65s both}button{position:relative;display:flex;align-items:center;justify-content:center;gap:calc(25 * var(--u));min-width:calc(194 * var(--u));padding:calc(13 * var(--u)) calc(23 * var(--u));border:1px solid #90add580;background:#f6f9fff0;color:#152e54;font:600 calc(18 * var(--u))/1.25 var(--serif);letter-spacing:calc(3 * var(--u));cursor:pointer;box-shadow:0 4px 16px #11295020;transition:filter .18s,transform .18s}.retry{order:1}.continue{order:2;isolation:isolate;color:white;border:0;background:transparent;padding-right:calc(32 * var(--u));box-shadow:none}.continue:before,.continue:after{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;clip-path:polygon(0 0,calc(100% - 13px) 0,100% 50%,calc(100% - 13px) 100%,0 100%)}.continue:before{background:#acdaff;filter:drop-shadow(0 3px 8px #11295030)}.continue:after{inset:1px;background:linear-gradient(110deg,transparent 70%,#d5edff25 70%,#d5edff25 78%,transparent 78%),linear-gradient(110deg,#265dfb,#4787ff 76%,#91ceff)}.continue>span{position:relative;white-space:nowrap}button>span:first-child{font:calc(27 * var(--u)) Arial,sans-serif}button small{display:block;font:700 calc(8 * var(--u))/1.4 Arial,var(--font-body);letter-spacing:calc(2 * var(--u));margin-top:calc(5 * var(--u))}button:hover{filter:brightness(1.1);transform:translateY(-2px)}button:focus-visible{outline:2px solid #3676ff;outline-offset:5px}.continue:focus-visible{outline:none;filter:brightness(1.12);box-shadow:none}.continue:focus-visible:before{background:#fff}.continue:focus-visible:after{inset:3px}
 .footer-mark{position:absolute;left:2.4%;bottom:3.5%;font:calc(8 * var(--u))/1.7 Arial,sans-serif;letter-spacing:calc(1.5 * var(--u));color:#6e7d99}.footer-mark>span{font:calc(26 * var(--u)) Georgia,serif;display:block;margin-bottom:calc(10 * var(--u))}.sky-note{position:absolute;right:2.4%;top:2%;text-align:center;color:#fff;font:calc(8 * var(--u))/1.8 Arial,sans-serif;letter-spacing:calc(2 * var(--u));text-shadow:0 1px 4px #142c55}.sky-note span{display:block;width:30px;height:1px;background:#f0f6ff80;margin:12px auto}
 .clear-title h1{position:relative}
 .clear-title h1:after{content:'';position:absolute;top:0;bottom:0;left:-4%;width:108%;pointer-events:none;background:linear-gradient(115deg,transparent 40%,#559dff55 46%,#e9faff 50%,#89caff80 54%,transparent 60%) 180% 0/300% 100% no-repeat;mask:url('/title/stage-clear-wordmark.svg') center/100% 100% no-repeat;animation:clear-glint 6.4s .9s ease-in-out infinite}
 @keyframes clear-glint{0%,12%{background-position:180% 0;opacity:0}18%{opacity:1}55%{opacity:1}64%,100%{background-position:-80% 0;opacity:0}}
 @keyframes rank-glint{0%,12%{background-position:180% 0,0 0}64%,100%{background-position:-80% 0,0 0}}
 .motion-paused .clear-title h1:after,.motion-paused .rank-letter,.leaving .clear-title h1:after,.leaving .rank-letter{animation-play-state:paused}
 .leaving{animation:result-out .32s ease both}.leaving .hero{animation:none;opacity:.6}
 @keyframes result-in{from{opacity:0}to{opacity:1}}@keyframes paper-in{from{transform:translateX(-12%);opacity:0}to{transform:none;opacity:1}}@keyframes title-in{from{opacity:0;transform:translateY(12px);letter-spacing:.025em}to{opacity:1;transform:none}}@keyframes hero-in{from{opacity:0;transform:translateX(25px)}to{opacity:1;transform:none}}@keyframes stat-in{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}@keyframes result-out{to{opacity:0;transform:translateY(-8px)}}
 @container game-ui (max-width:1050px){.clear-title{left:30%;width:40%}.record{left:35%;right:26%;gap:16px}.chapter{width:27%}h2{font-size:calc(29 * var(--u))}.stats{width:28%}.journey-note{bottom:13%}nav{right:5%;bottom:7%}.hero{left:65%;width:43%}}
 @container game-ui (max-width:700px){.stage-results{overflow-y:auto;background:#eaf2fd}.result-content{position:relative;min-height:850px;padding:25px 24px 120px;box-sizing:border-box;display:flex;flex-direction:column;gap:25px}.paper{position:fixed;clip-path:none;background:linear-gradient(115deg,#f9fbff,#eff6ffd9 65%,#e7f0ff99)}.hero{position:fixed;left:40%;top:0;width:75%;height:100cqh;opacity:.3;animation:none}.paper-cuts{position:fixed}.scene-tint{position:fixed}.logo{position:relative;left:auto;top:auto;width:130px}.chapter{position:relative;left:auto;top:auto;width:auto;padding-left:12px}.chapter:before{left:0;bottom:0}.chapter-star{display:none}.chapter h2{font-size:27px}.description{font-size:12px;margin-top:10px}.clear-title{position:relative;left:auto;top:auto;width:auto;order:0}.clear-title h1 img{width:100%;margin-left:0}.clear-title h1:after{width:100%;left:0}.clear-caption{font-size:15px}.stats{position:relative;left:auto;top:auto;width:auto}.stat{padding:12px 0}.stat dt{font-size:13px}.stat dd{font-size:23px}.stat small{font-size:7px}.record{position:relative;left:auto;top:auto;right:auto;gap:22px}.seal{width:42%;padding:14px}.seal strong{font-size:13px}.rank-letter{font-size:130px}.score-breakdown{gap:12px;flex-wrap:wrap}.score-breakdown span{font-size:10px}li{font-size:12px}li small{font-size:9px}.journey-note{position:relative;left:auto;bottom:auto;width:auto}.journey-note p{font-size:14px}.footer-mark,.sky-note{display:none}nav{position:relative;right:auto;bottom:auto;gap:10px;justify-content:stretch}button{min-width:0;flex:1;padding:12px 8px;font-size:15px;gap:12px}button small{font-size:8px}.continue{padding-right:14px}}
 @container game-ui (max-height:620px) and (min-width:701px){.chapter{top:15%}.description{font-size:11px;margin-top:8px}.clear-title{top:15%}.stats{top:42%}.stat{padding:9px 0}.record{top:38%}.seal-art{width:60%;margin:8px auto}.journey-note{bottom:7%;left:35%;width:29%}.journey-note p{font-size:12px}.journey-note small{display:none}.journey-note>span{margin-bottom:7px}nav{bottom:5%;right:4%;flex-direction:column;gap:7px}button{padding:8px 15px}.sky-note{display:none}}
 @media(prefers-reduced-motion:reduce){.clear-title h1:after{display:none}.rank-letter{animation:none;background-position:180% 0,0 0}.stage-results,.hero,.paper,.clear-title,.stat,.record,.journey-note,nav{animation:none!important}button{transition:none}}
</style>
