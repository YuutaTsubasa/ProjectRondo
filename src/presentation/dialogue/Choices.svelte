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
   * decoration and a dropped one is invisible, so `DialogueOverlay.typeCue` can afford to clear the
   * whole sample; a move cue answers something the player just did, and a deliberate walk down a
   * list at four or five rows a second has to sound on every row. 100 ms caps this at ten a second
   * — past anything reachable by pressing a key at a time — and what it actually catches is the
   * sweep and the held key, where the list is a blur and one sound per 100 ms reads as motion
   * rather than as a pile.
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
  /** The option holding the selection, or `null` before any option has. See {@link moved}. */
  let selected: HTMLButtonElement | null = null;
  /** When the last move sounded, on the monotonic clock. See {@link MOVE_MIN_MS}. */
  let lastMove = Number.NEGATIVE_INFINITY;
  /**
   * Sounds the move when the selection changes option, at most one per {@link MOVE_MIN_MS}.
   *
   * The panel has one selection, and it is the focused option: the pointer moves focus rather than
   * reporting a second kind of selection beside it, so there is exactly one event to watch and
   * nothing to de-duplicate. What that event is NOT is the move itself. A `focus` means only that
   * the browser resolved focus onto this option, which it also does for an option that already had
   * it -- most often when the window or the tab regains focus, where every focused element in the
   * document is re-focused where it stands and the player, who was in another application, moved
   * nothing. So the selection is held here rather than counted, and the move is read off it: a move
   * is a `focus` that finds the selection somewhere ELSE, and everything else is not one.
   *
   * That is what `selected` is, and holding the option rather than a flag is what makes both of the
   * arrivals that are not moves fall out of the same comparison instead of each needing a guard of
   * its own. `previous === null` is the panel's opening -- either the mount focus or the pointer
   * that beats it in the race `moveSelectionTo` settles, and until one of them lands there is no
   * selection for a move to have come from. `previous === option` is the re-focus above, and with it
   * the whole class: focus can leave the options without leaving the modal, and coming back to the
   * row it left is the selection reappearing where the player put it, not travelling to it. The
   * opening used to be read off `relatedTarget` -- "focus from outside the panel means the panel had
   * none, which is only ever the opening" -- and that claim was false, because `.scrim` takes
   * pointer events and nothing inside it but the options is focusable, so a click on the wash, on
   * the gaps or on the prompt blurred the selection to `<body>` without leaving the modal and the
   * player's way back in then read as an opening and went silent. `onpointerdown` on the scrim now
   * keeps that blur from happening at all; recording the option is what makes the rule hold whatever
   * route focus leaves and returns by.
   *
   * One arrival IS a change of option and still must not sound: the panel re-focusing itself, which
   * is why `silentFocus` survives as a flag. When a choice's target is itself a choice node the
   * panel is not remounted (see the effect below), so the re-focus moves focus off the option just
   * answered and onto the first option of the new question -- a real move, made by the panel posing
   * a question rather than by the player answering one, and the only thing that can tell the two
   * apart is who called `focus()`. Without it, answering on the second row sounded a move that
   * answering on the first did not, because there the unkeyed `{#each}` re-uses a button that
   * already has focus and no focus event fires at all.
   */
  const moved = (option: HTMLButtonElement) => {
    const previous = selected;
    selected = option;
    if (silentFocus || previous === null || previous === option) return;
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

  /**
   * Keeps the selection where it is when a press lands on the scrim rather than on an option.
   *
   * Moving focus is the default action of a press, and on everything in this panel but an option
   * that default is to move it to nothing: `.scrim` covers the viewport with `pointer-events: auto`,
   * and neither it, `.panel` nor `.question` is focusable, so a press on the wash, on the 10px gaps
   * or on the prompt text blurred the focused option to `<body>`. The modal cannot be dismissed and
   * the fill is `:focus`-only, so what that left on screen was an unanswerable question with no
   * option selected. Cancelled here instead, which is the one point where the press is still
   * cancellable -- `pointerdown`'s default action is the compatibility mouse events, `mousedown`
   * among them, and it is `mousedown` that moves focus.
   *
   * A press ON an option is left alone, or the option could never take focus and the panel would be
   * unusable by pointer. The cost is that the prompt cannot be selected with the mouse, which is
   * what the backlog is for.
   */
  const keepFocus = (e: PointerEvent) => {
    const target = e.target;
    if (target instanceof Element && target.closest('button')) return;
    e.preventDefault();
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
<!-- svelte-ignore a11y_no_static_element_interactions -- the handler cancels a default action rather
     than adding an interaction; there is nothing here for a keyboard to reach it with. -->
<div class="scrim" onpointerdown={keepFocus}>
  <div
    class="panel" data-input-scroll
    bind:this={panel}
    role="dialog"
    aria-modal="true"
    aria-labelledby="choices-head"
    aria-describedby="choices-prompt"
  >
    <!-- Accessible modal heading and prompt; the visible line remains in the dialogue dock. -->
    <div class="question">
      <h2 class="head" id="choices-head">SELECT AN ACTION</h2>

      <p class="prompt" id="choices-prompt">{prompt}</p>
    </div>
    {#each choices as choice, i}
      <!-- The focused option is the single selected row for both pointer and keyboard. -->
      <button
        class="choice"
        onclick={() => onSelect(i)}
        onfocus={(e) => moved(e.currentTarget)}
        onpointermove={(e) => moveSelectionTo(e.currentTarget)}
      >
        <span class="inner"><svg class="diamond" viewBox="0 0 32 32" aria-hidden="true"><path d="m16 2 14 14-14 14L2 16Z"/><path class="core" d="m16 10 6 6-6 6-6-6Z"/></svg><span class="label">{choice.label}</span><svg class="caret" viewBox="0 0 16 24" aria-hidden="true"><path d="m4 4 8 8-8 8"/></svg></span>
      </button>
    {/each}
  </div>
</div>

<style>
  .scrim{position:fixed;inset:0;z-index:12;display:flex;box-sizing:border-box;padding:90px 0;overflow:clip;background:rgba(var(--avg-navy-rgb),.08);pointer-events:auto}
  .panel{max-height:100%;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;margin:auto;width:min(520px,72cqw);display:flex;flex-direction:column;gap:14px;padding:12px 24px}
  /* The line remains visible in the dock; retain its full copy as the modal description. */
  .question{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  .choice{position:relative;display:block;flex-shrink:0;width:100%;border:0;padding:1px;background:transparent;color:var(--avg-text);font:inherit;text-align:center;cursor:pointer;transition:transform .2s,filter .2s;isolation:isolate}
  .choice:before,.choice:after{content:'';position:absolute;inset:0;z-index:-1;clip-path:polygon(24px 0,calc(100% - 24px) 0,100% 50%,calc(100% - 24px) 100%,24px 100%,0 50%)}
  .choice:before{background:rgba(var(--c-blue-soft-rgb),.7)}
  .choice:after{inset:1px 2px;background:rgba(var(--avg-navy-rgb),.87)}
  .inner{display:flex;align-items:center;gap:18px;min-height:55px;padding:5px 24px;box-sizing:border-box;font:400 clamp(17px,1.3cqw,22px)/1.55 var(--font-body);letter-spacing:.06em}
  .label{flex:1;overflow-wrap:anywhere}.diamond{flex:none;width:30px;height:30px;fill:none;stroke:var(--avg-muted);stroke-width:1}.core{fill:transparent}.caret{flex:none;width:13px;height:24px;stroke:var(--avg-light);stroke-width:1.6;fill:none;opacity:0}
  .choice:focus{outline:none;transform:scale(1.06);filter:drop-shadow(0 0 5px var(--avg-glow)) drop-shadow(0 0 12px rgba(var(--c-blue-soft-rgb),.45))}
  .choice:focus:before{background:var(--avg-light)}.choice:focus:after{background:linear-gradient(90deg,rgba(var(--avg-navy-rgb),.95),rgba(var(--avg-navy-rgb),.8));box-shadow:inset 0 0 18px var(--avg-glow)}
  .choice:focus .diamond{stroke:var(--avg-light);stroke-width:2;filter:drop-shadow(0 0 5px var(--avg-glow))}.choice:focus .core{fill:var(--avg-light)}.choice:focus .caret{opacity:1}
  @container game-ui (max-width:700px){.scrim{padding:90px 0 39cqh}.panel{width:80cqw;padding:12px 16px;gap:12px}.inner{padding:5px 19px;min-height:50px;gap:10px;font-size:16px}.diamond{width:24px;height:24px}}
  @container game-ui (max-height:540px) and (min-width:701px){.scrim{padding:65px 0 175px}.panel{gap:8px}.inner{min-height:40px;font-size:16px}.diamond{width:24px;height:24px}}
  @media(prefers-reduced-motion:reduce){.choice{transition:none}}
  @media(forced-colors:active){.choice{border:1px solid ButtonText}.choice:focus{outline:var(--focus-ring);outline-offset:var(--focus-ring-offset)}.choice:before,.choice:after{display:none}.choice:focus .caret{stroke:ButtonText}}
</style>
