<script lang="ts">
  import type { DialogueSession } from './dialogueSession.svelte';
  import Nameplate from './Nameplate.svelte';
  import Line from './Line.svelte';

  let { session, onFinished }: { session: DialogueSession; onFinished?: () => void } = $props();
  let lineRef: Line;

  function onBoxClick() {
    if (session.choices.length > 0) return;      // choices handle their own clicks
    if (lineRef?.reveal()) return;               // first click completes the typewriter
    session.advance();                           // second click advances
    if (session.isFinished) onFinished?.();
  }
</script>

<div class="overlay">
  <div class="backdrop"></div>
  <button class="box" onclick={onBoxClick} aria-label="advance dialogue">
    <Nameplate speaker={session.speaker} />
    <Line bind:this={lineRef} text={session.line} />
  </button>
</div>

<style>
  .overlay { position: fixed; inset: 0; display: flex; align-items: flex-end; z-index: 10; }
  .backdrop { position: absolute; inset: 0;
    background: url('/design/background260709.png') center/cover no-repeat, rgba(0,0,0,0.35); }
  .box { position: relative; width: min(900px, 92vw); margin: 0 auto 6vh; text-align: left;
    background: rgba(12,14,18,0.72); backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 1.4rem 1.6rem;
    display: flex; flex-direction: column; gap: 0.8rem; cursor: pointer; }
</style>
