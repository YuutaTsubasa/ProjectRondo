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
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.6);
    padding: 8px 14px;
    font-family: 'Archivo', system-ui, sans-serif;
    font-weight: 800;
    font-size: 11px;
    letter-spacing: 0.16em;
    color: #0b0b0d;
    cursor: pointer;
  }
  .controls .mark { width: 14px; height: 3px; background: rgba(11, 11, 13, 0.2); display: block; }
  .controls button.active .mark { background: #d8ff00; }
  .controls button:hover { background: rgba(255, 255, 255, 0.85); }
</style>
