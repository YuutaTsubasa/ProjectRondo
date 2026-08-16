<script lang="ts">
  let { auto, onToggleAuto, onSkip, onToggleLog }:
    { auto: boolean; onToggleAuto: () => void; onSkip: () => void; onToggleLog: () => void } = $props();
</script>

<div class="controls">
  <button class:active={auto} onclick={onToggleAuto}>AUTO</button>
  <button onclick={onSkip}>SKIP</button>
  <button onclick={onToggleLog}>LOG</button>
</div>

<style>
  .controls { position: absolute; top: -2.4rem; right: 0; display: flex; gap: 0.5rem; }
  .controls button { color: #cdd6e0; background: rgba(12,14,18,0.72); border: 1px solid rgba(255,255,255,0.14);
    padding: 0.25rem 0.7rem; font-size: 0.75rem; letter-spacing: 0.08em; cursor: pointer; }
  .controls button.active { color: #4a90ff; border-color: #4a90ff; }
</style>
