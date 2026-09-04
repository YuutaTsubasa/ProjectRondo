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

<p class="line">{shown}{#if !complete}<span class="caret" aria-hidden="true">▌</span>{/if}</p>

<style>
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
    color: var(--c-blue);
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
