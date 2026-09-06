<script module lang="ts">
  /**
   * Shortest gap between two move cues, in milliseconds.
   *
   * Nothing bounds how fast the selection can change. A `pointermove` fires for every pixel the
   * pointer travels, so a mouse swept down the list — or wiggled over the boundary between two
   * options — moves it as often as the pointer reports, a few tens of milliseconds apart, and Tab
   * held down under key auto-repeat does the same at around thirty a second. `soundBank.play`
   * starts a fresh instance per call rather than restarting the sound (that is what lets two
   * footsteps overlap with their own gains), so every one of those is another voice.
   *
   * The bound is not the 300 ms the sample runs for (`tools/audio/preprocess.mjs` cuts `ui_move` at
   * 0.3 s). Measured off the shipped file in 10 ms windows, it is a decaying blip rather than a
   * 300 ms tone: peak at the start, and by the window at t=100 ms the peak is 12.6 dB down from the
   * first window's peak and the RMS is 12.4 dB down from the first window's RMS — so a move landing
   * past that window puts a new attack over a tail instead of over another attack.
   *
   * Which is also why this is not `TYPE_MIN_MS`'s rule of "never overlap at all". A typing tick is
   * decoration and a dropped one is invisible, so `Line.svelte` can afford to clear the whole
   * sample; a move cue answers something the player just did, and a deliberate walk down a list at
   * four or five rows a second has to sound on every row. 100 ms caps this at ten a second — past
   * anything reachable by pressing a key at a time — and what it actually catches is the sweep and
   * the held key, where the list is a blur and one sound per 100 ms reads as motion rather than as
   * a pile.
   */
  const MOVE_MIN_MS = 100;
</script>

<script lang="ts">
  import type { DialogueChoice } from '../../domain/dialogue/dialogueChoice';
  let { choices, prompt, onSelect, onMove }:
    {
      choices: readonly DialogueChoice[];
      prompt: string;
      onSelect: (i: number) => void;
      onMove?: () => void;
    } = $props();

  let silentFocus = false;
  /** When the last move sounded, on the monotonic clock. See {@link MOVE_MIN_MS}. */
  let lastMove = Number.NEGATIVE_INFINITY;
  /**
   * Sounds the move when focus arrives from another option in this panel, at most one per
   * {@link MOVE_MIN_MS}.
   *
   * The panel has one selection, and it is the focused option: the pointer moves focus rather than
   * reporting a second kind of selection beside it, so "the selection moved" has exactly one event
   * and there is nothing to de-duplicate. `relatedTarget` on a focus event is the element that LOST
   * focus -- not where the pointer came from -- and that is enough to tell the arrival that is not a
   * move apart from a move without remembering anything: focus reaching this panel from outside it
   * (`<body>`, the scrim, or null) means the panel had none, which is only ever the opening, either
   * the mount focus itself or the pointer that beats it in the race `moveSelectionTo` settles.
   * Afterwards the selection is always on an option, so every later arrival is a move -- the pointer
   * coming in from off the list onto a different option included, since it carries the option that
   * had focus and the selection genuinely did change. Clicking the option the pointer already
   * selected fires no focus event at all.
   *
   * The one arrival from inside the panel that is not a move is the panel re-focusing itself, which
   * `relatedTarget` cannot tell from a move, so it is silenced at its source by `silentFocus`: when
   * a choice's target is itself a choice node the panel is not remounted (see the effect below), so
   * the re-focus moves focus off the option just answered and onto the first option of the new
   * question. It is the panel posing a question, not the player answering one — and without this,
   * answering on the second row sounded a move that answering on the first did not, because there
   * the unkeyed `{#each}` re-uses a button that already has focus and no focus event fires at all.
   */
  const moved = (from: EventTarget | null) => {
    if (silentFocus) return;
    if (!(from instanceof Node) || !panel?.contains(from)) return;
    // The throttle is on the SOUND and on nothing else: the selection follows the pointer at
    // whatever rate the pointer moves, which is the panel doing what it is told, and it is only the
    // 300 ms sample that cannot keep up. `performance.now()`, not `Date.now()`: it is monotonic, so
    // a clock adjustment cannot leave this silent for however far the clock jumped back.
    const now = performance.now();
    if (now - lastMove < MOVE_MIN_MS) return;
    lastMove = now;
    onMove?.();
  };

  /**
   * Puts the selection on the option the pointer moved over.
   *
   * The pointer moves the selection instead of running beside it, which is what a menu does and what
   * the fill now follows: the fill is on `:focus`, so there is one selected row and this is what
   * puts the pointer's row in it.
   *
   * `pointermove`, not `pointerenter`. The rule is that the POINTER moves the selection, and that is
   * the event that means the pointer moved; `pointerenter` means only that the element under the
   * pointer changed, which happens to a pointer lying still. The scrim scrolls -- see its comment in
   * the style block, neither the prompt nor the option list has a bound -- so a wheel taken to read
   * the rest of the list drags a different option under a resting pointer and fires one, and so does
   * the scroll Tab performs to bring its target into view. Acted on, the first moves the selection
   * and sounds a move for a pointer that never moved; the second pulls the selection straight back
   * off the option Tab just reached and sounds on top of the move Tab already made. `preventScroll`
   * keeps THIS focus call from scrolling, and says nothing about a scroll arriving from elsewhere.
   *
   * That also settles the opening with no state of its own: a panel appearing under a resting pointer
   * fires no `pointermove`, so the mount focus below keeps the first option and nothing sounds -- and
   * the moment the player does move, the selection follows and sounds once, like any other move.
   * `clearTimeout` for the one order that still races: a pointer that moves inside the task the mount
   * focus is queued in has chosen a row, and the panel's opening focus must not take it back.
   */
  const moveSelectionTo = (option: HTMLButtonElement) => {
    clearTimeout(mountFocus);
    option.focus({ preventScroll: true });
  };

  // Same as the backlog: this modal cannot be dismissed and must be answered, so it takes focus
  // rather than leaving it on whatever inert has just switched off behind the scrim.
  let panel: HTMLDivElement | undefined = $state();
  // The task the opening focus below is queued in, held so `moveSelectionTo` can cancel it — see
  // its doc comment for why a pointer that gets there first wins.
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
      silentFocus = true;
      try {
        first.focus();
      } finally {
        silentFocus = false;
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
        onpointermove={(e) => moveSelectionTo(e.currentTarget)}
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

     What the wash still decides is the outline of the panel: the glass blocks against the gaps
     between them run from 4.87:1 over a black scene down to 1.26:1 over a white one. Both ends are
     the composite, not the token -- over white the gap is rgb(199,215,255) and the block
     rgb(234,240,255) -- and they are pure black and pure white on purpose, the same two extremes
     the frame's 1.5:1 / 4.4:1 pair further down is measured against: stopping the bright end at a
     mid-grey scene of about rgb(150) reads 1.98:1, more than half again the contrast the panel
     actually has at its worst, and against extremes the other range in this file does not use. That is the silhouette
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
     --c-blue is 2.34:1 at the worst backdrop, under the 3:1 a boundary needs; --c-blue-deep is
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
  /* --c-blue-deep, not --c-blue: this is a glyph, so it wants the 4.5:1 text wants, and on the
     option's glass --c-blue is 2.34:1. It read 4.52:1 -- a hair over the line -- only because that
     was measured on glass over the opaque ground this panel no longer has. --c-blue-deep is 5.52:1
     (tokens.css). Both figures are against the glass floor rgb(158) the comments above use, which is
     the glass over a black scene: the 0.42 wash sits under it too and only lightens the ground
     (rgb(178,184,199), where the two are 3.14:1 and 7.41:1), so the floor is what to hold to. */
  .caret { color: var(--c-blue-deep); }
  /* The selected option fills its inner block and cuts its bottom-right corner. White on a solid
     --c-blue block is 6.26:1; blue text on the glass would be 2.34:1, so the fill carries the colour.

     :focus, not :hover and :focus-visible. The selection is the focused option and the pointer moves
     focus to the row it moves over, so :focus alone paints the row the pointer chose AND the row the
     keyboard walked to -- one filled row, and always the one Enter confirms. The pair it replaces
     could not promise either: :hover paints on its own wherever the pointer happens to rest, so
     Shift+Tab away from a hovered row filled two rows at once; and :focus-visible does not match a
     pointer's focus, so after a click on a chained question the only filled row was the hovered one,
     which is not the option focus was moved to. */
  .choice:focus .inner {
    background: var(--c-blue);
    color: rgb(var(--c-white-rgb));
    font-weight: 700;
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
  }
  .choice:focus .caret { color: rgb(var(--c-white-rgb)); }
  /* The fill above already marks the focused option, but focus still needs an indicator of its own:
     forced-colors mode overrides the fill while still honouring outline: none. :focus-visible rather
     than :focus, because that is the whole difference between the two -- a pointer user is told
     where the selection is by the fill and does not need a ring following the mouse; a keyboard user
     gets both. */
  .choice:focus-visible {
    outline: var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
    box-shadow: var(--focus-halo);
  }
</style>
