<script module lang="ts">
  /**
   * Shortest gap between two typing ticks, in milliseconds.
   *
   * The reveal runs a character every `charMs` — 24 by default — while the tick sample is 60 ms long,
   * so one sound per character would stack three deep and read as a machine gun rather than as
   * typing. 70 keeps consecutive ticks from overlapping at all.
   */
  const TYPE_MIN_MS = 70;
</script>

<script lang="ts">
  let { text, charMs = 24, onDone, onType }:
    { text: string; charMs?: number; onDone?: () => void; onType?: () => void } = $props();
  let shown = $state('');
  let complete = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  const finish = () => { shown = text; complete = true; clearInterval(timer); onDone?.(); };

  $effect(() => {
    shown = ''; complete = false;
    let i = 0;
    // Starts at the threshold so the first character sounds: typing that begins with 70 ms of
    // silence reads as a dropped cue rather than as a deliberate rhythm.
    let sinceTick = TYPE_MIN_MS;
    clearInterval(timer);
    timer = setInterval(() => {
      i++; shown = text.slice(0, i);
      // Accumulating `charMs` rather than reading a clock: it is the interval this timer was given,
      // so the throttle stays right when a caller slows the reveal down — past TYPE_MIN_MS every
      // character sounds, which is what a slow typewriter should do. `finish()` deliberately makes
      // no sound: reveal-all draws the rest of the line at once, and one tick per skipped character
      // is the burst this throttle exists to prevent.
      sinceTick += charMs;
      if (sinceTick >= TYPE_MIN_MS) { sinceTick = 0; onType?.(); }
      if (i >= text.length) finish();
    }, charMs);
    return () => clearInterval(timer);
  });

  /** Reveal-all on first click; the parent decides advance on the second. Returns true if it completed now. */
  export function reveal(): boolean { if (!complete) { finish(); return true; } return false; }
</script>

<!-- The visible text is the typewriter's partial reveal, and it is aria-hidden: inside the live
     region it would announce a character at a time. The full line goes to assistive technology in
     one piece instead — a typewriter is a visual effect, not information. -->
<p class="line" aria-hidden="true">{shown}{#if !complete}<span class="caret">▌</span>{/if}</p>
<span class="sr-only">{text}</span>

<style>
  /* Visually hidden, still announced. */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  .line {
    margin: 0;
    font-family: var(--font-body);
    font-size: 21px;
    line-height: 1.8;
    color: var(--c-ink);
    white-space: pre-line;
    min-height: 76px;
    text-wrap: pretty;
  }
  /* The kit's typing caret. Shown only while revealing — the arrow at the box's bottom-right is
     what indicates "click to advance" once the line is complete, so a caret that outlived the
     reveal would be a second, contradictory affordance. */
  .caret {
    /* --c-blue-deep, not --c-blue: the caret is a glyph on the glass, where --c-blue is 2.34:1. */
    color: var(--c-blue-deep);
    animation: caret-blink 1s steps(1) infinite;
  }
  @keyframes caret-blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .caret { animation: none; }
  }
</style>
