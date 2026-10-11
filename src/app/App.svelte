<script lang="ts">
 import UiViewport from '../presentation/layout/UiViewport.svelte';
  import { onDestroy, onMount, type Component } from 'svelte';
  import {backupRegionSave,regionStorage,inspectRegionSave} from './regionSave';
  import InputLayer from '../presentation/input/InputLayer.svelte';
  import FrontDoor from '../presentation/menu/FrontDoor.svelte';
  import { stepFrontDoor, type FrontDoorAction, type FrontDoorPhase } from './frontDoor';
  import { loadGameSession, type GameEntry } from './loadGameSession';

  import { createMenuMusic, type MenuMusic } from '../presentation/audio/menuMusic';

  let menuMusic: MenuMusic | undefined;
  onMount(() => {
    menuMusic = createMenuMusic();
    return () => menuMusic?.dispose();
  });
  $effect(() => {
    const active = phase !== 'loading' && phase !== 'game';
    menuMusic?.setTitleScreen(phase === 'title');
    menuMusic?.setActive(active);
  });

  let entry: GameEntry = 'region';
  let freshStart = $state(false);
  const initialSave = inspectRegionSave(regionStorage());
  let saveAvailable = $state(initialSave.available);
  let saveProgress = $state(initialSave.progress);
  let menuError = $state('');
  let phase = $state<FrontDoorPhase>('title');
  let Game = $state<Component<{ onReady: () => void; onFailure: (error: unknown) => void; onExit?: () => void; freshStart?: boolean }>>();
  let gameHost = $state<HTMLDivElement>();
  $effect(() => {
    if (phase !== 'game') return;
    const timer = setTimeout(() => {
      const entry = gameHost?.querySelector<HTMLElement>('[role=dialog][aria-modal=true] button')
        ?? gameHost?.querySelector<HTMLElement>('button[data-game-entry]')
        ?? gameHost?.querySelector<HTMLElement>('[data-game-entry]')
        ?? gameHost?.querySelector<HTMLElement>('canvas,button');
      entry?.focus();
    }, 0);
    return () => clearTimeout(timer);
  });
  let live = true;
  onDestroy(() => { live = false; });

  function fail(error: unknown) {
    if (!live || phase !== 'loading') return;
    console.error('Game startup failed:', error);
    Game = undefined;
    phase = stepFrontDoor(phase, 'fail');
  }

  async function load() {
    try {
      const loaded = await loadGameSession(entry);
      if (live && phase === 'loading') Game = loaded.default;
    } catch (error) { fail(error); }
  }

  function act(action: FrontDoorAction) {
    const next = stepFrontDoor(phase, action);
    if (next === phase) return;
    if (phase !== 'loading' && phase !== 'game') void menuMusic?.unlock();
    menuError='';
    const save=inspectRegionSave(regionStorage());
    saveAvailable=save.available;saveProgress=save.progress;
    if(action==='continue'&&!saveAvailable)return;
    if(action==='confirm-new'){
      if(!backupRegionSave(regionStorage())){menuError='無法保留目前的存檔，尚未開始新旅程。請確認瀏覽器儲存空間後再試。';return;}
      freshStart=true;
    }
    if(action==='continue')freshStart=false;
    if (action === 'town') entry = 'town';
    if (action === 'palace') entry = 'palace';
    if (action === 'course') entry = 'course';
    if (action === 'start'||action==='confirm-new'||action==='continue') entry = 'region';
    if (action === 'leave') Game = undefined;
    phase = next;
    if (phase === 'loading') void load();
  }
</script>

<InputLayer/>

{#if Game}
  <div bind:this={gameHost} class="game-session" class:preparing={phase !== 'game'} inert={phase !== 'game'}>
    <Game {freshStart} onReady={() => act('ready')} onFailure={fail} onExit={() => act('leave')} />
  </div>
{/if}
{#if phase !== 'game'}
  <UiViewport layer={100}><FrontDoor {phase} {saveAvailable} {saveProgress} {menuError} onAction={act} /></UiViewport>
{/if}

<style>
  .game-session { position:fixed; inset:0; }
  .preparing { visibility:hidden; }
  .game-session:not(.preparing) { animation:reveal-game .5s ease-out both; }
  @keyframes reveal-game { from { opacity:0; } to { opacity:1; } }
  @media (prefers-reduced-motion:reduce) { .game-session:not(.preparing) { animation:none; } }
</style>
