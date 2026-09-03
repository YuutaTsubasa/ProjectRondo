<script lang="ts">
  import type { DialogueChoice } from '../../domain/dialogue/dialogueChoice';
  let { choices, onSelect }: { choices: readonly DialogueChoice[]; onSelect: (i: number) => void } = $props();
</script>

{#if choices.length > 0}
  <!-- Full-screen dark frosted scrim; the option list sits in the centre of the screen. -->
  <div class="scrim">
    <div class="panel">
      <div class="head"><span class="mark"></span>SELECT AN ACTION</div>
      {#each choices as choice, i}
        <button class="choice" onclick={() => onSelect(i)}>
          <span class="rail"></span>
          <span class="label">{choice.label}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* The scrim is deliberately NOT on the surface tokens: it dims the 3D scene behind the modal,
     so it stays dark even though the choices above it are light. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 12;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(6, 7, 10, 0.55);
    backdrop-filter: blur(12px) saturate(120%);
    -webkit-backdrop-filter: blur(12px) saturate(120%);
    pointer-events: auto;
  }
  .panel {
    width: min(560px, 84vw);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
    font-family: var(--font-ui);
    font-size: 11px;
    letter-spacing: 0.22em;
    /* NOT ink: .panel has no background, so this label sits on the dark scrim, not on a panel. */
    color: rgba(var(--c-white-rgb), 0.6);
  }
  .head .mark { width: 14px; height: 3px; background: var(--c-lime); display: block; }
  .choice {
    display: flex;
    align-items: stretch;
    width: 100%;
    text-align: left;
    padding: 0;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    border: 1px solid var(--surface-border);
    color: var(--c-ink);
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .choice .rail { width: 8px; background: var(--c-blue); display: block; flex: none; transition: background 0.12s ease; }
  .choice .label { padding: 16px 20px; font-size: 16px; }
  /* Hover brightens toward white now; as a dark panel it brightened toward dark. */
  .choice:hover, .choice:focus-visible { background: rgba(var(--c-white-rgb), 0.85); outline: none; }
  .choice:hover .rail, .choice:focus-visible .rail { background: var(--c-lime); }
</style>
