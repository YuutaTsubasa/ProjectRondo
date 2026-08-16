<script lang="ts">
  import type { BacklogEntry } from './dialogueSession.svelte';
  let { entries, onClose }: { entries: readonly BacklogEntry[]; onClose: () => void } = $props();
</script>

<div class="log">
  <header>對話回顧 <button onclick={onClose} aria-label="close log">×</button></header>
  <ol>
    {#each entries as e}
      <li><span class="who">{e.speaker}</span> {e.line}</li>
    {/each}
  </ol>
</div>

<style>
  .log { position: absolute; inset: 8% 8% 12%; background: rgba(8,10,14,0.92); backdrop-filter: blur(14px);
    border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 1.2rem; overflow-y: auto; z-index: 11; }
  .log header { display: flex; justify-content: space-between; color: #fff; font-weight: 700; margin-bottom: 0.8rem; }
  .log ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; color: #dfe6ee; }
  .who { color: #4a90ff; margin-right: 0.6rem; }
  .log button { background: none; border: none; color: #cdd6e0; font-size: 1.2rem; cursor: pointer; }
</style>
