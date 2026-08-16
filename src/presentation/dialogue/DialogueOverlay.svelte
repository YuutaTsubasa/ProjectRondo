<script lang="ts">
  import type { DialogueSession } from './dialogueSession.svelte';
  import Nameplate from './Nameplate.svelte';
  import Line from './Line.svelte';
  import Choices from './Choices.svelte';
  import Controls from './Controls.svelte';
  import Backlog from './Backlog.svelte';

  let { session, onFinished }: { session: DialogueSession; onFinished?: () => void } = $props();
  let lineRef: Line | undefined = $state();
  let auto = $state(false);
  let showLog = $state(false);
  let lineDone = $state(false);
  let autoTimer: ReturnType<typeof setTimeout> | undefined;

  function advance() {
    session.advance();
    if (session.isFinished) { finish(); }
  }
  function finish() { auto = false; clearTimeout(autoTimer); onFinished?.(); }
  function onSelect(i: number) { session.select(i); }
  function onBoxClick() {
    if (session.choices.length > 0) return;
    if (lineRef?.reveal()) return;
    advance();
  }
  function skip() { while (!session.isFinished && session.choices.length === 0) session.advance();
    if (session.isFinished) finish(); }

  // AUTO: once the current line finishes revealing, advance after a pause (only when not awaiting a choice).
  $effect(() => {
    clearTimeout(autoTimer);
    if (auto && lineDone && session.choices.length === 0 && !session.isFinished)
      autoTimer = setTimeout(advance, 1200);
  });

  // Reset the typewriter-done flag whenever the line changes ({#key session.line} remounts <Line>).
  $effect(() => { session.line; lineDone = false; });
</script>

<div class="overlay">
  <div class="backdrop"></div>
  <div class="box-wrap">
    <Controls {auto} onToggleAuto={() => (auto = !auto)} onSkip={skip} onToggleLog={() => (showLog = !showLog)} />
    <button class="box" onclick={onBoxClick} aria-label="advance dialogue">
      <Nameplate speaker={session.speaker} />
      {#key session.line}
        <Line bind:this={lineRef} text={session.line} onDone={() => (lineDone = true)} />
      {/key}
      <Choices choices={session.choices} onSelect={onSelect} />
    </button>
  </div>
  {#if showLog}<Backlog entries={session.backlog} onClose={() => (showLog = false)} />{/if}
</div>

<style>
  .overlay { position: fixed; inset: 0; display: flex; align-items: flex-end; z-index: 10; }
  .backdrop { position: absolute; inset: 0;
    background: url('/design/background260709.png') center/cover no-repeat, rgba(0,0,0,0.35); }
  .box-wrap { position: relative; width: min(900px, 92vw); margin: 0 auto 6vh; }
  .box { position: relative; width: 100%; text-align: left; background: rgba(12,14,18,0.72);
    backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
    padding: 1.4rem 1.6rem; display: flex; flex-direction: column; gap: 0.8rem; cursor: pointer; }
</style>
