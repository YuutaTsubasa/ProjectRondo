<script lang="ts">
 import {duckMusic} from '../audio/musicDucking';
 import {readStageBest,stageTime} from '../../app/stageRecords';
 import {COURSE_RANK_TIMES,PALACE_RANK_TIMES} from '../../domain/course/stageScore';
 import {navigateUi} from '../input/uiNavigation';
 import {tick} from 'svelte';
 import {regionModal} from './regionModal';
 import {createExitMotion} from '../motion/exitMotion.svelte';
 import SettingsScreen from '../settings/SettingsScreen.svelte';
 import InputHint from '../input/InputHint.svelte';
 import {COURSE_GATES} from '../../domain/course/courseLayout';
 import {COURSE_GUARD_SPAWNS} from '../../domain/course/courseCombat';
 import {PALACE_LAYOUT} from '../../domain/palace/palaceLayout';
 import type {RegionExpeditionId} from '../../domain/region/regionProgress';
 let {expedition,completed=false,onStart,onClose,onMap}:{expedition:RegionExpeditionId;completed?:boolean;onStart:()=>void;onClose:()=>void;onMap:()=>void}=$props();
 let settings=$state(false),dialog:HTMLDivElement;
 const exit=createExitMotion(280);
 const course=$derived(expedition==='course');
 const best=$derived(readStageBest(expedition));
 const recommended=$derived(course?COURSE_RANK_TIMES[0]:PALACE_RANK_TIMES[0]);
 const title=$derived(course?'白宮天廊':'白宮引水道');
 const objectives=$derived(course?['穿越白石露臺與懸空拱橋','啟動沿途紀錄點','抵達白塔中繼台']:['穿越宮殿維修水道','突破騎士守衛的封鎖','抵達末端閘門']);
 const guardCount=$derived(course?COURSE_GUARD_SPAWNS.length:PALACE_LAYOUT.guards.length);
 const checkpointCount=$derived(course?COURSE_GATES.length-1:PALACE_LAYOUT.checkpoints.length);
 async function closeSettings(){settings=false;await tick();dialog.querySelector<HTMLButtonElement>('[aria-label="系統設定"]')?.focus();}
 function keys(e:KeyboardEvent){
  if(settings||e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
  if(exit.leaving){e.preventDefault();return;}
  const direction=({ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'} as const)[e.key as 'ArrowUp'];
  if(direction){e.preventDefault();navigateUi(direction);return;}
  if(e.key==='Escape'){e.preventDefault();if(!e.repeat)exit.run(onClose);}
 }
</script>
<svelte:window onkeydown={keys}/>
{#if settings}<SettingsScreen onClose={closeSettings} chapterTitle={title} chapterNumber="01" subtitle="白色王城"/>{/if}
<div use:duckMusic class="expedition-intro" class:leaving={exit.leaving} class:covered={settings} inert={settings} role="dialog" aria-modal="true" aria-label="關卡介紹" aria-labelledby="region-dialog-title" aria-busy={exit.leaving} tabindex="-1" bind:this={dialog} use:regionModal>
 <div class="veil" aria-hidden="true"></div>
 <div class="shell">
  <aside class="rail">
   <nav aria-label="關卡介紹導覽">
    <div class="selected" aria-current="page"><span class="nav-icon">✥</span><span>任務情報<small>MISSION</small></span><b>›</b></div>
    <button aria-label="查看關卡地圖" onclick={()=>exit.run(onMap)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/></svg><span>地圖<small>MAP</small></span></button>
    <button aria-label="系統設定" onclick={()=>{if(!exit.leaving)settings=true;}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 1-2h4l1 2 3 2 3 1v4l-2 2 2 2v4l-3 1-3 2-1 2h-4l-1-2-3-2-3-1v-4l2-2-2-2V6l3-1Z"/><circle cx="12" cy="12" r="4"/></svg><span>系統<small>SYSTEM</small></span></button>
   </nav>
   <div class="rail-note" aria-hidden="true"><span>＋</span><p>TOWARD<br/>A BRIGHTER<br/>TOMORROW.</p><i></i></div>
  </aside>
  <main class="sheet">
   <div class="copy">
    <p class="chapter">CHAPTER <strong>01</strong></p>
    <header><span aria-hidden="true">✦</span><h1 id="region-dialog-title">{title}</h1><i></i></header>
    <p class="english">{course?'THE WHITE PALACE SKYWAY':'THE PALACE AQUEDUCT'}</p>
    <p class="description">{course?'白塔的回聲，正從高處呼喚。':'停下的潮聲，在石壁之間等待。'}<br/>{course?'沿王宮高塔間的白石天廊前進，跨越斷開的拱橋與水晶路線，重新接通草原與港口的中繼台。':'沿狹窄的宮殿維修水道前進，穿過騎士守衛的封鎖，讓王城與港口之間的水流再次相連。'}</p>
    <div class="mode"><span>{course?'3D ACTION':'SIDE-SCROLLING'}</span><p>{course?'跑跳 · 二段跳 · 揮劍 · 空中盾衝':'橫向跑跳 · 二段跳 · 揮劍 · 盾衝'}</p></div>
   </div>
   <figure class="preview"><img src={course?'/stages/palace-skyway.webp':'/stages/palace-aqueduct.webp'} alt={title+'實際關卡場景'}/><figcaption><span>WHITE PALACE</span><b>{completed?'已完成 · 可再次挑戰':'遠征路線已開啟'}</b></figcaption></figure>
   <section class="objectives"><h2><span aria-hidden="true">✧</span>任務目標<small>OBJECTIVES</small></h2><ol>{#each objectives as objective,i}<li class:primary={i===0}><span aria-hidden="true">{i===0?'◆':'✦'}</span>{objective}</li>{/each}</ol></section>
   <section class="details" aria-label="關卡情報">
    <div class="timing"><span class="detail-icon" aria-hidden="true">◷</span><h2>建議時間<small>BEST / TARGET</small></h2><strong><span aria-label="最佳紀錄">{stageTime(best)}</span><em>/</em><span aria-label="建議時間">{stageTime(recommended)}</span></strong></div>
    <div><span class="detail-icon" aria-hidden="true">◇</span><h2>紀錄點<small>CHECKPOINTS</small></h2><strong>{checkpointCount}<small>處</small></strong></div>
    <div><span class="detail-icon" aria-hidden="true">♜</span><h2>騎士守衛<small>GUARDS</small></h2><strong>{guardCount}<small>名</small></strong></div>
    {#if !course}<div><span class="detail-icon" aria-hidden="true">◈</span><h2>金幣<small>COINS</small></h2><strong>{PALACE_LAYOUT.coins.length}<small>枚</small></strong></div>{/if}
    <p class="return-note">建議時間依 S 評級門檻設定。<br/>完成後返回{course?'白塔廣場':'白潮原野'}，繼續悠太翼的旅程。</p>
   </section>
   <div class="actions"><button class="later" aria-label="稍後再來" onclick={()=>exit.run(onClose)}>稍後再來 <span>BACK</span></button><button class="start" data-game-entry aria-label="開始遠征" onclick={()=>exit.run(onStart)}>開始遠征 <span>START EXPEDITION</span><b aria-hidden="true">→</b></button></div>
  </main>
 </div>
 <footer><span><kbd><InputHint label="Esc"/></kbd> 關閉</span><span><kbd><InputHint label="Enter"/></kbd> 確定</span></footer>
</div>
<style>
 .expedition-intro{position:fixed;inset:0;z-index:16;isolation:isolate;overflow:clip;display:flex;flex-direction:column;box-sizing:border-box;padding:54px 0;outline:none;color:var(--c-blue-deep);font-family:var(--font-body);animation:reveal .32s ease-out both}.covered{visibility:hidden}.veil{position:fixed;inset:0;z-index:-1;background:linear-gradient(90deg,#091a36a8,#0a204a24 50%,#09172f8c);backdrop-filter:var(--surface-blur)}
 .shell{position:relative;display:grid;grid-template-columns:21% 1fr;margin:auto 4.5cqw;flex-shrink:0;min-height:61cqh;border-block:1px solid #d7e8ff66}.rail{position:relative;color:#dce7fa;background:linear-gradient(90deg,#0b1a3299,#0b1a3222);border-left:1px solid #c7ddff99;padding:5px 0;display:flex;flex-direction:column;justify-content:space-between}nav{display:grid;gap:4px}nav button,nav .selected{height:clamp(55px,7.5cqh,82px);display:flex;align-items:center;gap:22px;padding:0 9%;text-align:left;font:500 clamp(15px,1.25cqw,22px) var(--font-body);letter-spacing:.18em;border:0;background:transparent;color:inherit;position:relative}nav button{cursor:pointer;margin-right:8%;border-bottom:1px solid #c9dcff30}nav small{display:block;font:500 9px var(--font-body);letter-spacing:.23em;margin-top:4px}nav .selected{color:#102850;background:linear-gradient(105deg,#d6e8ff,#f5f8ff 47%,#95baff);clip-path:polygon(0 0,100% 0,93% 100%,0 100%);border-left:3px solid #79adff;margin-right:1%}nav b{margin-left:auto;font-weight:400;color:#4274d6}nav svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.6;flex:none}.nav-icon{font-size:32px;line-height:1}nav button:hover{color:white;background:#6a93ce22}button:focus-visible{outline:2px solid #4c8aff;outline-offset:-4px}.rail-note{padding:45px 10% 24px;display:flex;align-items:flex-end;gap:14px}.rail-note>span{align-self:flex-start;font-size:22px}.rail-note p{font-size:9px;letter-spacing:.2em;line-height:1.8;margin:0}.rail-note i{height:1px;background:#9bb5d46b;flex:1;margin-bottom:7px}
 .sheet{position:relative;display:grid;grid-template-columns:1fr 1.12fr;grid-template-rows:auto 1fr auto;gap:18px 4%;padding:24px 5% 20px 9%;isolation:isolate}.sheet:before{content:'';position:absolute;inset:0 -1cqw 0 -4cqw;background:linear-gradient(118deg,#f5f8fff5,#edf4fff0 54%,#e6efffeb);clip-path:polygon(8% 0,100% 0,94% 100%,0 100%);z-index:-1}.sheet:after{content:'';position:absolute;inset:0 -1cqw;clip-path:polygon(94% 0,97% 0,83% 100%,80% 100%);background:#92baff20;pointer-events:none;z-index:-1}.chapter{line-height:1.2;font-size:11px;letter-spacing:.34em;margin:0 0 9px;font-weight:600}.chapter strong{font-size:24px;letter-spacing:.15em}header{display:flex;align-items:center;gap:14px;white-space:nowrap}header>span{font-size:38px;line-height:1}h1{font:600 clamp(27px,2.6cqw,46px)/1.3 'Rondo Chapter Serif',serif;letter-spacing:.13em;margin:0}header i{height:1px;background:#29447370;flex:1;min-width:15px}.english{font-size:8px;letter-spacing:.22em;margin:7px 0 12px 4px;color:#63789c}.description{font-size:clamp(12px,.95cqw,16px);font-weight:500;line-height:1.85;letter-spacing:.08em;color:#526682;margin:0;max-width:33em}.mode{margin-top:12px;font-size:9px;line-height:1.5}.mode>span{font-size:9px;letter-spacing:.25em;font-weight:700;color:#3b66a4}.mode p{font-size:11px;color:#687d99;letter-spacing:.05em;margin:7px 0 0}
 .preview{margin:0;align-self:start;position:relative;aspect-ratio:1.85;overflow:hidden;clip-path:polygon(7% 0,100% 0,93% 100%,0 100%);background:#7298c4;border-block:2px solid #dbeaff;box-shadow:0 0 20px #5e91dd30}.preview img{display:block;width:100%;height:100%;object-fit:cover}.preview:after{content:'';position:absolute;inset:0;border:1px solid #ffffff80;pointer-events:none}.preview figcaption{position:absolute;bottom:0;inset-inline:0;display:flex;justify-content:space-between;gap:12px;padding:18px 10% 12px;background:linear-gradient(transparent,#10264fcc);color:white}.preview span{font-size:8px;letter-spacing:.18em}.preview b{font-size:10px;letter-spacing:.07em;font-weight:500}
 h2{line-height:1.3;font-size:14px;font-weight:600;letter-spacing:.17em;margin:0}h2 small{display:block;font:600 8px var(--font-body);letter-spacing:.17em;color:#8393ae;margin-top:4px}.objectives{border-top:1px solid #7b96bc4d;padding-top:18px}.objectives h2{position:relative;padding-left:30px}.objectives h2>span{position:absolute;left:0;top:-3px;font-size:30px}ol{list-style:none;padding:0;margin:12px 0 0}li{font-size:clamp(12px,1cqw,16px);letter-spacing:.08em;color:#647795;margin:10px 0;display:flex;gap:15px;align-items:center}li>span{font-size:20px;color:#90a9cd}li.primary,li.primary>span{color:#326aff}
 .details{border-left:1px solid #9baec855;padding-left:7%;align-self:start}.details>div{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #9baec840}.detail-icon{font-size:25px;line-height:1}.details strong{line-height:1.2;margin-left:auto;font-size:25px;font-weight:500;white-space:nowrap}.timing strong{font-size:clamp(13px,1.3cqw,20px);font-variant-numeric:tabular-nums}.timing strong>span:first-child{color:#326aff}.timing em{font-style:normal;padding:0 8px;color:#92a4bf}.details strong small{font-size:11px;margin-left:10px;color:#8090aa}.return-note{font-size:11px;line-height:1.8;letter-spacing:.06em;color:#657895;margin:12px 0 0}.actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:15px;border-top:1px solid #9aafd13d;padding-top:15px}.actions button{cursor:pointer;border:0;font:600 15px var(--font-body);letter-spacing:.12em;padding:10px 25px;text-align:left}.actions span{display:block;font:500 8px var(--font-body);letter-spacing:.18em;margin-top:3px}.later{color:#496383;background:transparent}.start{position:relative;min-width:220px;color:white;background:linear-gradient(110deg,#3267ed,#5aaaff);clip-path:polygon(0 0,94% 0,100% 50%,94% 100%,0 100%)}.start b{position:absolute;right:25px;top:12px;font-size:24px;font-weight:400}.start:hover{filter:brightness(1.12)}footer{position:absolute;bottom:3cqh;right:5%;display:flex;gap:32px;color:#eaf2ff;font-size:12px;letter-spacing:.13em}kbd{background:var(--c-pale);color:#1b3051;font:600 11px var(--font-body);padding:2px 5px;border-radius:2px;margin-right:6px}
 .shell{animation:sheet-in .36s cubic-bezier(.2,.7,.3,1) both}.leaving{pointer-events:none;animation:conceal .28s ease-in both}.leaving .shell{animation:sheet-out .28s ease-in both}@keyframes reveal{from{opacity:0}to{opacity:1}}@keyframes conceal{to{opacity:0}}@keyframes sheet-in{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}@keyframes sheet-out{to{opacity:0;transform:translateX(24px)}}
 @container game-ui (min-width:1600px){.sheet{gap:32px 5%;padding-block:34px}.description{line-height:2}h2{font-size:18px}.details>div{padding-block:13px}.mode p,.return-note{font-size:13px}.chapter{font-size:14px}.english{font-size:10px}.preview b{font-size:13px}}
 @container game-ui (max-height:760px) and (min-width:621px){.shell{min-height:0}.sheet{gap:12px 4%;padding-block:20px}.description{font-size:12px}.preview{max-height:195px}.objectives{padding-top:12px}.actions{padding-top:10px}li{margin:8px 0}.details>div{padding:8px 0}}
 @container game-ui (max-width:900px){.shell{margin:auto 3cqw;grid-template-columns:20% 1fr}.sheet{padding:23px 5% 20px 7%;gap:20px 5%}nav button,nav .selected{gap:10px;padding-inline:10%;font-size:14px}nav small{font-size:8px}nav svg{width:20px}.nav-icon{font-size:26px}.rail-note{padding-inline:8%;gap:5px}.rail-note p{font-size:7px}h1{font-size:27px}header>span{font-size:27px}header{gap:9px}.description{font-size:12px}.preview{aspect-ratio:1.35}.preview figcaption{display:block}.preview span{display:none}.chapter{font-size:10px}.chapter strong{font-size:20px}.details{padding-left:6%}.detail-icon{display:none}.actions button{font-size:13px}.start{min-width:190px}}
 @container game-ui (max-width:620px){.shell{display:block;margin:auto 4cqw}.rail{border:0;background:none}.rail nav{display:flex;gap:0}.rail nav>*{flex:1;margin:0;height:54px;padding:0 10px;gap:9px}.rail-note{display:none}.sheet{padding:25px 20px;grid-template-columns:1fr;gap:22px;background:#eef4fff2}.sheet:before,.sheet:after{display:none}.preview{aspect-ratio:1.85}.copy{grid-row:1}.preview{grid-row:2}.description{max-width:none}.objectives{grid-row:3}.details{border-left:0;padding:0;border-top:1px solid #9baec855}.actions{gap:8px;justify-content:space-between}.actions button{padding-inline:12px}.start{min-width:190px}footer{position:relative;bottom:auto;right:auto;justify-content:flex-end;margin:24px 4cqw 0}h1{font-size:34px}.mode{margin-top:15px}}
 @media(prefers-reduced-motion:reduce){.expedition-intro,.shell,.leaving,.leaving .shell{animation:none}}
</style>
