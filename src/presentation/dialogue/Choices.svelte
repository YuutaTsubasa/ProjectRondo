<script lang="ts">
  import type { DialogueChoice } from '../../domain/dialogue/dialogueChoice';
  let { choices, onSelect }: { choices: readonly DialogueChoice[]; onSelect: (i: number) => void } = $props();
</script>

{#if choices.length > 0}
  <!-- Full-screen takeover; the option list sits in the centre of the screen. -->
  <div class="scrim">
    <div class="panel">
      <div class="head">SELECT AN ACTION</div>
      {#each choices as choice, i}
        <!-- Kit: a 1px frame with 4px padding around an inner block, and a caret prefix. -->
        <button class="choice" onclick={() => onSelect(i)}>
          <span class="inner"><span class="caret">❯</span><span class="label">{choice.label}</span></span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* The kit's takeover ground: a blue-soft wash rather than a dark scrim. Its menu and save/load
     screens use the same treatment, and unlike a dark scrim it keeps the UI in one light key. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 12;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--c-blue-soft-rgb), 0.55);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    pointer-events: auto;
  }
  .panel {
    width: min(560px, 84vw);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    font-family: var(--font-headline);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 3px;
    color: var(--c-ink);
    margin-bottom: 4px;
  }
  .choice {
    display: block;
    width: 100%;
    text-align: left;
    padding: 4px;
    border: 1px solid var(--c-blue);
    background: none;
    cursor: pointer;
    font: inherit;
  }
  .inner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    color: var(--c-ink);
    font-family: var(--font-body);
    font-size: 14px;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .caret { color: var(--c-blue); }
  /* Hover fills the inner block and cuts its bottom-right corner. White on a solid --c-blue block
     is 6.26:1; blue text on the glass would be 2.34:1, so the fill carries the colour. */
  .choice:hover .inner,
  .choice:focus-visible .inner {
    background: var(--c-blue);
    color: rgb(var(--c-white-rgb));
    font-weight: 700;
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
  }
  .choice:hover .caret,
  .choice:focus-visible .caret { color: rgb(var(--c-white-rgb)); }
  .choice:focus-visible { outline: none; }
</style>
