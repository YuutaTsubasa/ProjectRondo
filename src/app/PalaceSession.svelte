<script lang="ts">
  import { onMount } from 'svelte';
  import { Engine } from '@babylonjs/core/Engines/engine';
  import { createLevelSwap } from './levelSwap';
  import { createPalaceScene,type PalaceScene } from '../presentation/palace/palaceScene';
  import { createPalaceRun } from '../domain/palace/palaceRun';
  import PalaceHud from '../presentation/palace/PalaceHud.svelte';
  let {onReady,onFailure,onExit}:{onReady:()=>void;onFailure:(error:unknown)=>void;onExit?:()=>void}=$props();
  let canvas:HTMLCanvasElement;
  let run=$state(createPalaceRun());
  let status=$state<'loading'|'playing'|'paused'|'finished'>('loading');
  let palace:PalaceScene|undefined;
  let dialogHost:HTMLDivElement;
  $effect(()=>{
    if(status!=='paused'&&status!=='finished')return;
    const id=setTimeout(()=>dialogHost?.querySelector<HTMLButtonElement>('[role="dialog"] button')?.focus(),0);
    return()=>clearTimeout(id);
  });
  function pause(){if(status!=='playing')return;status='paused';palace?.suspendInput(true);}
  function resume(){if(status!=='paused')return;status='playing';palace?.suspendInput(false);canvas.focus();}
  function restart(){if(!palace)return;run=palace.reset();status='playing';palace.suspendInput(false);canvas.focus();}
  function leave(){palace?.suspendInput(true);onExit?.();}
  function keydown(event:KeyboardEvent){
    if(event.key==='Escape'&&!event.repeat){event.preventDefault();if(status==='playing')pause();else if(status==='paused')resume();}
    if(event.key==='Tab'&&(status==='paused'||status==='finished')){
      const buttons=[...dialogHost.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(buttons.length){event.preventDefault();buttons[(index+(event.shiftKey?buttons.length-1:1))%buttons.length].focus();}
    }
  }
  onMount(()=>{
    let live=true;
    let engine:Engine;
    try{engine=new Engine(canvas,true,{preserveDrawingBuffer:import.meta.env.DEV,stencil:true});}
    catch(error){onFailure(error);return;}
    const swap=createLevelSwap<PalaceScene>({disposeEngine:()=>engine.dispose(),onShown:()=>{}});
    engine.runRenderLoop(()=>{
      if(status!=='playing'||!palace)return;
      if(document.hidden){pause();return;}
      run=palace.advance(engine.getDeltaTime()/1000);
      if(run.finished){status='finished';palace.suspendInput(true);}
    });
    const resize=()=>engine.resize();
    const hidden=()=>{if(document.hidden)pause();};
    window.addEventListener('resize',resize);document.addEventListener('visibilitychange',hidden);resize();
    swap.swap(async()=>{
      try{return await createPalaceScene(engine);}
      catch(error){if(live)onFailure(error);throw error;}
    },built=>{
      palace=built;run=built.state;status='playing';
      built.scene.resetLastAnimationTimeFrame();
      if(document.hidden)pause();onReady();
    });
    return()=>{live=false;palace=undefined;swap.unmount();window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',hidden);};
  });
</script>
<svelte:window onkeydown={keydown}/>
<canvas bind:this={canvas} tabindex="-1" data-game-entry aria-label="白色宮殿遊戲畫面" style="width:100vw;height:100vh;display:block"></canvas>
<div bind:this={dialogHost}>
{#if status!=='loading'}<PalaceHud {run} {status} onPause={pause} onResume={resume} onRestart={restart} onExit={leave}/>{/if}
</div>
