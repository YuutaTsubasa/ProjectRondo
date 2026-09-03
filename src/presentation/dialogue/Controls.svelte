<script lang="ts">
  let { auto, onToggleAuto, onSkip, onToggleLog }:
    { auto: boolean; onToggleAuto: () => void; onSkip: () => void; onToggleLog: () => void } = $props();
</script>

<div class="controls">
  <button class:active={auto} aria-pressed={auto} onclick={onToggleAuto}><span class="mark"></span>AUTO</button>
  <button onclick={onSkip}><span class="mark"></span>SKIP</button>
  <button onclick={onToggleLog}><span class="mark"></span>LOG</button>
</div>

<style>
  .controls {
    position: absolute;
    top: 28px;
    right: 28px;
    display: flex;
    gap: 6px;
    pointer-events: auto;
  }
  .controls button {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    border: 1px solid var(--surface-border);
    padding: 8px 14px;
    font-family: var(--font-ui);
    font-weight: 800;
    font-size: 11px;
    letter-spacing: 0.16em;
    color: var(--c-ink);
    cursor: pointer;
  }
  .controls .mark { width: 14px; height: 3px; background: rgba(var(--c-ink-rgb), 0.2); display: block; }
  .controls button.active .mark { background: var(--c-lime); }
  .controls button:hover { background: rgba(var(--c-white-rgb), 0.85); }
</style>
