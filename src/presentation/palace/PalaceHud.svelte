<script lang="ts">
 import StageResults from '../course/StageResults.svelte';
 import {stageTime} from '../../app/stageRecords';
 import {scoreStage} from '../../domain/course/stageScore';
 import PauseScreen from '../menu/PauseScreen.svelte';
 import StageHud from '../hud/StageHud.svelte';
 import {getPalaceStage,type PalaceStage} from '../../domain/palace/palaceStages';
 import {palaceEnemyScore} from '../../domain/palace/palaceRun';
  import { untrack } from 'svelte';
  import type { PalaceRun } from '../../domain/palace/palaceRun';
  let {run,status,stage=getPalaceStage(),onPause,onResume,onRestart,onExit,exitLabel='返回主選單'}:{run:PalaceRun;stage?:PalaceStage;status:'playing'|'paused'|'finished';onPause:()=>void;onResume:()=>void;onRestart:()=>void;onExit:()=>void;exitLabel?:string}=$props();
  let noticeAt = $state<number | null>(null);
  let previousCheckpoint = -1;
  $effect(() => {
    const checkpoint = run.checkpoint;
    if (checkpoint > previousCheckpoint) noticeAt = untrack(() => run.elapsed);
    if (checkpoint < previousCheckpoint) noticeAt = null;
    previousCheckpoint = checkpoint;
  });
  let nextTarget=$derived(stage.layout.checkpoints[run.checkpoint+1]??stage.layout.goal);
  let checkpointLabel=$derived(run.checkpoint<0?'宮殿入口':`紀錄點 ${run.checkpoint+1}`);
  let enemies=$derived(palaceEnemyScore(run,stage.layout));
  let defeated=$derived(enemies.defeated);
  // Only the results screen reads the score; skip it on every playing frame.
  let score=$derived(status!=='finished'?undefined:scoreStage({elapsed:run.elapsed,times:stage.times,coins:run.collected.length,coinTarget:stage.layout.coins.length,enemies:defeated,enemyTarget:enemies.target,checkpoints:run.reachedCheckpoints.length,checkpointTarget:stage.layout.checkpoints.length,damage:run.damageTaken,falls:run.falls}));
</script>
<div class="palace-hud">
  <div class="play-hud" class:pause-covered={status!=='playing'} inert={status !== 'playing'}>
   <StageHud number={stage.number} title={`白色宮殿 · ${stage.title}`} objective="抵達末端閘門" detail={stage.description} elapsed={run.elapsed}
    stats={[{label:'金幣',value:`${run.collected.length} / ${stage.layout.coins.length}`,icon:'coin'},{label:'守衛',value:`${defeated} / ${enemies.target}`,icon:'guard'}]}
    player={run.player} facing={{x:run.player.facing,y:0}} target={nextTarget} sideView
    route={[stage.layout.spawn,...stage.layout.checkpoints,stage.layout.goal]}
    platforms={stage.layout.platforms.map(p=>({x:p.x+p.width/2,y:p.y-p.height/2,width:p.width,height:p.height}))}
    statusLabel="生命" statusValue={run.player.health} statusMax={3}
    notice={status!=='playing'?'':noticeAt!==null&&run.elapsed-noticeAt<3.6?`紀錄點已啟動 · ${checkpointLabel}`:run.checkpoint===-1&&run.elapsed<3.6?'路線已開啟 · 宮殿入口':''} {onPause}/>
   {#if run.player.deadFor>0&&status==='playing'}<div class="respawn">返回檢查點…</div>{/if}
  </div>
  {#if status==='paused'}
    <PauseScreen {onResume} chapterLabel="TRIAL" chapterNumber={stage.number} chapterTitle="白色宮殿" subtitle={stage.title} location={checkpointLabel} elapsed={stageTime(run.elapsed)} objective="抵達末端閘門" detail={`已收集 ${run.collected.length} / ${stage.layout.coins.length} 枚金幣`} tip="空中鎖定敵人時可使用盾牌衝擊，落地後則能揮劍攻擊。"
      actions={[{label:'重新開始',english:'RESTART',run:onRestart},{label:exitLabel,english:exitLabel==='返回主選單'?'MAIN MENU':'RETURN TO REGION',run:onExit}]}/>
  {:else if status==='finished'}
    <StageResults number={stage.number} title="白色宮殿" subtitle={stage.title} description={stage.description} {score}
      stats={[
       {label:'完成時間',english:'CLEAR TIME',value:stageTime(run.elapsed),icon:'time'},
       {label:'收集金幣',english:'COINS',value:`${run.collected.length} / ${stage.layout.coins.length}`,icon:'coin'},
       {label:'擊倒守衛',english:'ENEMIES',value:`${defeated} / ${enemies.target}`,icon:'guard'},
       {label:'受傷／掉落',english:'DAMAGE / FALLS',value:`${run.damageTaken} / ${run.falls}`,icon:'retry'}
      ]}
      checks={[{label:'完成關卡',complete:true},{label:'收集全部金幣',complete:run.collected.length===stage.layout.coins.length},{label:`${stage.times[0]} 秒內完成`,complete:run.elapsed<=stage.times[0]},{label:'全程無傷無掉落',complete:run.damageTaken===0&&run.falls===0}]}
      {onRestart} {onExit} {exitLabel}/>

  {/if}
</div>
<style>
 .pause-covered{visibility:hidden}
 .palace-hud{position:fixed;inset:0;pointer-events:none;color:var(--c-ink);font-family:var(--font-body)}
 .respawn{position:absolute;inset:0;display:grid;place-items:center;background:var(--surface-glass);font-size:18px;letter-spacing:.2em}
</style>
