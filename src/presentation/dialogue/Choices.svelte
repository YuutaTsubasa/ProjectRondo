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
    font-family: 'Archivo', system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.22em;
    color: rgba(255, 255, 255, 0.6);
  }
  .head .mark { width: 14px; height: 3px; background: #d8ff00; display: block; }
  .choice {
    display: flex;
    align-items: stretch;
    width: 100%;
    text-align: left;
    padding: 0;
    background: rgba(10, 10, 12, 0.62);
    backdrop-filter: blur(26px) saturate(140%);
    -webkit-backdrop-filter: blur(26px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #f2f3f5;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .choice .rail { width: 8px; background: #0000ff; display: block; flex: none; transition: background 0.12s ease; }
  .choice .label { padding: 16px 20px; font-size: 16px; }
  .choice:hover, .choice:focus-visible { background: rgba(24, 24, 28, 0.7); outline: none; }
  .choice:hover .rail, .choice:focus-visible .rail { background: #d8ff00; }
</style>
