<script lang="ts">

 import StageResults from './StageResults.svelte';
 import {stageTime} from '../../app/stageRecords';
 import {scoreStage} from '../../domain/course/stageScore';
 import PauseScreen from '../menu/PauseScreen.svelte';
 import StageHud from '../hud/StageHud.svelte';
 import {untrack} from 'svelte';
 import {getCourseStage,type CourseDefinition} from '../../domain/course/courseStages';
 import type {StagePoint} from '../hud/stageNavigation';
  import { COURSE_MAX_HEALTH, type CourseRun } from '../../domain/course/courseProgress';
  let { stage=getCourseStage(), run, status, checkpointLabel, onPause, onResume, onRestart, onExit, exitLabel = '返回主選單', player={x:0,y:0}, facing={x:0,y:1}, defeated=0, damage=0 }: {
    stage?:CourseDefinition; defeated?:number; damage?:number; run: CourseRun; status: 'playing' | 'paused' | 'finished'; checkpointLabel: string;
    onPause: () => void; onResume: () => void; onRestart: () => void; onExit: () => void; exitLabel?: string; player?:StagePoint; facing?:StagePoint;
  } = $props();
  let noticeAt=$state(0);
  let previousCheckpoint=-1;
  $effect(()=>{if(run.checkpoint!==previousCheckpoint){previousCheckpoint=run.checkpoint;noticeAt=untrack(()=>run.elapsed);}});
  let nextGate=$derived(stage.gates[Math.min(run.checkpoint+1,stage.gates.length-1)]!);
  // Only the results screen reads the score; skip it on every playing frame.
  let score=$derived(status!=='finished'?undefined:scoreStage({elapsed:run.elapsed,times:stage.times,coins:run.collected.length,coinTarget:stage.coins.length,enemies:defeated,enemyTarget:stage.guards.length,checkpoints:run.checkpoint,checkpointTarget:stage.gates.length-1,damage,falls:run.falls}));
</script>

<div class="course-hud" class:pause-covered={status!=='playing'} inert={status !== 'playing'}>
 <StageHud number={stage.number} title={stage.title} objective={stage.objective} detail={`穿越白宮露臺與水晶，前往${nextGate.label}。`}
  elapsed={run.elapsed} stats={[{label:'金幣',value:`${run.collected.length} / ${stage.coins.length}`,icon:'coin'},{label:'紀錄點',value:`${run.checkpoint} / ${stage.gates.length-1}`,icon:'gate'},{label:'守衛',value:`${defeated} / ${stage.guards.length}`,icon:'guard'}]}
  {player} {facing} target={{x:nextGate.center.x,y:nextGate.center.z}}
  route={stage.gates.map(g=>({x:g.center.x,y:g.center.z}))}
  platforms={stage.platforms.map(p=>({x:p.center.x,y:p.center.z,width:p.width,height:p.depth}))}
  statusLabel="生命" statusValue={run.health} statusMax={COURSE_MAX_HEALTH}
  notice={status==='playing'&&run.elapsed-noticeAt<3.6?(run.checkpoint===0?`路線已開啟 · ${stage.gates[0].label}`:`紀錄點已啟動 · ${checkpointLabel}`):''} {onPause}/>
</div>
{#if status === 'paused'}
 <PauseScreen chapterNumber={stage.number} {onResume} chapterLabel="TRIAL" chapterTitle={stage.title} subtitle={stage.subtitle} location={checkpointLabel} elapsed={stageTime(run.elapsed)} objective={stage.objective} detail={stage.description} tip={stage.tip}
  actions={[{label:'重新開始',english:'RESTART',run:onRestart},{label:exitLabel,english:exitLabel==='返回主選單'?'MAIN MENU':'RETURN TO REGION',run:onExit}]}/>
{:else if status === 'finished'}
 <StageResults number={stage.number} title={stage.title} subtitle={stage.subtitle} description={stage.description} {score} optionalLabel="金幣／守衛"
  stats={[{label:'完成時間',english:'CLEAR TIME',value:stageTime(run.elapsed),icon:'time'},{label:'收集金幣',english:'COINS',value:`${run.collected.length} / ${stage.coins.length}`,icon:'coin'},{label:'擊倒守衛',english:'GUARDS',value:`${defeated} / ${stage.guards.length}`,icon:'guard'},{label:'受擊次數',english:'HITS TAKEN',value:String(damage),icon:'hits'},{label:'重試次數',english:'RETRIES',value:String(run.falls),icon:'retry'}]}
  checks={[{label:'完成關卡',complete:true},{label:'收集全部金幣',complete:run.collected.length===stage.coins.length},{label:`${stage.times[0]} 秒內完成`,complete:run.elapsed<=stage.times[0]},{label:'全程無重試',complete:run.falls===0}]}
  {onRestart} {onExit} {exitLabel}/>

{/if}

<style>
 .pause-covered{visibility:hidden}
 .course-hud{position:fixed;inset:0;pointer-events:none}
</style>
