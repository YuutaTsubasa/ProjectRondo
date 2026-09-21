<script lang="ts">
  import { onDestroy, type Component } from 'svelte';
  import FrontDoor from '../presentation/menu/FrontDoor.svelte';
  import { stepFrontDoor, type FrontDoorAction, type FrontDoorPhase } from './frontDoor';
  import { loadGameSession } from './loadGameSession';

  let phase = $state<FrontDoorPhase>('title');
  let Game = $state<Component<{ onReady: () => void; onFailure: (error: unknown) => void }>>();
  let gameHost = $state<HTMLDivElement>();
  $effect(() => {
    if (phase !== 'game') return;
    const timer = setTimeout(() => {
      const entry = gameHost?.querySelector<HTMLElement>('[data-game-entry]') ?? gameHost?.querySelector<HTMLElement>('canvas,button');
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
      const loaded = await loadGameSession();
      if (live && phase === 'loading') Game = loaded.default;
    } catch (error) { fail(error); }
  }

  function act(action: FrontDoorAction) {
    const next = stepFrontDoor(phase, action);
    if (next === phase) return;
    phase = next;
    if (phase === 'loading') void load();
  }
</script>

{#if Game}
  <div bind:this={gameHost} class="game-session" class:preparing={phase !== 'game'} inert={phase !== 'game'}>
    <Game onReady={() => act('ready')} onFailure={fail} />
  </div>
{/if}
{#if phase !== 'game'}
  <FrontDoor {phase} onAction={act} />
{/if}

<style>
  .game-session { position:fixed; inset:0; }
  .preparing { visibility:hidden; }
  .game-session:not(.preparing) { animation:reveal-game .5s ease-out both; }
  @keyframes reveal-game { from { opacity:0; } to { opacity:1; } }
  @media (prefers-reduced-motion:reduce) { .game-session:not(.preparing) { animation:none; } }
</style>