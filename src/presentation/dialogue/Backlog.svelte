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
  /* Like Choices' scrim, deliberately off the surface tokens — it dims the scene behind the modal. */
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
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    border: 1px solid var(--surface-border);
    /* Lowered from 0.5 with the flip to a pale panel. */
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.28);
    padding: 0 24px 20px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 -24px 14px;
    padding: 10px 24px;
    background: linear-gradient(315deg, var(--c-lime) 0 10px, transparent 10px 14px, var(--c-pale) 14px);
  }
  header .rail { width: 9px; align-self: stretch; margin: -10px 0 -10px -24px; background: var(--c-blue); display: block; flex: none; }
  .title {
    font-family: var(--font-headline);
    font-weight: 700;
    color: var(--c-ink);
    letter-spacing: 0.04em;
  }
  .close { margin-left: auto; background: none; border: none; color: var(--c-ink); font-size: 20px; line-height: 1; cursor: pointer; }
  ol { list-style: none; margin: 0; padding: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
  li { display: flex; align-items: baseline; gap: 10px; font-size: 14px; line-height: 1.8; }
  .mark { width: 18px; height: 3px; background: var(--c-lime); display: block; flex: none; transform: translateY(-4px); }
  /* Was lime, which is ~1.2:1 on a pale panel. Blue for every speaker: the style sheet's yellow
     "unknown speaker" has no state behind it in this codebase (see the design doc, 4f).
     --c-blue itself is 2.65:1 as text against the darkest panel the glass can produce, under
     the 4.5:1 threshold, so this uses the deep variant instead. */
  .who { color: var(--c-blue-deep); font-weight: 700; flex: none; }
  .text { color: rgba(var(--c-ink-rgb), 0.85); }
</style>
