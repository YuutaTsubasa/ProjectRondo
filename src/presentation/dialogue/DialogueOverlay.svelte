<script lang="ts">
  import {createExitMotion} from '../motion/exitMotion.svelte';
  const exit=createExitMotion(360);
  import type { SoundCue } from '../../domain/audio/soundCue';
  import type { DialogueSession } from './dialogueSession.svelte';
  import HudIdentity from '../hud/HudIdentity.svelte';
  import ChapterHeader, { type DialogueChapter } from './ChapterHeader.svelte';
  import HudWaves from '../hud/HudWaves.svelte';
  import Portrait from './Portrait.svelte';
  import Nameplate from './Nameplate.svelte';
  import Line, { TYPE_MIN_MS } from './Line.svelte';
  import Choices from './Choices.svelte';
  import Controls from './Controls.svelte';
  import Backlog from './Backlog.svelte';

  let { session, onFinished, playCue, showPortrait = true, chapter }:
    { session: DialogueSession; onFinished?: () => void; playCue?: (cue: SoundCue) => void; showPortrait?: boolean; chapter?: DialogueChapter } =
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

  /** When the last typing tick sounded, on the monotonic clock. See {@link typeCue}. */
  let lastType = Number.NEGATIVE_INFINITY;
  /**
   * Sounds one typing tick, at most one per {@link TYPE_MIN_MS}, whichever of the two generators
   * asked for it.
   *
   * `ui.type` has two sources and they play the same 60 ms sample: `<Line>`'s reveal, paced by its
   * own accumulator, and the press below. Neither can see the other — the press fires knowing
   * nothing about when the line last ticked — and a press lands at an arbitrary point inside the
   * reveal's 72 ms cycle, so a press that reveals-all, the commonest press in a typewriter UI,
   * mostly started a second `ui.type` while the first was still sounding. `soundBank.play` starts a
   * fresh instance per call rather than restarting the sound, and hands out a different recording
   * each time, so the two genuinely stacked. `TYPE_MIN_MS`'s "consecutive ticks never overlap" only
   * ever held inside one `<Line>`.
   *
   * The bound belongs here rather than in either component because this is the only place both
   * generators meet: the overlay owns `playCue`, so every `ui.type` in the dialogue passes through
   * this function. `<Line>` keeps its accumulator as the reveal's cadence — which character asks —
   * and this is what decides whether the ask is granted.
   *
   * First come, first served, with no exemption for the press, because at the moment two ticks
   * collide the reveal's has already been played and only the press's is still refusable: exempting
   * the press is the same as not having the bound. And a held press tick is not the box going
   * silent. The tick it is held behind sounded under 70 ms earlier — well inside the window a sound
   * is still heard as answering the press that landed in it — and the reveal it interrupts stops
   * with it, so the player hears one tick around the press either way, which is the whole point of
   * the tick. The exemption would buy the smeared double-hit instead.
   *
   * A press on a line that has finished revealing — every advance taken at reading speed, and the
   * one that ends the dialogue — comes after a gap no reveal is filling and so sounds. What is held
   * is a press landing inside 70 ms of a tick the reveal just paid out: the reveal-all, and an
   * advance taken within a breath of the last character. `dialogueCues.test.ts` stands on both
   * sides of that edge rather than leaving this paragraph to be taken on trust.
   *
   * `performance.now()`, not `Date.now()`, for the reason Choices.svelte gives at `MOVE_MIN_MS`: it
   * is monotonic, so a clock adjustment cannot leave the box silent for however far the clock
   * jumped back.
   */
  function typeCue() {
    const now = performance.now();
    if (now - lastType < TYPE_MIN_MS) return;
    lastType = now;
    playCue?.('ui.type');
  }

  function advance() {
    session.advance();
    if (session.isFinished) { finish(); }
  }
  function finish() { auto = false; exit.run(()=>onFinished?.()); }
  // No `finish()` here, unlike `advance()`, and that is not an oversight: `select` cannot end the
  // dialogue. `step`'s `awaitingChoice` branch returns the chosen target's own state -- `speaking`
  // or another `awaitingChoice` -- or the unchanged state when the target is a dangling ref;
  // `{ kind: 'ended' }` is reachable only from a `speaking` node whose exit is `end`. So this
  // component outlives every selection, and the cue's position around `select` is free.
  function onSelect(i: number) { if(exit.leaving)return; playCue?.('ui.confirm'); session.select(i); }
  function onBoxClick() {
    if(exit.leaving)return;
    if (session.choices.length > 0) return;
    // The press sounds with the typewriter tick rather than a cue of its own, and before the branch
    // below because the tick belongs to the press, not to what the press turns out to do. There are
    // three of those: finishing the reveal, starting the next line, and -- on a completed final line
    // -- falling through `advance()` into `finish()`, which unmounts this component. The last one
    // puts no text on screen, and asks for a tick like the other two: the box acknowledges every
    // press the same way, and going silent on the one press that takes the box away would read as a
    // press that missed. Via typeCue, which is what keeps this and the reveal's ticks off each
    // other, and which answers all three of these alike.
    typeCue();
    if (lineRef?.reveal()) return;
    advance();
  }
  function skip() {
    if(exit.leaving)return;
    // Bail after nodeCount steps: a terminating fast-forward visits each node at most once, so
    // exceeding that means a cyclic graph with no exit — stop rather than hang the tab.
    let guard = session.nodeCount;
    while (!session.isFinished && session.choices.length === 0 && guard-- > 0) session.advance();
    if (session.isFinished) finish();
  }

  // The typewriter is silent under a modal. A choice node carries its prompt line AND its choices,
  // so entering one remounts <Line> with that prompt at the same moment <Choices> opens.
  // The prompt remains in the dock, with a full accessible copy inside the modal. The reveal
  // still runs (inert does not stop an interval, and onBoxClick returns early while choices are
  // open), so without this the player hears typing for text they are not reading and cannot skip,
  // under the panel's own move and confirm cues. The backlog covers the box the same way.
  //
  // The modal check is outside typeCue, not inside it: a tick suppressed here makes no sound, so it
  // must not consume the window and silence the next one that would.
  const typed = () => { if (!modalOpen) typeCue(); };

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

<div data-input-scope data-dialogue class="overlay" class:with-chapter={!!chapter} class:leaving={exit.leaving} inert={exit.leaving}>
  <div class="atmosphere" aria-hidden="true"></div>
  <div class="avg-waves"><HudWaves edges={false} paused={showLog}/></div>
  <div class="edge-mark left" aria-hidden="true">✦</div><div class="edge-mark right" aria-hidden="true">✦</div>
  <div class="scene-ui" inert={modalOpen}>
    <div class="avg-identity"><HudIdentity/></div>
    {#if chapter}<ChapterHeader {chapter}/>{/if}
    <!-- Standing character 立繪, behind the dialogue box and over the live 3D hub. -->
    {#if showPortrait}<Portrait portrait={session.portrait} />{/if}

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
        <!-- Fine upper rim; the glass fades into the waves below. -->
        <div class="ring" aria-hidden="true"></div>
        <!-- Positioned, so it paints above .pane. In-flow content would not: a positioned sibling
             with z-index auto paints after non-positioned content, so the glass would cover the text. -->
        <div class="content" aria-live="polite" aria-atomic="true">
          {#key session.line}
            <Line
              bind:this={lineRef}
              text={session.line}
              immediate={exit.leaving}
              onDone={() => (lineDone = true)}
              onType={typed}
            />
          {/key}
        </div>
        <svg class="advance" class:ready={lineDone && !modalOpen} width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true"><path d="M22 9 35 22 22 35 9 22Z"/><path class="core" d="m22 16 6 6-6 6-6-6Z"/><path d="M22 0v6M22 38v6M0 22h6M38 22h6"/></svg>
        <!-- Last, so it takes the clicks; stretched over the box so its padding and the arrow are
             part of the target. Carries the focus ring for the box. -->
        <button class="hit" data-game-entry onclick={onBoxClick} aria-label="advance dialogue"></button>
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
  .overlay{position:fixed;inset:0;z-index:10;pointer-events:none;font-family:var(--font-body);color:var(--avg-text);isolation:isolate;animation:avg-in .36s ease-out both}
  .atmosphere{position:absolute;inset:0;background:linear-gradient(180deg,rgba(var(--avg-navy-rgb),.48),transparent 18%,transparent 55%,rgba(var(--avg-navy-rgb),.35)),linear-gradient(90deg,rgba(var(--avg-navy-rgb),.22),transparent 30%,transparent 80%,rgba(var(--avg-navy-rgb),.23))}
  .scene-ui{position:absolute;inset:0;pointer-events:none}
  .edge-mark{position:absolute;bottom:29%;height:80px;width:1px;background:linear-gradient(transparent,var(--avg-light),transparent);color:var(--avg-light);font-size:15px;line-height:80px;text-indent:-6px;opacity:.6}.edge-mark.left{left:1.2cqw}.edge-mark.right{right:1.2cqw}
  .avg-identity{position:absolute;inset:0;z-index:5;pointer-events:none}
  .avg-waves{position:absolute;inset:0;z-index:4;pointer-events:none}
  .dock{position:absolute;z-index:3;left:8%;right:8%;bottom:max(66px,7.5cqh);display:flex;flex-direction:column;align-items:flex-start;pointer-events:none;animation:dock-in .42s .06s ease-out both}
  .box{align-self:stretch;position:relative;box-sizing:border-box;min-height:clamp(155px,20cqh,225px);padding:clamp(25px,3.7cqh,40px) 12.7% 48px;pointer-events:auto}
  .pane{position:absolute;inset:0;pointer-events:none;clip-path:polygon(28px 0,calc(100% - 28px) 0,100% 30px,100% calc(100% - 28px),calc(100% - 28px) 100%,28px 100%,0 calc(100% - 28px),0 30px);background:linear-gradient(110deg,rgba(var(--avg-navy-rgb),.93),rgba(var(--avg-navy-rgb),.83) 60%,rgba(var(--avg-navy-rgb),.78));mask-image:linear-gradient(to bottom,black 55%,rgba(0,0,0,.4));backdrop-filter:blur(8px)}
  .ring{position:absolute;inset:0;pointer-events:none;border-top:1px solid rgba(var(--c-blue-soft-rgb),.7);clip-path:polygon(var(--octagon-chamfer) 0,calc(100% - var(--octagon-chamfer)) 0,100% var(--octagon-chamfer),100% 100%,0 100%,0 var(--octagon-chamfer));box-shadow:inset 0 var(--octagon-ring) 20px rgba(var(--c-blue-soft-rgb),.07)}
  .box:before,.box:after{content:'✧';position:absolute;top:35%;font:36px Georgia,serif;color:var(--avg-light);text-shadow:0 0 12px var(--avg-glow)}.box:before{left:-14px}.box:after{right:-14px}
  .content{position:relative;text-shadow:0 1px 4px rgba(var(--avg-navy-rgb),.8)}
  .hit{position:absolute;inset:0;background:none;border:0;padding:0;cursor:pointer;outline:none}
  .hit:focus-visible{outline:none}
  .box:has(.hit:focus-visible) .advance{opacity:1;outline:1px dashed var(--avg-light);outline-offset:3px;filter:drop-shadow(0 0 9px var(--avg-glow))}
  .advance{position:absolute;right:8.5%;bottom:20px;stroke:var(--avg-light);stroke-width:1.4;opacity:0;filter:drop-shadow(0 0 6px var(--avg-glow));pointer-events:none;transition:opacity .25s}.advance.ready{opacity:1;animation:advance-pulse 1.8s ease-in-out infinite}.core{fill:var(--avg-light);stroke:none}
  .overlay :global(.portrait){animation:portrait-in .48s ease-out both}
  .overlay.leaving{animation:avg-out .36s ease-in both}
  .leaving .dock{animation:dock-out .36s ease-in both}
  .leaving :global(.portrait){animation:portrait-out .36s ease-in both}
  @keyframes avg-in{from{opacity:0}to{opacity:1}}@keyframes avg-out{from{opacity:1}to{opacity:0}}
  @keyframes portrait-in{from{opacity:0;translate:24px 0}to{opacity:1;translate:0 0}}
  @keyframes portrait-out{to{opacity:0;translate:24px 0}}@keyframes dock-out{to{opacity:0;transform:translateY(22px)}}
  @keyframes advance-pulse{50%{transform:translateY(4px);filter:drop-shadow(0 0 12px var(--avg-glow))}}@keyframes dock-in{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
  .avg-identity{--hud-scale:1.4}
  @container game-ui (min-width:2500px){.avg-identity{--hud-scale:1.65}}
  @media(prefers-reduced-motion:reduce){.overlay,.overlay.leaving,.dock,.leaving .dock,.advance.ready,.overlay :global(.portrait){animation:none}.advance{transition:none}}
</style>
