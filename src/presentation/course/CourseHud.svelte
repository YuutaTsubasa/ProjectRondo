<script lang="ts">
 import {COURSE_GUARD_SPAWNS} from '../../domain/course/courseCombat';
 import StageResults from './StageResults.svelte';
 import {scoreStage,COURSE_RANK_TIMES} from '../../domain/course/stageScore';
 import PauseScreen from '../menu/PauseScreen.svelte';
 import StageHud from '../hud/StageHud.svelte';
 import {untrack} from 'svelte';
 import {COURSE_GATES,COURSE_PLATFORMS} from '../../domain/course/courseLayout';
 import type {StagePoint} from '../hud/stageNavigation';
  import { COURSE_MAX_HEALTH, type CourseRun } from '../../domain/course/courseProgress';
  let { run, status, checkpointLabel, onPause, onResume, onRestart, onExit, exitLabel = '返回主選單', player={x:0,y:0}, facing={x:0,y:1}, defeated=0, damage=0 }: {
    defeated?:number; damage?:number; run: CourseRun; status: 'playing' | 'paused' | 'finished'; checkpointLabel: string;
    onPause: () => void; onResume: () => void; onRestart: () => void; onExit: () => void; exitLabel?: string; player?:StagePoint; facing?:StagePoint;
  } = $props();
  const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  let noticeAt=$state(0);
  let previousCheckpoint=-1;
  $effect(()=>{if(run.checkpoint!==previousCheckpoint){previousCheckpoint=run.checkpoint;noticeAt=untrack(()=>run.elapsed);}});
  let nextGate=$derived(COURSE_GATES[Math.min(run.checkpoint+1,COURSE_GATES.length-1)]!);
  let score=$derived(scoreStage({elapsed:run.elapsed,times:COURSE_RANK_TIMES,coins:0,coinTarget:0,enemies:defeated,enemyTarget:COURSE_GUARD_SPAWNS.length,checkpoints:run.checkpoint,checkpointTarget:COURSE_GATES.length-1,damage,falls:run.falls}));
</script>

<div class="course-hud" class:pause-covered={status!=='playing'} inert={status !== 'playing'}>
 <StageHud number="01" title="白宮天廊" objective="抵達白塔中繼台" detail={`穿越白宮露臺與水晶，前往${nextGate.label}。`}
  elapsed={run.elapsed} stats={[{label:'紀錄點',value:`${run.checkpoint} / ${COURSE_GATES.length-1}`,icon:'gate'},{label:'守衛',value:`${defeated} / ${COURSE_GUARD_SPAWNS.length}`,icon:'guard'}]}
  {player} {facing} target={{x:nextGate.center.x,y:nextGate.center.z}}
  route={COURSE_GATES.map(g=>({x:g.center.x,y:g.center.z}))}
  platforms={COURSE_PLATFORMS.map(p=>({x:p.center.x,y:p.center.z,width:p.width,height:p.depth}))}
  statusLabel="生命" statusValue={run.health} statusMax={COURSE_MAX_HEALTH}
  notice={status==='playing'&&run.elapsed-noticeAt<3.6?(run.checkpoint===0?'路線已開啟 · 白石前庭':`紀錄點已啟動 · ${checkpointLabel}`):''} {onPause}/>
</div>
{#if status === 'paused'}
 <PauseScreen {onResume} chapterLabel="TRIAL" chapterTitle="白宮天廊" subtitle="白色王城" location={checkpointLabel} elapsed={time(run.elapsed)} objective="重新接通白塔中繼台" detail="沿水晶與石台向高處前進，抵達白塔中繼台。" tip="先確認下一個落腳處，再用二段跳與空中盾衝跨越缺口。"
  actions={[{label:'重新開始',english:'RESTART',run:onRestart},{label:exitLabel,english:exitLabel==='返回主選單'?'MAIN MENU':'RETURN TO REGION',run:onExit}]}/>
{:else if status === 'finished'}
 <StageResults number="01" title="白宮天廊" subtitle="白色王城" description="穿越白宮天廊與騎士守衛，重新接通白塔中繼台。" {score} optionalLabel="路線完成／守衛"
  stats={[{label:'完成時間',english:'CLEAR TIME',value:time(run.elapsed),icon:'time'},{label:'啟動紀錄點',english:'CHECKPOINTS',value:`${run.checkpoint} / ${COURSE_GATES.length-1}`,icon:'gate'},{label:'擊倒守衛',english:'GUARDS',value:`${defeated} / ${COURSE_GUARD_SPAWNS.length}`,icon:'guard'},{label:'受擊次數',english:'HITS TAKEN',value:String(damage),icon:'hits'},{label:'重試次數',english:'RETRIES',value:String(run.falls),icon:'retry'}]}
  checks={[{label:'完成關卡',complete:true},{label:'啟動全部紀錄點',complete:run.checkpoint===COURSE_GATES.length-1},{label:'45 秒內完成',complete:run.elapsed<=COURSE_RANK_TIMES[0]},{label:'全程無重試',complete:run.falls===0}]}
  {onRestart} {onExit} {exitLabel}/>

{/if}

<style>
 .pause-covered{visibility:hidden}
 .course-hud{position:fixed;inset:0;pointer-events:none}
</style>
