<script lang="ts">
 import UiViewport from '../presentation/layout/UiViewport.svelte';
  import {recordStageClear} from './stageRecords';
  import { onMount,untrack } from 'svelte';
  import {retainMenuPortraitAfter} from '../presentation/menu/sharedMenuPortrait';
  import { Engine } from '@babylonjs/core/Engines/engine';
  import { createLevelSwap } from './levelSwap';
  import { createPalaceScene,type PalaceScene } from '../presentation/palace/palaceScene';
  import {getPalaceStage} from '../domain/palace/palaceStages';
  import { createPalaceRun } from '../domain/palace/palaceRun';
  import PalaceHud from '../presentation/palace/PalaceHud.svelte';
  let {onReady,onFailure,onExit,onComplete,stageId='palace',exitLabel='返回主選單'}:{onReady:()=>void;onFailure:(error:unknown)=>void;onExit?:()=>void;onComplete?:()=>void;exitLabel?:string;stageId?:string}=$props();
  // One session owns one scene; stage changes are mounted as a new session.
  const stage=untrack(()=>getPalaceStage(stageId));
  let canvas:HTMLCanvasElement;
  let run=$state(createPalaceRun(stage.layout));
  let status=$state<'loading'|'playing'|'paused'|'finished'>('loading');
  let palace:PalaceScene|undefined;
  let discardNextFrame=false;
  let dialogHost:HTMLDivElement;
  $effect(()=>{
    if(status!=='paused'&&status!=='finished')return;
    const id=setTimeout(()=>dialogHost?.querySelector<HTMLButtonElement>('[role="dialog"] button')?.focus(),0);
    return()=>clearTimeout(id);
  });
  function pause(){if(status!=='playing')return;status='paused';palace?.suspendInput(true);}
  function resume(){if(status!=='paused')return;discardNextFrame=true;status='playing';palace?.suspendInput(false);canvas.focus();}
  function restart(){if(!palace)return;discardNextFrame=true;run=palace.reset();status='playing';palace.suspendInput(false);canvas.focus();}
  function leave(){palace?.suspendInput(true);onExit?.();}
  function keydown(event:KeyboardEvent){
    if(event.defaultPrevented)return;
    if(event.key==='Escape'&&!event.repeat){event.preventDefault();if(status==='playing')pause();else if(status==='paused')resume();}
    if(event.key==='Tab'&&(status==='paused'||status==='finished')){
      const buttons=[...dialogHost.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(buttons.length){event.preventDefault();buttons[(index+(event.shiftKey?buttons.length-1:1))%buttons.length].focus();}
    }
  }
  // Warm the results-screen portrait once this stage is up; see retainMenuPortraitAfter.
  let stageShown!:()=>void;
  const shown=new Promise<void>(resolve=>{stageShown=resolve;});
  onMount(()=>'WebGLRenderingContext' in window?retainMenuPortraitAfter(shown):undefined);
  onMount(()=>{
    let live=true;
    let engine:Engine;
    try{engine=new Engine(canvas,true,{preserveDrawingBuffer:import.meta.env.DEV,stencil:true});}
    catch(error){onFailure(error);return;}
    const swap=createLevelSwap<PalaceScene>({disposeEngine:()=>engine.dispose(),onShown:()=>{}});
    engine.runRenderLoop(()=>{
      if(status!=='playing'||!palace)return;
      if(document.hidden){pause();return;}
      if(discardNextFrame){discardNextFrame=false;palace.scene.resetLastAnimationTimeFrame();return;}
      run=palace.advance(engine.getDeltaTime()/1000);
      if(run.finished){status='finished';palace.suspendInput(true);recordStageClear(stage.id,run.elapsed);onComplete?.();}
    });
    const resize=()=>engine.resize();
    const hidden=()=>{if(document.hidden)pause();};
    window.addEventListener('resize',resize);document.addEventListener('visibilitychange',hidden);resize();
    swap.swap(async()=>{
      try{return await createPalaceScene(engine,stage);}
      catch(error){if(live)onFailure(error);throw error;}
    },built=>{
      palace=built;run=built.state;status='playing';
      built.scene.resetLastAnimationTimeFrame();
      if(document.hidden)pause();onReady();stageShown();
    });
    return()=>{live=false;palace=undefined;swap.unmount();window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',hidden);};
  });
</script>
<svelte:window onkeydown={keydown}/>
<canvas bind:this={canvas} tabindex="-1" data-game-entry aria-label={`白色宮殿 ${stage.number} ${stage.title} 遊戲畫面`} style="width:100vw;height:100vh;display:block"></canvas>
<UiViewport>
<div bind:this={dialogHost}>
{#if status!=='loading'}<PalaceHud {stage} {run} {status} onPause={pause} onResume={resume} onRestart={restart} onExit={leave} {exitLabel}/>{/if}
</div>
</UiViewport>
