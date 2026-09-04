<script lang="ts">
  let { auto, onToggleAuto, onSkip, onToggleLog }:
    { auto: boolean; onToggleAuto: () => void; onSkip: () => void; onToggleLog: () => void } = $props();
</script>

<!-- Kit: 72x72 glass squares, top-right. The kit's HUD block is icon-over-label, but it ships the
     icons as {{ h.icon }} placeholders with no paths, so these are label-only until icons arrive. -->
<div class="controls">
  <button class:active={auto} aria-pressed={auto} onclick={onToggleAuto}>AUTO</button>
  <button onclick={onSkip}>SKIP</button>
  <button onclick={onToggleLog}>LOG</button>
</div>

<style>
  .controls {
    position: absolute;
    top: 18px;
    right: 18px;
    display: flex;
    gap: 10px;
    pointer-events: auto;
  }
  .controls button {
    width: 72px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    border: none;
    font-family: var(--font-headline);
    font-weight: 700;
    font-size: 15px;
    line-height: 1;
    letter-spacing: 1px;
    color: var(--c-ink);
    cursor: pointer;
    transition: color 0.12s ease;
  }
  .controls button:hover,
  .controls button:focus-visible { color: var(--c-blue); outline: none; }
  /* AUTO's lit state. The dialogue box carries no AUTO indicator in the kit, so this button is the
     only place the mode is visible -- it reads as a filled tile rather than a colour shift. */
  .controls button.active {
    background: var(--c-blue);
    color: rgb(var(--c-white-rgb));
  }
</style>
