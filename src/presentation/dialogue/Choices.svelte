<script lang="ts">
  import type { DialogueChoice } from '../../domain/dialogue/dialogueChoice';
  let { choices, prompt, onSelect }:
    { choices: readonly DialogueChoice[]; prompt: string; onSelect: (i: number) => void } = $props();
</script>

{#if choices.length > 0}
  <!-- Full-screen takeover; the option list sits in the centre of the screen. -->
  <div class="scrim">
    <div class="panel">
      <div class="head">SELECT AN ACTION</div>
      <!-- The line that poses the question. The scrim is opaque, so the dialogue box is not readable
           behind it -- without this the player is answering a question they cannot see. -->
      <p class="prompt">{prompt}</p>
      {#each choices as choice, i}
        <!-- Kit: a 1px frame with 4px padding around an inner block, and a caret prefix. -->
        <button class="choice" onclick={() => onSelect(i)}>
          <span class="inner"><span class="caret">❯</span><span>{choice.label}</span></span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* The kit's takeover ground, and opaque rather than a wash. At 0.55 over the live scene the
     ground's floor was rgb(67,88,140), where .head's ink is 2.54:1 -- the scene decided whether the
     heading was readable. Solid --c-blue-soft is the light lavender the kit's menu and save/load
     screens show, and it puts ink at 6.99:1 regardless of the camera. Nothing needs to be seen
     through a modal that has taken the whole screen. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 12;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--c-blue-soft);
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
  .prompt {
    margin: 0 0 6px;
    font-family: var(--font-body);
    font-size: 18px;
    line-height: 1.7;
    color: var(--c-ink);
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
  /* --c-blue-deep, not --c-blue: this is a glyph, and on the inner glass --c-blue is 4.52:1 even
     over the opaque ground -- too close to the 4.5 line to rest on. --c-blue-deep is 10.66:1. */
  .caret { color: var(--c-blue-deep); }
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
  /* Hover and focus share the fill, so focus needs an indicator of its own -- otherwise a keyboard
     user whose pointer rests on another row sees two rows in the same state, and forced-colors
     mode overrides the fill while still honouring outline: none. */
  .choice:focus-visible {
    outline: var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
    box-shadow: var(--focus-halo);
  }
</style>
