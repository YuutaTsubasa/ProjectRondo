<script lang="ts">
  import type { DialogueSession } from './dialogueSession.svelte';
  import Portrait from './Portrait.svelte';
  import Nameplate from './Nameplate.svelte';
  import Line from './Line.svelte';
  import Choices from './Choices.svelte';
  import Controls from './Controls.svelte';
  import Backlog from './Backlog.svelte';

  let { session, onFinished }: { session: DialogueSession; onFinished?: () => void } = $props();

  /** How long AUTO waits after a line finishes revealing before advancing. */
  const AUTO_ADVANCE_MS = 1200;

  let lineRef: Line | undefined = $state();
  let auto = $state(false);
  let showLog = $state(false);
  let lineDone = $state(false);

  // A modal is open, so the scene UI behind it must neither take focus nor act on Enter.
  const modalOpen = $derived(showLog || session.choices.length > 0);

  // inert blurs whatever was focused inside .scene-ui, and nothing would catch it: a modal would
  // open with focus on <body>, and closing would leave it there — restarting the tab order twice
  // per visit. Remember what had focus and hand it back.
  let focusBeforeModal: HTMLElement | null = null;
  $effect(() => {
    if (modalOpen) {
      focusBeforeModal ??= document.activeElement as HTMLElement | null;
    } else if (focusBeforeModal) {
      focusBeforeModal.focus();
      focusBeforeModal = null;
    }
  });

  function advance() {
    session.advance();
    if (session.isFinished) { finish(); }
  }
  function finish() { auto = false; onFinished?.(); }
  function onSelect(i: number) { session.select(i); }
  function onBoxClick() {
    if (session.choices.length > 0) return;
    if (lineRef?.reveal()) return;
    advance();
  }
  function onBoxKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBoxClick(); }
  }
  function skip() {
    // Bail after nodeCount steps: a terminating fast-forward visits each node at most once, so
    // exceeding that means a cyclic graph with no exit — stop rather than hang the tab.
    let guard = session.nodeCount;
    while (!session.isFinished && session.choices.length === 0 && guard-- > 0) session.advance();
    if (session.isFinished) finish();
  }

  // Reset the typewriter-done flag whenever the line changes ({#key session.line} remounts <Line>).
  $effect(() => { session.line; lineDone = false; });

  // AUTO: once the line finishes revealing, advance after a pause (only when not awaiting a choice).
  // Setting auto = false (e.g. via finish()) re-runs this effect and fires the cleanup.
  $effect(() => {
    if (auto && lineDone && !modalOpen && !session.isFinished) {
      const t = setTimeout(advance, AUTO_ADVANCE_MS);
      return () => clearTimeout(t);
    }
  });
</script>

<!-- Transparent layer over the live 3D hub — only the panels are opaque, so the scene shows through. -->
<div class="overlay">
  <!-- Everything the two modals cover. Both are opaque full-screen panels, so without inert a Tab
       walks straight out of them onto controls nobody can see -- and Enter on the dialogue box would
       advance the session behind the panel the user is reading. -->
  <div class="scene-ui" inert={modalOpen}>
    <!-- Standing character 立繪, behind the dialogue box and over the live 3D hub. -->
    <Portrait portrait={session.portrait} />

    <Controls {auto} onToggleAuto={() => (auto = !auto)} onSkip={skip} onToggleLog={() => (showLog = !showLog)} />

    <div class="dock">
      <Nameplate speaker={session.speaker} />
      <!-- The whole box is the advance target, not an inner element: the arrow sits in the box's
           bottom padding, which a flex child cannot reach. -->
      <div
        class="box"
        role="button"
        tabindex="0"
        onclick={onBoxClick}
        onkeydown={onBoxKeydown}
        aria-label="advance dialogue"
      >
        <!-- The glass and the octagon silhouette. Separate from .box so .box stays unclipped and can
             paint its focus outline. -->
        <div class="pane" aria-hidden="true"></div>
        <!-- The 2px inset ring, drawn as an evenodd clip-path over a solid fill: the outer octagon
             minus an octagon inset by 2px leaves the ring between them. -->
        <div class="ring" aria-hidden="true"></div>
        <!-- Positioned, so it paints above .pane. In-flow content would not: a positioned sibling
             with z-index auto paints after non-positioned content, so the glass would cover the text. -->
        <div class="content">
          <!-- Five markers, static. The kit shows three filled and two hollow; nothing in the dialogue
               domain maps to them, so they are decoration rather than an invented progress readout. -->
          <div class="marks" aria-hidden="true">
            <span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span>
          </div>
          {#key session.line}
            <Line bind:this={lineRef} text={session.line} onDone={() => (lineDone = true)} />
          {/key}
        </div>
        <svg class="advance" width="30" height="18" viewBox="0 0 30 18" fill="none" aria-hidden="true"><path d="M0 9h26M20 3l6 6-6 6" /></svg>
        <div class="rail" aria-hidden="true"></div>
      </div>
    </div>
  </div>

  <!-- Both modals sit outside the inert wrapper, so they keep their own focus. -->
  <Choices choices={session.choices} prompt={session.line} onSelect={onSelect} />
  {#if showLog}<Backlog entries={session.backlog} onClose={() => (showLog = false)} />{/if}
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10;
    pointer-events: none; /* let clicks fall through to the 3D canvas except on the panels below */
    font-family: var(--font-body);
    color: var(--c-ink);
  }
  /* Geometrically identical to .overlay, so the absolutely positioned children inside it resolve
     against the same box. It exists only to carry inert. */
  .scene-ui { position: absolute; inset: 0; pointer-events: none; }
  /* Bottom-anchored dialogue dock, centred. The kit insets the box at left:140 right:34 of 960 to
     leave room for the standing portrait, but that 11-point asymmetry reads as a right-shift at
     other aspect ratios. These insets keep the kit's box WIDTH -- 786 of 960, ~82% -- and centre
     it instead. */
  .dock {
    position: absolute;
    left: 9%;
    right: 9%;
    bottom: 28px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    pointer-events: none;
  }
  /* The octagon lives on .pane, not here. clip-path clips an element's whole rendering, outline
     included, so a clipped .box could not paint a focus ring: outline-offset puts the ring outside
     the border box, which is exactly the region the clip removes. Keeping .box unclipped is what
     makes the focus indicator visible at all. */
  .box {
    align-self: stretch;
    position: relative;
    box-sizing: border-box;
    min-height: clamp(150px, 20vh, 200px);
    padding: 20px 24px 28px;
    pointer-events: auto;
    cursor: pointer;
    outline: none;
  }
  .pane {
    position: absolute;
    inset: 0;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    clip-path: polygon(18px 0, calc(100% - 18px) 0, 100% 18px, 100% calc(100% - 18px), calc(100% - 18px) 100%, 18px 100%, 0 calc(100% - 18px), 0 18px);
    pointer-events: none;
  }
  .ring {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: var(--c-blue);
    clip-path: polygon(evenodd, 18px 0, calc(100% - 18px) 0, 100% 18px, 100% calc(100% - 18px), calc(100% - 18px) 100%, 18px 100%, 0 calc(100% - 18px), 0 18px, 18px 0, 20px 2px, calc(100% - 20px) 2px, calc(100% - 2px) 20px, calc(100% - 2px) calc(100% - 20px), calc(100% - 20px) calc(100% - 2px), 20px calc(100% - 2px), 2px calc(100% - 20px), 2px 20px, 20px 2px);
  }
  .content { position: relative; }
  .marks {
    display: flex;
    gap: 5px;
    margin-bottom: 12px;
  }
  .marks span {
    width: 8px;
    height: 8px;
    background: var(--c-ink);
    transform: rotate(45deg);
    display: block;
  }
  .marks span.on { background: var(--c-blue); }
  /* The ring sits OUTSIDE the glass -- outline-offset puts it beyond .box's border box, while the
     glass is .pane at inset 0 -- so its backdrop is the live 3D scene, not the panel any of this
     file's contrast figures were measured against. A single colour cannot clear 3:1 against a
     backdrop that changes with the camera. The halo fixes that: the ring's adjacent colour is the
     white band it sits inside, not the scene, so the indicator carries its own contrast. */
  .box:focus-visible {
    outline: var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
    box-shadow: var(--focus-halo);
  }
  .advance {
    position: absolute;
    right: 26px;
    bottom: 16px;
    stroke: var(--c-ink);
    stroke-width: 1.6;
    pointer-events: none;
  }
  /* The kit's dashed rail down the right edge. */
  .rail {
    position: absolute;
    right: 8px;
    top: 12px;
    bottom: 12px;
    width: 11px;
    border: 1px solid var(--c-blue);
    background: var(--rail-dash);
    pointer-events: none;
  }
</style>
