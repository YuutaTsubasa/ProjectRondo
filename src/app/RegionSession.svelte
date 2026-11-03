<script lang="ts">
 import {isCityStop,readCityJourney,writeCityJourney,finishCityStop,type CityStopId} from '../domain/region/cityJourney';
 import {getActivityHost} from '../content/activityHosts';
 import {cityStories,cityStoryChapter} from '../content/cityStory';
 import {isStageId,stageKind,type StageId} from '../domain/stage/stageIds';
 import {getStageInfo} from '../content/stageCatalog';
 import {readStageBest} from './stageRecords';
 import UiViewport from '../presentation/layout/UiViewport.svelte';
 import {onDestroy,onMount,tick,untrack} from 'svelte';
 import ExpeditionIntro from '../presentation/region/ExpeditionIntro.svelte';
 import LoadingPage from '../presentation/menu/LoadingPage.svelte';
 import PauseScreen from '../presentation/menu/PauseScreen.svelte';
 import RegionWorld from './RegionWorld.svelte';
 import CourseSession from './CourseSession.svelte';
 import PalaceSession from './PalaceSession.svelte';
 import RegionHud from '../presentation/region/RegionHud.svelte';
 import RegionMap from '../presentation/region/RegionMap.svelte';
 import InformationDialog from '../presentation/menu/InformationDialog.svelte';
 import DialogueOverlay from '../presentation/dialogue/DialogueOverlay.svelte';
 import {createDialogueSession,type DialogueSession} from '../presentation/dialogue/dialogueSession.svelte';
 import {regionStories,regionStoryChapter,type RegionStoryId} from '../content/regionStory';
 import {finishRegionDialogue,completeRegionExpedition,discoverRegionSite} from '../domain/region/regionProgress';
 import {REGION_PLACES,REGION_INTERACTION_PLACES,REGION_SPAWN,COURSE_RETURN,regionHeight,isRegionGrounded,type RegionPlaceId} from '../domain/region/regionLayout';
 import {explorationObjective,nearbyRegionPlace,restoreRegionCoursePosition,type RegionPoint} from '../domain/region/regionObjectives';
 import {readRegionSave,writeRegionSave,regionStorage} from './regionSave';
 import {readParlorTalks,writeParlorTalks} from './parlorSave';
 import {parlorStories,parlorStoryChapter} from '../content/parlorStory';
 import {PARLOR_ENTRANCE,PARLOR_RETURN,PARLOR_RETURN_FACING,PARLOR_ARRIVAL,PARLOR_ARRIVAL_FACING,PARLOR_NAME,inParlor,toParlorRoom,nearbyParlorSpot,parlorTalk,type ParlorTalkId} from '../domain/town/mahjongParlor';
 import type {SoundCue} from '../domain/audio/soundCue';
 /** Each half of a door fade; reduced motion cuts straight through. */
 const DOOR_FADE_MS=280;
 let {onReady,onFailure,onExit,freshStart=false}:{freshStart?:boolean;onReady:()=>void;onFailure:(error:unknown)=>void;onExit?:()=>void}=$props();
 const storage=regionStorage(),saved=untrack(()=>{
  const loaded=readRegionSave(freshStart?undefined:storage);
  return {...loaded,position:restoreRegionCoursePosition(loaded.position,loaded.progress.chapter)};
 });
 let cityDone=$state(untrack(()=>readCityJourney(freshStart?undefined:storage)));
 let progress=$state(saved.progress),position=$state<RegionPoint>(saved.position),spawn=$state<RegionPoint>(saved.position);
 let safePosition:RegionPoint={...saved.position};
 let mode=$state<'world'|StageId>('world'),loading=$state(true),epoch=$state(0),readySent=$state(false);
 let mapFromIntroduction=$state(false);
 let modal=$state<'map'|'paused'|'expedition'|null>(null),pendingExpedition=$state<StageId>('course');
 let heading=$state(0);
 let playerHeading=$state(180);
 let error=$state(''),locationLabel=$state('白色王城'),notice=$state(''),saveWarning=$state(false);
 let dialogueId=$state<RegionStoryId|CityStopId|ParlorTalkId|null>(null),dialogue=$state<DialogueSession>();
 let tracked=$state<RegionPlaceId|null>(null),world=$state<{reset:()=>void;playCue:(cue:SoundCue)=>void;teleport:(point:RegionPoint,facing:{x:number;z:number})=>void}>();
 let parlorTalks=untrack(()=>readParlorTalks(freshStart?undefined:storage)),fading=$state(false),fadeTimer:ReturnType<typeof setTimeout>|undefined;
 let noticeTimer:ReturnType<typeof setTimeout>|undefined,lastSavedAt=0,live=true;
 const objective=explorationObjective;
 const navigationId=$derived(tracked??objective.placeId);
 // The parlor room is part of the region world; being inside it is a matter of position, not mode.
 const indoors=$derived(mode==='world'&&inParlor(position));
 const nearby=$derived(mode==='world'&&!indoors?nearbyRegionPlace(position,REGION_INTERACTION_PLACES,regionHeight):undefined);
 const nearDoor=$derived(mode==='world'&&!indoors&&!!nearbyRegionPlace(position,[PARLOR_ENTRANCE],regionHeight));
 // Maps and the HUD place the player at the parlor's street door, not at the far-off room.
 const mapPosition=$derived(indoors?PARLOR_RETURN:position);
 const parlorSpot=$derived(indoors?nearbyParlorSpot(toParlorRoom(position)):undefined);
 // A save at the parlor door resumes facing the street, not the sidewalk trees behind.
 const spawnFacing=$derived(Math.hypot(spawn.x-PARLOR_RETURN.x,spawn.z-PARLOR_RETURN.z)<.5?PARLOR_RETURN_FACING:undefined);
 const isParlorTalk=(id:RegionStoryId|CityStopId|ParlorTalkId):id is ParlorTalkId=>Object.hasOwn(parlorStories,id);
 const paused=$derived(loading||fading||!!dialogue||modal!==null||!!error);
 const prompt=$derived(parlorSpot==='host'?'交談 · 一目元':parlorSpot==='exit'?'離開 · 白石街':nearDoor?`進入 · ${PARLOR_NAME}`:!nearby?'':nearby.kind==='vista'?`記錄風景 · ${nearby.name}`:nearby.kind==='expedition'?`交談 · ${getActivityHost(nearby.id)?.name??nearby.name} · ${nearby.name}`:`接聽回聲管 · ${nearby.name}`);
 // The talk count is saved with the region, so NEW GAME replaces it only when the new run first saves.
 function persist(){const mainSaved=writeRegionSave(storage,{progress,position:safePosition});const citySaved=writeCityJourney(cityDone,storage);writeParlorTalks(storage,parlorTalks);saveWarning=!mainSaved||!citySaved;lastSavedAt=Date.now();}
 function inform(text:string){notice=text;if(noticeTimer)clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice='',5000);}
 function openStory(id:RegionStoryId|CityStopId|ParlorTalkId){dialogueId=id;dialogue=createDialogueSession(isParlorTalk(id)?parlorStories[id].graph:isCityStop(id)?cityStories[id].graph:regionStories[id].graph);modal=null;}
 $effect(()=>{
  const active=dialogueId;if(!active)return;
  let cancelled=false;
  void tick().then(()=>{if(!cancelled)document.querySelector<HTMLButtonElement>('button[aria-label="advance dialogue"]')?.focus();});
  return()=>{cancelled=true;};
 });
 function worldReady(){if(!live)return;loading=false;if(document.hidden&&!dialogue)modal='paused';if(!readySent){readySent=true;onReady();}}
 function stageReady(){if(live)loading=false;}
 function fail(cause:unknown){if(!live)return;console.error('First region loading failed:',cause);loading=false;error='地圖、角色或音樂未能載入。你的章節進度已保留，可以重試或返回王城。';if(!readySent){readySent=true;onReady();}}
 function updatePosition(next:RegionPoint,label:string){
  if(mode!=='world'||error)return;position=next;locationLabel=label;
  // Indoors the door stays the safe position, so a save never resumes inside the room.
  if(inParlor(next)){if(Date.now()-lastSavedAt>5000)persist();return;}
  const onGround=isRegionGrounded(next);
  if(onGround)safePosition={...next};
  const place=nearbyRegionPlace(next,REGION_INTERACTION_PLACES,regionHeight);
  if(place?.kind==='vista'){
   const discovered=discoverRegionSite(progress,place.id);if(discovered!==progress){progress=discovered;inform(`發現 ${place.name} · ${progress.discoveries.length}/3 處風景`);persist();}
  }
  if(Date.now()-lastSavedAt>5000&&onGround)persist();
 }
 function finishStory(){
  if(!dialogueId)return;
  if(isParlorTalk(dialogueId)){parlorTalks++;writeParlorTalks(storage,parlorTalks);dialogue=undefined;dialogueId=null;return;}
  const city=isCityStop(dialogueId);if(city)cityDone=finishCityStop(cityDone,dialogueId);else progress=finishRegionDialogue(progress,dialogueId as RegionStoryId);dialogue=undefined;dialogueId=null;tracked=null;persist();if(city)inform('已記錄這段王城故事');else if(progress.chapter==='complete')inform('第一章完成 · 白色王城的潮聲回來了');}
 function interact(){
  if(paused)return;
  if(parlorSpot){if(parlorSpot==='host')openStory(parlorTalk(parlorTalks));else leaveParlor();return;}
  if(nearDoor){enterParlor();return;}
  if(mode!=='world'||!nearby)return;
  if(nearby.id==='signal'&&progress.chapter==='signal'){openStory('meadow_signal');return;}
  if(nearby.id==='homecoming'){
   const story=progress.chapter==='arrival'?'town_arrival':progress.chapter==='relay-report'?'ruin_relay':progress.chapter==='aqueduct-report'?'aqueduct_open':progress.chapter==='homecoming'?'town_return':null;
   if(story){openStory(story);return;}
  }
  if(isCityStop(nearby.id)){openStory(nearby.id);return;}
  if(isStageId(nearby.id)){pendingExpedition=nearby.id;modal='expedition';return;}
  inform(nearby.kind==='vista'?nearby.description:progress.chapter==='complete'?'回聲管裡傳來港邊的水聲。':objective.detail);
 }
 /** A door is a short fade and a teleport within the same world: no scene load. */
 function passDoor(point:RegionPoint,facing:{x:number;z:number}){
  const ms=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:DOOR_FADE_MS;
  const arrive=()=>{fadeTimer=undefined;if(!live)return;world?.teleport(point,facing);position={...point};fading=false;};
  fading=true;modal=null;
  if(ms)fadeTimer=setTimeout(arrive,ms);else arrive();
 }
 function enterParlor(){safePosition={...PARLOR_RETURN};persist();passDoor(PARLOR_ARRIVAL,PARLOR_ARRIVAL_FACING);}
 function leaveParlor(){safePosition={...PARLOR_RETURN};persist();passDoor(PARLOR_RETURN,PARLOR_RETURN_FACING);}
 function startExpedition(){if(pendingExpedition==='course')safePosition={...COURSE_RETURN};persist();spawn={...safePosition};modal=null;loading=true;epoch++;mode=pendingExpedition;}
 function stageComplete(id:StageId){if(mode!==id)return;if(id==='course'||id==='palace')progress=completeRegionExpedition(progress,id);persist();}
 function returnToWorld(){if(mode==='course'){position={...COURSE_RETURN};safePosition={...COURSE_RETURN};spawn={...COURSE_RETURN};persist();}loading=true;error='';modal=null;epoch++;mode='world';}
 function retry(){error='';loading=true;epoch++;}
 function resume(){if(!document.hidden){modal=null;}}
 function pause(){if(mode==='world'&&!loading&&!dialogue&&!modal)modal='paused';}
 function closeMap(){modal=mapFromIntroduction?'expedition':null;mapFromIntroduction=false;}
 function openMap(){mapFromIntroduction=false;modal='map';}
 function track(id:RegionPlaceId){tracked=id;closeMap();inform(`追蹤 ${REGION_PLACES.find(p=>p.id===id)!.name}`);}
 function leave(){persist();onExit?.();}
 function reset(){world?.reset();position={...REGION_SPAWN};safePosition={...REGION_SPAWN};spawn={...REGION_SPAWN};persist();resume();inform('已返回王城南門');}
 function keydown(event:KeyboardEvent){
  if(modal==='expedition')return;
  if(event.defaultPrevented||event.repeat||event.altKey||event.ctrlKey||event.metaKey||mode!=='world'||loading||fading||dialogue||error)return;
  if(event.key==='Escape'){event.preventDefault();if(modal==='map')closeMap();else if(modal)resume();else pause();}
  else if(event.key.toLowerCase()==='m'&&(!modal||modal==='map')){event.preventDefault();if(modal)closeMap();else openMap();}
  else if(event.key.toLowerCase()==='e'&&!modal&&prompt){event.preventDefault();interact();}
 }
 onMount(()=>{const save=()=>persist();window.addEventListener('pagehide',save);return()=>window.removeEventListener('pagehide',save);});
 onDestroy(()=>{live=false;if(noticeTimer)clearTimeout(noticeTimer);if(fadeTimer)clearTimeout(fadeTimer);});
</script>
<svelte:window onkeydown={keydown}/>
{#if !error}
 {#key epoch}
  {#if mode==='world'}<RegionWorld bind:this={world} {paused} {spawnFacing} targetId={navigationId} waterRestored={progress.completedExpeditions.includes('palace')} {spawn} onReady={worldReady} onFailure={fail} onPosition={updatePosition} onPause={pause} onHeading={value=>heading=value} onPlayerHeading={value=>playerHeading=value}/>
  {:else if stageKind(mode)==='course'}<CourseSession stageId={mode} onReady={stageReady} onFailure={fail} onExit={returnToWorld} onComplete={()=>stageComplete(mode as StageId)} exitLabel={mode==='course'?'返回白塔廣場':'返回白色王城'}/>
  {:else}<PalaceSession stageId={mode} onReady={stageReady} onFailure={fail} onExit={returnToWorld} onComplete={()=>stageComplete(mode as StageId)} exitLabel="返回白色王城"/>{/if}
 {/key}
{/if}
<!-- Above stage HUDs (10), below the touch controls (12) so their buttons stay tappable. -->
<UiViewport layer={11}>
{#if mode==='world'&&!loading&&!error}
 <div inert={paused} hidden={modal==='paused'}><RegionHud subdued={!!dialogue} {progress} position={mapPosition} {heading} {playerHeading} {locationLabel} {navigationId} objectiveOverride={objective} prompt={paused?'':prompt} {notice} {saveWarning} onInteract={interact} onMap={openMap} onPause={pause}/></div>
{/if}
{#if dialogue&&dialogueId}
 {#key dialogueId}<DialogueOverlay chapter={isParlorTalk(dialogueId)?parlorStoryChapter(dialogueId):isCityStop(dialogueId)?cityStoryChapter(dialogueId):regionStoryChapter(dialogueId)} session={dialogue} showPortrait={dialogue.speaker==='悠太翼'} playCue={cue=>world?.playCue(cue)} onFinished={finishStory}/>{/key}
{/if}
{#if loading&&readySent}<LoadingPage message={mode==='world'?'正在返回白色王城…':'正在前往'+getStageInfo(mode).title+'…'}/>{/if}
{#if modal==='map'}<RegionMap {progress} position={mapPosition} objectiveOverride={objective} initialPlace={mapFromIntroduction?pendingExpedition:null} onClose={closeMap} onTrack={track}/>{/if}
{#if modal==='paused'&&!error}
 <PauseScreen onResume={resume} resumeLabel="繼續旅途" chapterTitle="白色王城" subtitle={objective.title} location={locationLabel} objective={objective.title} detail={objective.detail} tip="按 M 開啟地圖，選取地點後可追蹤目的地。旅途進度會自動記錄。"
  actions={[{label:'地圖與旅途紀錄',english:'WORLD MAP',run:openMap},{label:'返回王城南門',english:'RETURN TO GATE',run:reset},{label:'返回主選單',english:'MAIN MENU',run:leave}]}/>
{/if}
{#if modal==='expedition'&&!error}
 <ExpeditionIntro host={getActivityHost(pendingExpedition)} expedition={pendingExpedition} completed={readStageBest(pendingExpedition)!==null||((pendingExpedition==='course'||pendingExpedition==='palace')&&progress.completedExpeditions.includes(pendingExpedition))} onStart={startExpedition} onClose={resume} onMap={()=>{tracked=pendingExpedition;mapFromIntroduction=true;modal='map';}}/>
{/if}
{#if error}
 <InformationDialog title="暫時無法抵達" body={error} actions={[
  {label:'重新載入',english:'RETRY',run:retry,primary:true},
  ...(mode!=='world'?[{label:'返回王城',english:'RETURN',run:returnToWorld}]:[]),
  {label:'返回主選單',english:'MAIN MENU',run:leave}
 ]}/>
{/if}
<div class="door-fade" class:shown={fading} aria-hidden="true"></div>
</UiViewport>
<style>
 .door-fade{position:fixed;inset:0;background:#f3f6fa;opacity:0;pointer-events:none;transition:opacity 280ms ease}
 .door-fade.shown{opacity:1}
 @media (prefers-reduced-motion:reduce){.door-fade{transition:none}}
</style>
