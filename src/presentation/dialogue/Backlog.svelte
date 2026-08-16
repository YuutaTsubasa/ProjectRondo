<script lang="ts">
  import type { BacklogEntry } from './dialogueSession.svelte';
  let { entries, onClose }: { entries: readonly BacklogEntry[]; onClose: () => void } = $props();
</script>

<div class="scrim">
  <div class="log">
    <header>
      <span class="rail"></span>
      <span class="title">對話回顧</span>
      <button class="close" onclick={onClose} aria-label="close log">×</button>
    </header>
    <ol>
      {#each entries as e}
        <li><span class="mark"></span><span class="who">{e.speaker}</span><span class="text">{e.line}</span></li>
      {/each}
    </ol>
  </div>
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 11;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(6, 7, 10, 0.45);
    pointer-events: auto;
  }
  .log {
    width: min(940px, 88vw);
    max-height: calc(100% - 140px);
    display: flex;
    flex-direction: column;
    background: rgba(10, 10, 12, 0.6);
    backdrop-filter: blur(30px) saturate(140%);
    -webkit-backdrop-filter: blur(30px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.5);
    padding: 0 24px 20px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 -24px 14px;
    padding: 10px 24px;
    background: linear-gradient(315deg, #d8ff00 0 10px, transparent 10px 14px, #eef0f2 14px);
  }
  header .rail { width: 9px; align-self: stretch; margin: -10px 0 -10px -24px; background: #0000ff; display: block; flex: none; }
  .title {
    font-family: 'Chakra Petch', 'Noto Sans TC', system-ui, sans-serif;
    font-weight: 700;
    color: #0b0b0d;
    letter-spacing: 0.04em;
  }
  .close { margin-left: auto; background: none; border: none; color: #0b0b0d; font-size: 20px; line-height: 1; cursor: pointer; }
  ol { list-style: none; margin: 0; padding: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
  li { display: flex; align-items: baseline; gap: 10px; font-size: 14px; line-height: 1.8; }
  .mark { width: 18px; height: 3px; background: #d8ff00; display: block; flex: none; transform: translateY(-4px); }
  .who { color: #d8ff00; font-weight: 700; flex: none; }
  .text { color: rgba(238, 240, 242, 0.85); }
</style>
