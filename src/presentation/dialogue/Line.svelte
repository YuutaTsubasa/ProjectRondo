<script lang="ts">
  let { text, charMs = 24, onDone }: { text: string; charMs?: number; onDone?: () => void } = $props();
  let shown = $state('');
  let complete = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  const finish = () => { shown = text; complete = true; clearInterval(timer); onDone?.(); };

  $effect(() => {
    shown = ''; complete = false;
    let i = 0;
    clearInterval(timer);
    timer = setInterval(() => {
      i++; shown = text.slice(0, i);
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
