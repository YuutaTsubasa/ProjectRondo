<script lang="ts">
  import type { SoundCue } from '../../domain/audio/soundCue';
  import type { DialogueSession } from './dialogueSession.svelte';
  import Portrait from './Portrait.svelte';
  import Nameplate from './Nameplate.svelte';
  import Line from './Line.svelte';
  import Choices from './Choices.svelte';
  import Controls from './Controls.svelte';
  import Backlog from './Backlog.svelte';

  let { session, onFinished, playCue }:
    { session: DialogueSession; onFinished?: () => void; playCue?: (cue: SoundCue) => void } =
      $props();

  /** How long AUTO waits after a line finishes revealing before advancing. */
  const AUTO_ADVANCE_MS = 1200;

  let lineRef: Line | undefined = $state();
  let auto = $state(false);
  let showLog = $state(false);
  let lineDone = $state(false);

  // A modal is open, so the scene UI behind it must neither take focus nor act on Enter.
  const modalOpen = $derived(showLog || session.choices.length > 0);

  // Focus has to move INTO a modal and come back out. inert does not blur what it covers -- Chrome
  // leaves focus exactly where it was, which is now inside the inert subtree and so non-interactive
  // and out of the accessibility tree. The modals focus themselves on mount; this half remembers
  // where focus came from so it can be handed back.
  //
  // The capture runs in $effect.pre, before the DOM update applies inert: a normal $effect runs
  // after, by which point an engine that *does* implement the spec's focus fixup has already moved
  // activeElement to <body> and the saved value is useless.
  let focusBeforeModal: HTMLElement | null = null;
  $effect.pre(() => {
    if (modalOpen) focusBeforeModal ??= document.activeElement as HTMLElement | null;
  });
  $effect(() => {
    if (modalOpen || !focusBeforeModal) return;
    const target = focusBeforeModal;
    focusBeforeModal = null;
    if (target.isConnected) target.focus();
  });

  function advance() {
    session.advance();
    if (session.isFinished) { finish(); }
  }
  function finish() { auto = false; onFinished?.(); }
  // The confirm sounds before the selection, not after: `session.select` can end the dialogue, and
  // this component is unmounted the moment it does.
  function onSelect(i: number) { playCue?.('ui.confirm'); session.select(i); }
  function onBoxClick() {
    if (session.choices.length > 0) return;
    // The press sounds with the typewriter tick rather than a cue of its own, and before the branch
    // below because both of its outcomes are the same event: pressing the box puts text on screen,
    // whether by finishing the reveal or by starting the next line. Line.svelte holds the first tick
    // of a new line back by one throttle window so this and it do not land on top of each other.
    playCue?.('ui.type');
    if (lineRef?.reveal()) return;
    advance();
  }
  function skip() {
    // Bail after nodeCount steps: a terminating fast-forward visits each node at most once, so
    // exceeding that means a cyclic graph with no exit — stop rather than hang the tab.
    let guard = session.nodeCount;
    while (!session.isFinished && session.choices.length === 0 && guard-- > 0) session.advance();
    if (session.isFinished) finish();
  }

  // The typewriter is silent under a modal. A choice node carries its prompt line AND its choices,
  // so entering one remounts <Line> with that prompt at the same moment <Choices> opens — and the
  // panel is centred over the box and already shows the same text, in full, at once. The reveal
  // still runs (inert does not stop an interval, and onBoxClick returns early while choices are
  // open), so without this the player hears typing for text they are not reading and cannot skip,
  // under the panel's own move and confirm cues. The backlog covers the box the same way.
  const typed = () => { if (!modalOpen) playCue?.('ui.type'); };

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
      <!-- .box is a plain container. The advance affordance is the <button class="hit"> at the end,
           stretched over the whole box: a role="button" wrapper would prune everything inside it
           from the accessibility tree (button has presentational children) and its aria-label would
           replace the name, so the dialogue line — the primary content on screen — became
           unreachable. Keeping them siblings gives the line a path to assistive technology and still
           makes every pixel of the box, padding and arrow included, an advance target. -->
      <div class="box">
        <!-- The glass and the octagon silhouette. Separate from .box so .box stays unclipped and can
             paint its focus outline. -->
        <div class="pane" aria-hidden="true"></div>
        <!-- The inset ring: an evenodd clip-path over a solid fill, the outer octagon minus one
             inset by --octagon-ring. That inset is exact on the straight edges and about 1.41x
             wider across the four chamfers, since it is applied per axis rather than along the
             edge normal — which is what the kit's own artwork does too. -->
        <div class="ring" aria-hidden="true"></div>
        <!-- Positioned, so it paints above .pane. In-flow content would not: a positioned sibling
             with z-index auto paints after non-positioned content, so the glass would cover the text. -->
        <div class="content" aria-live="polite" aria-atomic="true">
          <!-- Five markers, static. The kit shows three filled and two hollow; nothing in the dialogue
               domain maps to them, so they are decoration rather than an invented progress readout. -->
          <div class="marks" aria-hidden="true">
            <span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span>
          </div>
          {#key session.line}
            <Line
              bind:this={lineRef}
              text={session.line}
              onDone={() => (lineDone = true)}
              onType={typed}
            />
          {/key}
        </div>
        <svg class="advance" width="30" height="18" viewBox="0 0 30 18" fill="none" aria-hidden="true"><path d="M0 9h26M20 3l6 6-6 6" /></svg>
        <div class="rail" aria-hidden="true"></div>
        <!-- Last, so it takes the clicks; stretched over the box so its padding and the arrow are
             part of the target. Carries the focus ring for the box. -->
        <button class="hit" onclick={onBoxClick} aria-label="advance dialogue"></button>
      </div>
    </div>
  </div>

  <!-- Both modals sit outside the inert wrapper, so they keep their own focus, and both are mounted
       conditionally rather than self-hiding: a fresh mount is what makes their focus effect run on
       mount. Choices self-hiding behind an inner {#if} left the component permanently mounted, and
       its focus landed early enough for Chrome to blur it again. -->
  {#if session.choices.length > 0}<Choices
      choices={session.choices}
      prompt={session.line}
      onSelect={onSelect}
      onMove={() => playCue?.('ui.move')}
    />{/if}
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
  }
  /* Stretched over the whole box, and last in the DOM so it is above the content for hit-testing.
     Transparent: the box's own layers draw everything. */
  .hit {
    position: absolute;
    inset: 0;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    outline: none;
  }
  .pane {
    position: absolute;
    inset: 0;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    clip-path: polygon(var(--octagon-chamfer) 0, calc(100% - var(--octagon-chamfer)) 0, 100% var(--octagon-chamfer), 100% calc(100% - var(--octagon-chamfer)), calc(100% - var(--octagon-chamfer)) 100%, var(--octagon-chamfer) 100%, 0 calc(100% - var(--octagon-chamfer)), 0 var(--octagon-chamfer));
    pointer-events: none;
  }
  .ring {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: var(--c-blue);
    clip-path: polygon(evenodd, var(--octagon-chamfer) 0, calc(100% - var(--octagon-chamfer)) 0, 100% var(--octagon-chamfer), 100% calc(100% - var(--octagon-chamfer)), calc(100% - var(--octagon-chamfer)) 100%, var(--octagon-chamfer) 100%, 0 calc(100% - var(--octagon-chamfer)), 0 var(--octagon-chamfer), var(--octagon-chamfer) 0, calc(var(--octagon-chamfer) + var(--octagon-ring)) var(--octagon-ring), calc(100% - var(--octagon-chamfer) - var(--octagon-ring)) var(--octagon-ring), calc(100% - var(--octagon-ring)) calc(var(--octagon-chamfer) + var(--octagon-ring)), calc(100% - var(--octagon-ring)) calc(100% - var(--octagon-chamfer) - var(--octagon-ring)), calc(100% - var(--octagon-chamfer) - var(--octagon-ring)) calc(100% - var(--octagon-ring)), calc(var(--octagon-chamfer) + var(--octagon-ring)) calc(100% - var(--octagon-ring)), var(--octagon-ring) calc(100% - var(--octagon-chamfer) - var(--octagon-ring)), var(--octagon-ring) calc(var(--octagon-chamfer) + var(--octagon-ring)), calc(var(--octagon-chamfer) + var(--octagon-ring)) var(--octagon-ring));
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
  .hit:focus-visible {
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
