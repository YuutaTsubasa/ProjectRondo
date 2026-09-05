<script lang="ts">
  import type { BacklogEntry } from './dialogueSession.svelte';
  let { entries, onClose }: { entries: readonly BacklogEntry[]; onClose: () => void } = $props();

  // A modal has to take focus, or it opens with focus parked on the control that opened it -- which
  // inert has just made non-interactive. Nothing else would announce that a full-screen panel arrived.
  let closeButton: HTMLButtonElement | undefined = $state();
  // Deferred by a task, for the same reason as Choices: LOG lives inside .scene-ui, so the click
  // that opens this panel targets an element inert switches off in the same flush. A task rather
  // than a frame, because a hidden page never paints.
  $effect(() => {
    const button = closeButton;
    if (!button) return;
    const id = setTimeout(() => button.focus());
    return () => clearTimeout(id);
  });
</script>

<!-- A full-screen opaque panel must be dismissable from the keyboard, not only by finding its
     close button again. -->
<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div class="scrim">
  <!-- role=dialog, not a bare landmark: this inerts everything behind it, takes focus, and closes on
       Escape, so it is a modal by every behaviour. Moving focus to a button named "close log" does
       not announce the panel -- region-entry announcement on programmatic focus is inconsistent,
       and NVDA does not do it by default. -->
  <div
    class="log"
    role="dialog"
    aria-modal="true"
    aria-labelledby="backlog-head"
  >
    <!-- A div, not <header>: a div[role=dialog] is not a sectioning root (only the <dialog> element
         is), so a <header> here maps to the page's banner landmark, nested inside the modal. And an
         h2 rather than a span, so browse mode has something to land on -- matching Choices. -->
    <div class="head">
      <h2 id="backlog-head">BACKLOG</h2>
      <button class="close" bind:this={closeButton} onclick={onClose} aria-label="close log">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 4l16 16M20 4L4 20" /></svg>
      </button>
    </div>
    <!-- The kit's stroked display word, sitting behind the list. -->
    <span class="stamp" aria-hidden="true">LOG</span>
    <!-- tabindex so the scroll region is reachable from the keyboard. This is the panel's only
         scrollable area and it holds no focusable children, so without it the older half of a long
         log is pointer-only. Chrome focuses such scrollers on its own; that is a Chrome behaviour,
         and the one panel whose whole purpose is re-reading what scrolled past should not depend
         on it. Labelled by the same heading as the dialog. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="scroll" tabindex="0" role="region" aria-labelledby="backlog-head">
      <ol>
      {#each entries as e}
        <li>
          <span class="node" aria-hidden="true"></span>
          <span class="who">{e.speaker}</span>
          <p class="text">{e.line}</p>
        </li>
      {/each}
      </ol>
    </div>
    <span class="rail" aria-hidden="true"></span>
  </div>
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 11;
    display: flex;
    pointer-events: auto;
  }
  /* Opaque, not glass. The kit draws this panel on the same 0.62 glass as everything else, but a
     full-screen log has nothing to gain from showing the scene through it -- and on glass the kit's
     own blue speaker names fall to 2.34:1 over a dark scene. On solid --c-pale they are 5.60:1, so
     going opaque is what makes the kit's colour choice work rather than a departure from it. */
  .log {
    position: relative;
    flex: 1;
    box-sizing: border-box;
    padding: 20px 24px;
    background: var(--c-pale);
    border: 1px solid var(--c-blue);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: var(--font-headline);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 3px;
    color: var(--c-blue);
  }
  /* UA heading margins and size overridden: the change is semantic only. */
  .head h2 {
    margin: 0;
    font: inherit;
    letter-spacing: inherit;
  }
  .close {
    background: none;
    border: none;
    /* Padding out to a 44px target, pulled back by an equal negative margin so the icon does not
       move. At padding: 0 this was a 16px hit area -- against 72px HUD tiles in the same UI, and on
       a touch pointer it is the panel's only dismissal, since Escape is keyboard-only. */
    padding: 14px;
    margin: -14px;
    cursor: pointer;
    display: flex;
    stroke: var(--c-blue);
    stroke-width: 1.8;
  }
  .stamp {
    position: absolute;
    left: 150px;
    top: 24px;
    font-family: var(--font-display);
    font-size: 120px;
    line-height: 0.9;
    color: transparent;
    -webkit-text-stroke: 2px var(--c-blue);
    pointer-events: none;
    user-select: none;
  }
  /* Timeline: a hairline spine with a node per entry. The spine lives on each li rather than as a
     border on the scrolling ol, so it scrolls with the content and the nodes need no negative
     offset -- a node at a negative left would be clipped by the ol's own overflow. */
  /* The scroll region, not the list: a focusable <ol role=region> would lose its list semantics,
     so the wrapper takes the role and the tab stop and the list stays a list. */
  .scroll {
    margin-top: 104px;
    overflow: auto;
    flex: 1;
  }
  .scroll:focus-visible {
    outline: var(--focus-ring);
    outline-offset: calc(var(--focus-ring-offset) * -1);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    position: relative;
    padding: 9px 8px 10px 26px;
    border-bottom: 1px solid rgba(var(--c-blue-soft-rgb), 0.35);
  }
  li::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--c-blue-soft);
  }
  .node {
    position: absolute;
    left: 0;
    top: 18px;
    width: 11px;
    height: 11px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 1px solid var(--c-blue);
    background: var(--c-pale);
  }
  .who {
    font-family: var(--font-headline);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 2px;
    color: var(--c-blue);
  }
  .text {
    margin: 3px 0 0;
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.6;
    color: var(--c-ink);
    white-space: pre-line;
  }
  .rail {
    position: absolute;
    right: 10px;
    top: 120px;
    width: 12px;
    height: 180px;
    border: 1px solid var(--c-blue);
    background: var(--rail-dash);
    pointer-events: none;
  }
</style>
