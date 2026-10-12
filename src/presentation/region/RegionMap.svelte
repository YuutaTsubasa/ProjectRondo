<script lang="ts">
 import {readStageBest} from '../../app/stageRecords';
 import {isStageId} from '../../domain/stage/stageIds';
 import {readCityJourney} from '../../domain/region/cityJourney';
 import {regionStorage} from '../../app/regionSave';
 import InputHint from '../input/InputHint.svelte';
 import {REGION_PLACES,type RegionPlaceId,type RegionPlace} from '../../domain/region/regionLayout';
 import type {RegionProgress} from '../../domain/region/regionProgress';
 import {canEnterRegionExpedition} from '../../domain/region/regionProgress';
 import {regionObjective,type RegionPoint} from '../../domain/region/regionObjectives';
 import {regionModal} from './regionModal';
 import RegionAtlas from './RegionAtlas.svelte';
 import HudWaves from '../hud/HudWaves.svelte';
 import {createExitMotion} from '../motion/exitMotion.svelte';
 import atlas from '../../content/regionAtlas.json';
 let {progress,position,initialPlace=null,objectiveOverride,onClose,onTrack}:{objectiveOverride?:{title:string;detail:string;placeId:string|null};progress:RegionProgress;position:RegionPoint;initialPlace?:RegionPlaceId|null;onClose:()=>void;onTrack:(id:RegionPlaceId)=>void}=$props();
 let selectedId=$state<RegionPlaceId|null>(null),previewFailed=$state(false);
 let view:RegionAtlas;
 const exit=createExitMotion(320),titleId=$props.id();
 const objective=$derived(objectiveOverride??regionObjective(progress.chapter));
 const selected=$derived(REGION_PLACES.find(p=>p.id===(selectedId??initialPlace??objective.placeId??'homecoming'))!);
 const distance=$derived(Math.round(Math.hypot(selected.x-position.x,selected.z-position.z)));
 const order:RegionPlaceId[]=['homecoming','palace','signal','course',...REGION_PLACES.filter(p=>p.id.startsWith('course-')||p.id.startsWith('palace-')||p.id.startsWith('city-')).map(p=>p.id),'ridge','cove','watch'];
 const names:Partial<Record<RegionPlaceId,string>>={homecoming:'WHITE TOWER SQUARE',palace:'PALACE AQUEDUCT',signal:'MEADOW SIGNAL',course:'PALACE SKYWAY',ridge:'WESTWIND RIDGE',cove:'TIDAL COVE',watch:'SOUTHERN WATCH'};
 const cityDone=readCityJourney(regionStorage());
 const done=(id:string)=>progress.discoveries.includes(id)||cityDone.includes(id)||(isStageId(id)&&readStageBest(id)!==null)||((id==='course'||id==='palace')&&progress.completedExpeditions.includes(id));
 const recordTotal=REGION_PLACES.filter(p=>p.kind!=='story').length;
 const expeditionTotal=REGION_PLACES.filter(p=>p.kind==='expedition').length;
 const expeditionsDone=$derived(REGION_PLACES.filter(p=>p.kind==='expedition'&&done(p.id)).length);
 const records=$derived(REGION_PLACES.filter(p=>p.kind!=='story'&&done(p.id)).length);
 function status(place:RegionPlace){
  if(place.kind==='vista')return done(place.id)?'已記錄的風景':'尚未記錄';
  if(place.id==='course'||place.id==='palace')return canEnterRegionExpedition(progress,place.id)?(done(place.id)?'已完成 · 可再次挑戰':place.id==='course'?'3D 遠征 · 已開放':'2D 遠征 · 已開放'):'隨旅程開放';
  if(place.kind==='expedition')return '自由試煉 · 已開放';
  return '回聲管 · 劇情';
 }
 function choose(id:RegionPlaceId,focus=false){if(exit.leaving)return;selectedId=id;if(focus)view?.focusPlace(id);}
 function close(){exit.run(onClose);}
 function track(){const id=selected.id;exit.run(()=>onTrack(id));}
 function key(e:KeyboardEvent){
  if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey)return;
  const k=e.key.toLowerCase();if(!['escape','m','t','r','+','=','-','0'].includes(k))return;
  e.preventDefault();e.stopPropagation();if(e.repeat||exit.leaving)return;
  if(k==='escape'||k==='m')close();else if(k==='t')view.currentPosition();else if(k==='r')view.toggleMarkers();else if(k==='0')view.overview();else view.changeZoom(k==='-'?-.25:.25);
 }
 function listKey(e:KeyboardEvent){if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;const buttons=[...(e.currentTarget as HTMLElement).closest('nav')!.querySelectorAll<HTMLButtonElement>('button')];const i=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;e.preventDefault();e.stopPropagation();buttons[next]?.focus();}
</script>
<div class="map-screen" class:leaving={exit.leaving} aria-busy={exit.leaving} role="dialog" aria-modal="true" aria-labelledby={titleId} tabindex="-1" use:regionModal onkeydown={key}>
 <RegionAtlas bind:this={view} {position} selectedId={selected.id} objectiveId={objective.placeId} visited={done} onSelect={choose}/>
 <div class="veil" aria-hidden="true"></div><div class="frame" aria-hidden="true"></div>
 <div class="brand" aria-hidden="true"><img src="/title/project-rondo-logo-v2.png" alt=""/><small>BEYOND THE FAMILIAR SKY.</small></div>
 <aside class="navigation">
  <header><svg viewBox="0 0 80 80" aria-hidden="true"><path d="m40 2 6 27 12-11-8 16 28 6-28 6 8 16-12-11-6 27-6-27-12 11 8-16L2 40l28-6-8-16 12 11Z"/><path d="m40 29 11 11-11 11-11-11Z"/></svg><div><h1 id={titleId}>MAP</h1><p>地圖<span></span></p></div></header>
  <button class="region-name" onclick={()=>view.overview()}><span class="region-star" aria-hidden="true">✧</span><span>白潮原野<small>WHITE-TIDE FIELDS</small></span><span aria-hidden="true">›</span></button>
  <nav aria-label="地點導覽" data-input-scroll>
   {#each order as id}{@const place=REGION_PLACES.find(p=>p.id===id)!}
    <button onkeydown={listKey} data-place={id} class:selected={selected.id===id} aria-pressed={selected.id===id} onclick={()=>choose(id,true)}>
     <svg viewBox="0 0 40 40" aria-hidden="true"><path class="diamond" d="M20 3 37 20 20 37 3 20Z"/>{#if place.kind==='expedition'}<path d="M13 28V16q7-10 14 0v12M10 28h20"/>{:else if place.kind==='vista'}<path d="m9 27 8-15 6 10 5-8 6 13Z"/>{:else}<path d="m20 10 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>{/if}</svg>
     <span>{place.name}<small>{names[id]??'WHITE PALACE'}</small></span>{#if done(id)}<span class="visited" aria-label="已完成">✓</span>{/if}
    </button>
   {/each}
  </nav>
 </aside>
 <section class="chapter" aria-label="目前章節"><p>CHAPTER <b>01</b><span aria-hidden="true">／</span></p><h2>白潮原野</h2><small>— {objective.title}</small></section>
 <aside class="information" data-input-scroll>
  {#key selected.id}<section class="location-detail" data-location-detail aria-live="polite">
   <div class="detail-heading"><div><h2>{selected.name}</h2><small>{names[selected.id]??'WHITE PALACE'}</small></div><span aria-hidden="true">⌖</span></div>
   {#if !previewFailed}<svg class="location-photo" viewBox={`${selected.x-37} ${-selected.z-20} 74 40`} role="img" aria-label={`${selected.name}俯拍預覽`}><image href={`${atlas.image}?v=${atlas.sha256.slice(0,12)}`} x={atlas.bounds.minX} y={-atlas.bounds.maxZ} width={atlas.bounds.maxX-atlas.bounds.minX} height={atlas.bounds.maxZ-atlas.bounds.minZ} onerror={()=>previewFailed=true}/><path d={`m${selected.x} ${-selected.z-3} 3 3-3 3-3-3Z`}/></svg>{/if}
   <p class="description">{selected.description}</p>
   <h3><span aria-hidden="true">▸</span> 地點資訊</h3>
   <dl><div><dt>類型</dt><dd>{selected.kind==='vista'?'風景紀錄':selected.kind==='expedition'?'遠征入口':'劇情地點'}</dd></div><div><dt>狀態</dt><dd>{status(selected)}</dd></div><div><dt>距離</dt><dd>{distance} m</dd></div></dl>
   {#if objective.placeId===selected.id}<p class="objective-note"><span aria-hidden="true">◇</span>{objective.detail}</p>{/if}
   <button class="track" onclick={track} aria-label={`追蹤${selected.name}`}><span aria-hidden="true">◇</span>追蹤目的地<span aria-hidden="true">›</span></button>
  </section>{/key}
  <section class="records" aria-label="探索紀錄"><div class="record-heading"><h3>探索紀錄</h3><span>{Math.round(records/recordTotal*100)}<small>%</small></span></div><div class="progress" role="progressbar" aria-label="景點與遠征完成度" aria-valuenow={records} aria-valuemin={0} aria-valuemax={recordTotal}><span style:width={`${records/recordTotal*100}%`}></span></div><dl><div><dt>◇ 風景紀錄</dt><dd>{progress.discoveries.length} / 3</dd></div><div><dt>◇ 遠征完成</dt><dd>{expeditionsDone} / {expeditionTotal}</dd></div></dl><p>{progress.chapter==='complete'?'第一章旅途完成':'旅途進行中'} · 景點與遠征合計</p></section>
 </aside>
 <div class="waves"><HudWaves edges={false}/></div>
 <p class="motto" aria-hidden="true">STILL<br/>TOWARD<br/>A BRIGHTER<br/>TOMORROW.</p>
 <button class="close" onclick={close} aria-label="關閉區域地圖"><kbd><InputHint label="Esc"/></kbd> 返回</button>
</div>
<style>
 .map-screen{position:fixed;inset:0;z-index:20;isolation:isolate;overflow:clip;background:#172e49;color:var(--avg-text);font-family:var(--font-body);animation:map-in .32s ease-out both;outline:none}.veil{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,#0c1c37f5 0%,#112647e8 18%,#142f4e50 35%,transparent 53%,#17345445 65%,#10223fd9 81%,#0e203cf5),linear-gradient(180deg,#1c32583b,transparent 25%,transparent 70%,#10284e7a)}.frame{position:absolute;inset:0 1.7%;border-inline:1px solid #87c2ff35;pointer-events:none}.frame:before,.frame:after{content:'✦';position:absolute;left:-6px;color:var(--avg-light);font-size:12px}.frame:before{top:20%}.frame:after{bottom:23%}.brand{position:absolute;top:24px;left:2.8%;width:148px;pointer-events:none}.brand img{width:100%;filter:brightness(0) invert(1);display:block}.brand small{display:block;font-size:7px;letter-spacing:.22em;margin-top:8px;white-space:nowrap}
 button{font:inherit;color:inherit;cursor:pointer;background:transparent;border:0}button:focus-visible{outline:1px solid var(--avg-light);outline-offset:3px}button:hover{color:white}.navigation{position:absolute;left:2.8%;top:16%;bottom:115px;width:24%;max-width:340px;display:flex;flex-direction:column}header{display:flex;align-items:center;gap:20px;margin:0 0 27px}header>svg{width:65px;height:65px;fill:var(--avg-light);stroke:var(--avg-text);stroke-width:.7;filter:drop-shadow(0 0 8px var(--avg-glow));flex:none}h1{font:400 clamp(27px,2.8cqw,46px)/1.2 Georgia,serif;letter-spacing:.22em;margin:0}header p{display:flex;align-items:center;gap:14px;font-size:11px;letter-spacing:.3em;color:var(--avg-muted);margin:8px 0 0}header p span{width:120px;height:1px;background:linear-gradient(90deg,var(--avg-muted),transparent)}
 .region-name{display:flex;align-items:center;gap:18px;text-align:left;padding:9px 18px 9px 9px;border-block:1px solid #8abaff80;background:linear-gradient(90deg,#246ad555,#3b66a52b,transparent);font-size:16px;letter-spacing:.13em;margin-bottom:9px}.region-name>span:last-child{margin-left:auto;font-size:28px;color:#a9d7ff}.region-star{font-size:35px;line-height:1;color:#e3f6ff;filter:drop-shadow(0 0 7px #4b90ff)}small{display:block}.region-name small,nav small{font-size:8px;line-height:1.8;letter-spacing:.22em;color:var(--avg-muted);margin-top:4px}nav{display:grid;gap:3px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#75a9e755 transparent;padding:4px 4px 8px}nav button{display:flex;align-items:center;gap:20px;min-height:56px;text-align:left;font-size:15px;letter-spacing:.12em;padding:4px 10px 4px 6px;color:#b9cbe4;transition:background .16s,color .16s;border-left:1px solid transparent}nav svg{width:34px;height:34px;flex:none;stroke:currentColor;stroke-width:1.5;fill:none}.diamond{opacity:0;stroke-width:.7}nav button.selected{color:white;background:linear-gradient(90deg,#3066b355,transparent);border-color:#a6d1ff}nav button.selected .diamond{opacity:1}nav button.selected svg{filter:drop-shadow(0 0 5px #5095ff)}nav button:hover{background:linear-gradient(90deg,#3066b333,transparent)}.visited{margin-left:auto;color:#a3d9ff;font-size:12px}
 .chapter{position:absolute;right:3%;top:24px;text-align:right;pointer-events:none}.chapter p{display:flex;align-items:center;justify-content:flex-end;gap:13px;font-size:11px;letter-spacing:.29em;color:var(--avg-muted);margin:0}.chapter b{font:400 38px/1.2 Georgia,serif;color:var(--avg-text);letter-spacing:.09em}.chapter p>span{font-size:26px;opacity:.5}.chapter h2{font-size:21px;font-weight:400;letter-spacing:.17em;margin:4px 0}.chapter small{font-size:11px;letter-spacing:.1em;color:var(--avg-muted)}
 .information{position:absolute;right:2.8%;top:145px;bottom:65px;width:25%;max-width:335px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#75a9e755 transparent}.location-detail,.records{background:linear-gradient(115deg,#0c1b35ed,#132e53e8);border:1px solid #78b4ff55;box-shadow:inset 0 1px #a1caff44,0 6px 30px #04142b26;padding:17px 18px;box-sizing:border-box;position:relative}.location-detail{animation:detail-in .24s ease-out both}.location-detail:after{content:'✧';position:absolute;right:-5px;top:-11px;color:#bfe5ff;text-shadow:0 0 9px #529cff;font-size:20px}.detail-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px}.detail-heading h2{font-size:19px;font-weight:500;letter-spacing:.12em;margin:0}.detail-heading small{font-size:8px;letter-spacing:.2em;margin-top:6px;color:var(--avg-muted)}.detail-heading>span{font-size:28px;color:#b9dfff;filter:drop-shadow(0 0 6px #458aff)}.location-photo{display:block;width:100%;height:auto;aspect-ratio:1.85;border:1px solid #8aacda66;background:#233c56;box-sizing:border-box}.location-photo image{filter:grayscale(.25) brightness(.9)}.location-photo path{fill:#eef9ff;stroke:#5b9dff;stroke-width:1;filter:drop-shadow(0 0 2px #3b8cff)}.description{font-size:12px;line-height:1.9;letter-spacing:.07em;margin:11px 0 14px}h3{font-size:13px;font-weight:400;letter-spacing:.1em;margin:0}h3>span{color:#a4d3ff;text-shadow:0 0 7px #418dff;margin-right:8px}.location-detail h3{border-bottom:1px solid #7bb1e943;padding-bottom:9px}dl{margin:10px 0 0}dl>div{display:flex;gap:12px;justify-content:space-between;font-size:11px;line-height:1.8;letter-spacing:.04em;margin:5px 0}dt{color:var(--avg-muted);white-space:nowrap}dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}.objective-note{font-size:11px;line-height:1.75;padding:9px 0 0;margin:9px 0 0;border-top:1px solid #7bb1e930;color:#d7e7fb}.objective-note>span{color:#8ecbff;margin-right:8px}.track{display:flex;align-items:center;gap:9px;width:100%;padding:10px 11px;font-size:12px;letter-spacing:.11em;margin-top:14px;border:1px solid #85bfff99;background:linear-gradient(90deg,#2361b861,#18386655);text-align:left}.track>span:last-child{margin-left:auto;font-size:19px;line-height:1}.track:hover{background:#2d5d9566}.records{margin-top:10px;padding:12px 17px}.record-heading{display:flex;justify-content:space-between;align-items:center;gap:10px}.record-heading>span{font-size:16px;letter-spacing:.1em}.record-heading small{display:inline;font-size:12px}.progress{height:4px;background:#c4dcff29;margin:8px 0 10px}.progress>span{display:block;height:100%;background:linear-gradient(90deg,#427fff,#c4e7ff);box-shadow:0 0 6px #4b91ff}.records dl{margin:0}.records dd{font-size:13px;letter-spacing:.12em}.records p{font-size:9px;color:#a2bad7;letter-spacing:.05em;margin:9px 0 0}
 .waves{position:absolute;inset:0;pointer-events:none}.motto{position:absolute;bottom:24px;left:2.8%;font-size:8px;letter-spacing:.24em;line-height:1.9;color:#acc6e9;pointer-events:none}.close{position:absolute;right:3%;bottom:23px;display:flex;align-items:center;gap:12px;font-size:13px;letter-spacing:.15em}kbd{background:var(--avg-text);color:#182d50;font:700 10px var(--font-body);padding:2px 4px;border-radius:2px}.map-screen.leaving{animation:map-out .32s ease-in both;pointer-events:none}.leaving .navigation{animation:left-out .32s ease-in both}.leaving .information{animation:right-out .32s ease-in both}
 @keyframes map-in{from{opacity:0}to{opacity:1}}@keyframes map-out{to{opacity:0}}@keyframes detail-in{from{opacity:0;translate:10px 0}to{opacity:1;translate:0 0}}@keyframes left-out{to{translate:-22px 0}}@keyframes right-out{to{translate:22px 0}}
 .navigation{top:15%}nav{gap:9px}nav button{min-height:65px;font-size:17px}.information{top:16%}.description{font-size:14px}.detail-heading h2{font-size:22px}dl>div{font-size:13px}.objective-note{font-size:12px}.track{font-size:14px}
 @media(prefers-reduced-motion:reduce){.map-screen,.map-screen.leaving,.location-detail,.leaving .navigation,.leaving .information{animation:none}nav button{transition:none}}
</style>
