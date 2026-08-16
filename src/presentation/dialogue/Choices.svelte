<script lang="ts">
  import type { DialogueChoice } from '../../domain/dialogue/dialogueChoice';
  let { choices, onSelect }: { choices: readonly DialogueChoice[]; onSelect: (i: number) => void } = $props();
</script>

{#if choices.length > 0}
  <ul class="choices" role="listbox" aria-label="SELECT AN ACTION">
    {#each choices as choice, i}
      <li><button class="choice" onclick={() => onSelect(i)}>{choice.label}</button></li>
    {/each}
  </ul>
{/if}

<style>
  .choices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .choice { width: 100%; text-align: left; padding: 0.7rem 1rem; color: #f4f6f8;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(90,150,255,0.5);
    border-left: 3px solid #4a90ff; border-radius: 4px; cursor: pointer; }
  .choice:hover { background: rgba(74,144,255,0.18); }
</style>
