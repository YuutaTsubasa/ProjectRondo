<script lang="ts">
  import type { DialogueChoice } from '../../domain/dialogue/dialogueChoice';
  let { choices, prompt, onSelect, onMove }:
    {
      choices: readonly DialogueChoice[];
      prompt: string;
      onSelect: (i: number) => void;
      onMove?: () => void;
    } = $props();

  /**
   * Sounds the move when focus arrives from another option in this panel.
   *
   * The panel has one selection, and it is the focused option: `pointerenter` below moves focus
   * rather than reporting a second kind of selection beside it, so "the selection moved" has exactly
   * one event and there is nothing to de-duplicate. `relatedTarget` on a focus event is the element
   * that lost it, which tells two of the three non-moves apart from a move without remembering
   * anything: a first mount's focus arrives from outside the panel (`<body>`, or null), and clicking
   * the option the pointer already selected fires no focus event at all.
   *
   * The third is the panel re-focusing itself, and `relatedTarget` cannot see it — which is what
   * `takingFocus` is for. When a choice's target is itself a choice node the panel is not remounted
   * (see the effect below), so the re-focus moves focus off the option just answered and onto the
   * first option of the new question: from one option to another, inside the panel, indistinguishable
   * from the player walking the list. It is the panel posing a question, not the player answering
   * one — and without this, answering on the second row sounded a move that answering on the first
   * did not, because there the unkeyed `{#each}` re-uses a button that already has focus and no
   * focus event fires at all.
   */
  let takingFocus = false;
  const moved = (from: EventTarget | null) => {
    if (takingFocus) return;
    if (from instanceof Node && panel?.contains(from)) onMove?.();
  };

  // Same as the backlog: this modal cannot be dismissed and must be answered, so it takes focus
  // rather than leaving it on whatever inert has just switched off behind the scrim.
  let panel: HTMLDivElement | undefined = $state();
  // Held so the pointer can cancel it: a panel that opens under a resting pointer gets a
  // `pointerenter` on the option beneath it, which selects that option, and the mount focus landing
  // afterwards would move the selection back to the first one — a move the player did not make.
  let mountFocus: ReturnType<typeof setTimeout> | undefined;
  // Deferred by a task, not a frame. Svelte effects run in the microtask after the DOM update, which
  // is still inside the click that opened this -- and Chrome then re-resolves focus for a click
  // target that inert has just switched off, undoing the focus set here. A task runs after that
  // fixup. requestAnimationFrame would too, except that a hidden page never paints, so a modal
  // opening in a backgrounded tab would never take focus at all.
  $effect(() => {
    // Depends on choices, not only on panel: a choice whose target also branches keeps
    // choices.length above zero, so the {#if} never remounts and panel never changes — and the
    // unkeyed {#each} can destroy the focused button, dropping focus to <body> while inert is on.
    choices;
    const first = panel?.querySelector('button');
    if (!first) return;
    mountFocus = setTimeout(() => {
      // `focus()` dispatches the focus event synchronously, so the flag covers exactly this panel's
      // own arrival and nothing the player does. `finally` because a focus handler may throw.
      takingFocus = true;
      try {
        first.focus();
      } finally {
        takingFocus = false;
      }
    });
    return () => clearTimeout(mountFocus);
  });
</script>

<!-- Full-screen takeover; the option list sits in the centre of the screen. -->
<div class="scrim">
  <div
    class="panel"
    bind:this={panel}
    role="dialog"
    aria-modal="true"
    aria-labelledby="choices-head"
    aria-describedby="choices-prompt"
  >
    <!-- The heading and the question share one glass block for the same reason each option has
         its own: the scrim is a wash now, so anything sitting straight on it would be read against
         whatever the camera happens to be pointing at. -->
    <div class="question">
      <h2 class="head" id="choices-head">SELECT AN ACTION</h2>
      <!-- The question is repeated here rather than left to the dialogue box behind: the panel is
           centred over the box at most viewport sizes, so the box is the one thing the player
           cannot count on seeing while answering. -->
      <p class="prompt" id="choices-prompt">{prompt}</p>
    </div>
    {#each choices as choice, i}
      <!-- Kit: a 1px frame with 4px padding around an inner block, and a caret prefix. -->
      <button
        class="choice"
        onclick={() => onSelect(i)}
        onfocus={(e) => moved(e.relatedTarget)}
        onpointerenter={(e) => {
          // The pointer moves the selection instead of running beside it, which is what a menu does
          // and what the fill already implied: hover and focus paint the same row the same way, so
          // two of them at once used to show two selected options. preventScroll because the scrim
          // scrolls -- a hover must not jump a partly visible option into view under the pointer.
          clearTimeout(mountFocus);
          e.currentTarget.focus({ preventScroll: true });
        }}
      >
        <span class="inner"><span class="caret" aria-hidden="true">❯</span><span>{choice.label}</span></span>
      </button>
    {/each}
  </div>
</div>

<style>
  /* A wash, not the opaque ground this used to be. Opaque was the right answer while .head and
     .prompt sat straight on it -- at 0.55 over the live scene the floor was rgb(67,88,140) and the
     heading fell to 2.54:1, so the camera decided whether it was readable. That is fixed at the
     source instead: every element this panel asks the player to READ or to READ A BOUNDARY FROM
     sits on the kit's glass, which is white at 0.62 and so composites no darker than rgb(158)
     whatever the camera is pointing at. --c-ink is 6.61:1 on it and --c-blue-deep 5.52:1
     (tokens.css). Nothing carrying meaning is left on the wash itself.

     What the wash still decides is the outline of the panel: the glass blocks and the gaps between
     them run from about 4.6:1 over a dark scene to 1.9:1 over a bright one. That is the silhouette
     of the modal, not a boundary anything has to be read from -- each option is framed on its own
     glass -- and it is the cost of showing the scene at all.

     Which matters because of what is behind it: the standing portrait, the dialogue box and the
     live hub. In an AVG the moment of choosing is a moment you are meant to still see the scene.

     0.42 is the one number here that is taste rather than measurement -- enough lavender to read as
     a takeover, little enough to leave the scene legible. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 12;
    display: flex;
    /* Scrolls, and centres with auto margins rather than align-items: a flex item centred by
       align-items is clipped at the START edge once it overflows, which here would put the heading
       and the first lines of the question permanently out of reach. The prompt is an authored
       dialogue line and the option list an authored list, so neither has a bound -- and this modal
       is deliberately undismissable, so an unreachable option is a dead end with no way out. */
    overflow-y: auto;
    padding: 24px 0;
    box-sizing: border-box;
    background: rgba(var(--c-blue-soft-rgb), 0.42);
    pointer-events: auto;
  }
  .panel {
    margin: auto;
    width: min(560px, 84vw);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* Same glass as an option, for the same reason. Not applied to .panel as a whole: each option
     would then be glass over glass, which washes them out against the ground they are supposed to
     stand on. One layer per block keeps every reading the kit measured. */
  .question {
    padding: 14px 16px;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
  }
  .head {
    /* An h2 so browse-mode has something to land on; its UA margins and size are overridden here so
       the change is semantic only. */
    margin: 0 0 6px;
    font: var(--font-panel-title);
    letter-spacing: var(--panel-title-tracking);
    color: var(--c-ink);
  }
  .prompt {
    margin: 0;
    font-family: var(--font-body);
    font-size: 18px;
    line-height: 1.7;
    color: var(--c-ink);
  }
  /* The glass is on the whole option, not on .inner as it was: the 1px frame is the only mark of
     where one option ends and the next begins, and on the wash it had no floor -- about 1.5:1 over a
     dark scene, 4.4:1 over a bright one, so mid-tone backdrops erased it. Now its inner neighbour is
     the glass, which is bounded, and the frame carries its own contrast the way the focus ring
     carries its halo.
     --c-blue-deep, not the kit's --c-blue, for the same reason .caret uses it: on the glass
     --c-blue is 2.33:1 at the worst backdrop, under the 3:1 a boundary needs; --c-blue-deep is
     5.52:1 (tokens.css). One glass layer per option either way -- .inner would be glass over glass. */
  .choice {
    display: block;
    width: 100%;
    text-align: left;
    padding: 4px;
    border: 1px solid var(--c-blue-deep);
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    cursor: pointer;
    font: inherit;
  }
  .inner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    color: var(--c-ink);
    font-family: var(--font-body);
    font-size: 14px;
    transition: background 0.12s ease, color 0.12s ease;
  }
  /* --c-blue-deep, not --c-blue: this is a glyph, and on the option's glass --c-blue is 4.52:1 even
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
  /* Hover and focus are the same option now -- the pointer moves focus rather than lighting a second
     row -- but focus still needs an indicator of its own: forced-colors mode overrides the fill
     while still honouring outline: none, and :focus-visible does not match a pointer's focus, so the
     ring is what a keyboard user has and the fill is what both have. */
  .choice:focus-visible {
    outline: var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
    box-shadow: var(--focus-halo);
  }
</style>
