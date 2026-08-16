<script lang="ts">
  import type { DialogueSession } from './dialogueSession.svelte';
  import Portrait from './Portrait.svelte';
  import Nameplate from './Nameplate.svelte';
  import Line from './Line.svelte';
  import Choices from './Choices.svelte';
  import Controls from './Controls.svelte';
  import Backlog from './Backlog.svelte';

  let { session, onFinished }: { session: DialogueSession; onFinished?: () => void } = $props();

  /** How long AUTO waits after a line finishes revealing before advancing. */
  const AUTO_ADVANCE_MS = 1200;

  let lineRef: Line | undefined = $state();
  let auto = $state(false);
  let showLog = $state(false);
  let lineDone = $state(false);

  function advance() {
    session.advance();
    if (session.isFinished) { finish(); }
  }
  function finish() { auto = false; onFinished?.(); }
  function onSelect(i: number) { session.select(i); }
  function onBoxClick() {
    if (session.choices.length > 0) return;
    if (lineRef?.reveal()) return;
    advance();
  }
  function onBoxKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBoxClick(); }
  }
  function skip() {
    // Bail after nodeCount steps: a terminating fast-forward visits each node at most once, so
    // exceeding that means a cyclic graph with no exit — stop rather than hang the tab.
    let guard = session.nodeCount;
    while (!session.isFinished && session.choices.length === 0 && guard-- > 0) session.advance();
    if (session.isFinished) finish();
  }

  // Reset the typewriter-done flag whenever the line changes ({#key session.line} remounts <Line>).
  $effect(() => { session.line; lineDone = false; });

  // AUTO: once the line finishes revealing, advance after a pause (only when not awaiting a choice).
  // Setting auto = false (e.g. via finish()) re-runs this effect and fires the cleanup.
  $effect(() => {
    if (auto && lineDone && session.choices.length === 0 && !session.isFinished) {
      const t = setTimeout(advance, AUTO_ADVANCE_MS);
      return () => clearTimeout(t);
    }
  });
</script>

<!-- Transparent layer over the live 3D hub — only the panels are opaque, so the scene shows through. -->
<div class="overlay">
  <!-- Standing character 立繪, behind the dialogue box and over the live 3D hub. -->
  <Portrait portrait={session.portrait} />

  <Controls {auto} onToggleAuto={() => (auto = !auto)} onSkip={skip} onToggleLog={() => (showLog = !showLog)} />

  <!-- Choices take over screen-centre with a full-screen frosted scrim (see Choices.svelte). -->
  <Choices choices={session.choices} onSelect={onSelect} />

  <div class="dock">
    <Nameplate speaker={session.speaker} />
    <div class="box">
      <div
        class="hit"
        role="button"
        tabindex="0"
        onclick={onBoxClick}
        onkeydown={onBoxKeydown}
        aria-label="advance dialogue"
      >
        {#key session.line}
          <Line bind:this={lineRef} text={session.line} onDone={() => (lineDone = true)} />
        {/key}
      </div>
      <div class="footer">
        <span class="mark" class:on={auto}></span>
        {#if auto}<span class="hint">AUTO</span>{/if}
      </div>
    </div>
  </div>

  {#if showLog}<Backlog entries={session.backlog} onClose={() => (showLog = false)} />{/if}
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10;
    pointer-events: none; /* let clicks fall through to the 3D canvas except on the panels below */
    font-family: 'Noto Sans TC', system-ui, sans-serif;
  }
  /* Bottom-anchored dialogue dock, matching the design's inset panels. */
  .dock {
    position: absolute;
    left: 28px;
    right: 28px;
    bottom: 28px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    pointer-events: none;
  }
  .box {
    align-self: stretch;
    /* Fixed, taller VN textbox: consistent height regardless of line length. */
    height: clamp(180px, 24vh, 240px);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    background: rgba(10, 10, 12, 0.55);
    backdrop-filter: blur(28px) saturate(140%);
    -webkit-backdrop-filter: blur(28px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
    padding: 22px 26px;
    pointer-events: auto;
  }
  .hit { flex: 1; cursor: pointer; outline: none; }
  .hit:focus-visible { outline: 1px solid rgba(216, 255, 0, 0.6); outline-offset: 4px; }
  .footer { display: flex; align-items: center; gap: 12px; margin-top: auto; min-height: 3px; }
  .mark { width: 20px; height: 3px; background: rgba(255, 255, 255, 0.22); display: block; }
  .mark.on { background: #d8ff00; }
  .hint {
    margin-left: auto;
    font-family: 'Archivo', system-ui, sans-serif;
    font-size: 12px;
    letter-spacing: 0.16em;
    color: #d8ff00;
  }
</style>
