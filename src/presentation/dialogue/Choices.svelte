<script lang="ts">
  import type { DialogueChoice } from '../../domain/dialogue/dialogueChoice';
  let { choices, onSelect }: { choices: readonly DialogueChoice[]; onSelect: (i: number) => void } = $props();
</script>

{#if choices.length > 0}
  <div class="choices">
    <div class="head"><span class="mark"></span>SELECT AN ACTION</div>
    {#each choices as choice, i}
      <button class="choice" onclick={() => onSelect(i)}>
        <span class="rail"></span>
        <span class="label">{choice.label}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .choices {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 4px;
    pointer-events: auto;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: 'Archivo', system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.22em;
    color: rgba(255, 255, 255, 0.55);
    padding-left: 2px;
  }
  .head .mark { width: 14px; height: 3px; background: #d8ff00; display: block; }
  .choice {
    display: flex;
    align-items: stretch;
    width: 100%;
    text-align: left;
    padding: 0;
    background: rgba(10, 10, 12, 0.55);
    backdrop-filter: blur(26px) saturate(140%);
    -webkit-backdrop-filter: blur(26px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #f2f3f5;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .choice .rail { width: 8px; background: #0000ff; display: block; flex: none; transition: background 0.12s ease; }
  .choice .label { padding: 13px 18px; font-size: 15px; }
  .choice:hover, .choice:focus-visible { background: rgba(22, 22, 26, 0.62); outline: none; }
  .choice:hover .rail, .choice:focus-visible .rail { background: #d8ff00; }
</style>
